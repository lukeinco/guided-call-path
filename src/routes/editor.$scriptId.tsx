import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
  type Connection,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import { Info, Trash2, Plus, BookOpen, X, Download, Upload } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useActingOrg } from "@/lib/acting-org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BASE_SECTION_TYPES,
  SECTION_TYPE_DEFINITION,
  SECTION_TYPE_LABEL,
  newObjectionId,
  newResponseId,
  type ScriptDefinition,
  type ScriptObjection,
  type ScriptResponse,
  type ScriptStep,
} from "@/lib/script-types";

export const Route = createFileRoute("/editor/$scriptId")({
  ssr: false,
  component: ScriptEditor,
  validateSearch: (s: Record<string, unknown>) => ({
    openStep: typeof s.openStep === "string" ? s.openStep : undefined,
    addResponse: s.addResponse === 1 || s.addResponse === "1" ? 1 : undefined,
  }),
});

const NODE_W = 280;
const NODE_MIN_H = 120;

function tintFor(section: string): string {
  let h = 0;
  for (let i = 0; i < section.length; i++) h = (h * 31 + section.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 55% 88%)`;
}

function truncate(s: string, n: number) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

type StepNodeData = {
  step: ScriptStep;
  unreachable: boolean;
  onMakeEntry: (stepId: string) => void;
};

function StepNode({ data }: NodeProps) {
  const { step, unreachable, onMakeEntry } = data as unknown as StepNodeData;
  const section = step.section_type ?? null;
  return (
    <div
      className="relative bg-card px-4 py-3"
      style={{
        width: NODE_W,
        minHeight: NODE_MIN_H,
        border: `1px ${unreachable ? "dashed" : "solid"} rgba(43,43,40,0.2)`,
        borderColor: unreachable ? "rgba(196, 74, 24, 0.55)" : undefined,
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: "#2B2B28", width: 8, height: 8, border: 0 }}
      />
      <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
        {step.is_entry && <span className="text-iron">Entry{step.entry_scenario ? ` · ${step.entry_scenario}` : ""}</span>}
        {!step.is_entry && section && (
          <span
            className="rounded-sm px-1.5 py-0.5 text-[9px]"
            style={{ background: tintFor(section), color: "#2B2B28" }}
          >
            {SECTION_TYPE_LABEL[section] ?? section}
          </span>
        )}
        {!step.is_entry && !section && <span>Step</span>}
        <span className="ml-auto font-mono normal-case text-[9px] opacity-60">{step.id}</span>
      </div>
      <p className="mt-2 font-serif text-[15px] leading-snug text-foreground">
        {truncate(step.caller_line || "(empty step)", 140)}
      </p>

      {step.responses.length > 0 && (
        <div className="mt-3 space-y-1">
          {step.responses.map((r) => (
            <div
              key={r.id}
              className="relative flex items-center gap-2 rounded-sm border border-hairline/70 bg-parchment/40 px-2 py-1 text-[11px]"
              style={r.is_most_likely ? { borderColor: "#C44A18" } : undefined}
            >
              {r.is_most_likely && <span className="h-1.5 w-1.5 rounded-full bg-iron" />}
              <span className="truncate text-foreground/90">
                {r.label || <span className="italic text-muted-foreground">(empty response)</span>}
              </span>
              {!r.next_step_id && (
                <span className="ml-auto font-mono text-[9px] text-muted-foreground">unwired</span>
              )}
              <Handle
                id={r.id}
                type="source"
                position={Position.Right}
                style={{
                  background: r.is_most_likely ? "#C44A18" : "#2B2B28",
                  width: 10,
                  height: 10,
                  border: "2px solid #F5F0E8",
                  right: -6,
                }}
              />
            </div>
          ))}
        </div>
      )}

      {unreachable && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onMakeEntry(step.id);
          }}
          className="mt-3 w-full border border-dashed border-iron/60 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-iron hover:bg-iron/5"
        >
          Not reachable — make entry point?
        </button>
      )}
    </div>
  );
}

const nodeTypes = { step: StepNode };

function autoLayout(steps: ScriptStep[]): Record<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 40, ranksep: 100, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  steps.forEach((s) => g.setNode(s.id, { width: NODE_W, height: NODE_MIN_H + s.responses.length * 24 }));
  steps.forEach((s) => {
    s.responses.forEach((r) => {
      if (r.next_step_id && steps.some((x) => x.id === r.next_step_id)) {
        g.setEdge(s.id, r.next_step_id);
      }
    });
  });
  dagre.layout(g);
  const out: Record<string, { x: number; y: number }> = {};
  steps.forEach((s) => {
    const n = g.node(s.id);
    if (n) out[s.id] = { x: n.x - NODE_W / 2, y: n.y - NODE_MIN_H / 2 };
  });
  return out;
}

function buildGraph(
  definition: ScriptDefinition,
  onMakeEntry: (id: string) => void
): { nodes: Node[]; edges: Edge[] } {
  const steps = definition.steps ?? [];
  const stepIds = new Set(steps.map((s) => s.id));
  const incoming = new Map<string, number>();
  steps.forEach((s) =>
    s.responses.forEach((r) => {
      if (r.next_step_id && stepIds.has(r.next_step_id)) {
        incoming.set(r.next_step_id, (incoming.get(r.next_step_id) ?? 0) + 1);
      }
    })
  );

  const needsLayout = steps.some((s) => s.x == null || s.y == null);
  const fallback = needsLayout ? autoLayout(steps) : {};

  const nodes: Node[] = steps.map((s) => {
    const pos = s.x != null && s.y != null ? { x: s.x, y: s.y } : fallback[s.id] ?? { x: 0, y: 0 };
    const unreachable = !s.is_entry && (incoming.get(s.id) ?? 0) === 0;
    return {
      id: s.id,
      type: "step",
      position: pos,
      data: { step: s, unreachable, onMakeEntry } as unknown as Record<string, unknown>,
      draggable: true,
    };
  });

  const edges: Edge[] = [];
  steps.forEach((s) => {
    s.responses.forEach((r) => {
      if (!r.next_step_id || !stepIds.has(r.next_step_id)) return;
      const converges = (incoming.get(r.next_step_id) ?? 0) > 1;
      const highlight = r.is_most_likely || converges;
      edges.push({
        id: `${s.id}:${r.id}`,
        source: s.id,
        sourceHandle: r.id,
        target: r.next_step_id,
        label: truncate(r.label || "", 28),
        labelStyle: { fontFamily: "IBM Plex Mono, monospace", fontSize: 10, fill: "#2B2B28" },
        labelBgStyle: { fill: "#F5F0E8", fillOpacity: 0.9 },
        labelBgPadding: [4, 2],
        style: {
          stroke: highlight ? "#C44A18" : "#2B2B28",
          strokeWidth: r.is_most_likely ? 2 : converges ? 1.75 : 1,
          opacity: highlight ? 0.95 : 0.7,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: highlight ? "#C44A18" : "#2B2B28",
          width: 14,
          height: 14,
        },
      });
    });
  });

  return { nodes, edges };
}

function SectionSelect({
  value,
  customTypes,
  onChange,
  onAddCustom,
}: {
  value: string | null | undefined;
  customTypes: string[];
  onChange: (v: string | null) => void;
  onAddCustom: (name: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const currentDef = value ? SECTION_TYPE_DEFINITION[value] : null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Select
          value={value ?? "__none"}
          onValueChange={(v) => onChange(v === "__none" ? null : v)}
        >
          <SelectTrigger className="rounded-none">
            <SelectValue placeholder="Section type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">No section</SelectItem>
            <SelectGroup>
              <SelectLabel className="text-[10px] uppercase tracking-[0.16em]">Base</SelectLabel>
              {BASE_SECTION_TYPES.map((s) => (
                <SelectItem key={s} value={s}>
                  {SECTION_TYPE_LABEL[s] ?? s}
                </SelectItem>
              ))}
            </SelectGroup>
            {customTypes.length > 0 && (
              <SelectGroup>
                <SelectLabel className="text-[10px] uppercase tracking-[0.16em]">Custom</SelectLabel>
                {customTypes.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>
        {currentDef && (
          <HoverCard openDelay={100}>
            <HoverCardTrigger asChild>
              <button
                type="button"
                className="grid h-8 w-8 place-items-center border border-hairline text-muted-foreground hover:text-iron"
                aria-label="Section type reference"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </HoverCardTrigger>
            <HoverCardContent className="w-80 rounded-none border-hairline bg-parchment">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-iron">
                {SECTION_TYPE_LABEL[value!] ?? value}
              </p>
              <p className="mt-1 font-serif text-sm leading-snug text-foreground">{currentDef}</p>
            </HoverCardContent>
          </HoverCard>
        )}
      </div>

      {!adding && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground hover:text-iron"
        >
          + Add custom section type
        </button>
      )}
      {adding && (
        <div className="flex gap-2">
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="custom_section_name"
            className="rounded-none"
          />
          <Button
            type="button"
            variant="outline"
            className="rounded-none border-foreground"
            onClick={() => {
              const v = draft.trim();
              if (v) {
                onAddCustom(v);
                onChange(v);
              }
              setDraft("");
              setAdding(false);
            }}
          >
            Add
          </Button>
        </div>
      )}
    </div>
  );
}

function ScriptEditor() {
  const { scriptId } = Route.useParams();
  const navigate = useNavigate();
  const acting = useActingOrg();
  const orgId = acting.activeOrgId;

  const { data, isLoading } = useQuery({
    queryKey: ["script", scriptId],
    queryFn: async () => {
      const { data, error } = await supabase.from("scripts").select("*").eq("id", scriptId).single();
      if (error) throw error;
      return data;
    },
  });

  const [name, setName] = useState("");
  const [definition, setDefinition] = useState<ScriptDefinition>({ steps: [] });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (data && !loadedRef.current) {
      setName(data.name);
      setDefinition(data.definition as unknown as ScriptDefinition);
      loadedRef.current = true;
    }
  }, [data]);

  const search = Route.useSearch();
  const deepLinkAppliedRef = useRef(false);
  useEffect(() => {
    if (!loadedRef.current || deepLinkAppliedRef.current) return;
    if (!search.openStep) return;
    const target = definition.steps.find((s) => s.id === search.openStep);
    if (!target) return;
    deepLinkAppliedRef.current = true;
    if (search.addResponse === 1 && target.responses.every((r) => r.label.trim() !== "")) {
      // Seed a blank response row so the admin can fill in the missed branch.
      updateDefinition((d) => ({
        ...d,
        steps: d.steps.map((s) =>
          s.id === target.id
            ? { ...s, responses: [...s.responses, { id: newResponseId(), label: "", next_step_id: null }] }
            : s,
        ),
      }));
    }
    setSelectedId(target.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [definition, search.openStep, search.addResponse]);

  // Autosave (definition + name) — debounced, no version bump.
  useEffect(() => {
    if (!loadedRef.current || !dirty) return;
    const handle = setTimeout(async () => {
      const { error } = await supabase
        .from("scripts")
        .update({ name, definition: definition as unknown as never })
        .eq("id", scriptId);
      if (!error) {
        setSavedAt(new Date().toLocaleTimeString());
        setDirty(false);
      }
    }, 700);
    return () => clearTimeout(handle);
  }, [name, definition, dirty, scriptId]);

  const updateDefinition = useCallback((updater: (d: ScriptDefinition) => ScriptDefinition) => {
    setDefinition((d) => updater(d));
    setDirty(true);
  }, []);

  const updateStep = useCallback(
    (id: string, patch: Partial<ScriptStep> | ((s: ScriptStep) => ScriptStep)) => {
      updateDefinition((d) => ({
        ...d,
        steps: d.steps.map((s) =>
          s.id === id ? (typeof patch === "function" ? patch(s) : { ...s, ...patch }) : s
        ),
      }));
    },
    [updateDefinition]
  );

  const handleMakeEntry = useCallback(
    (stepId: string) => {
      updateStep(stepId, { is_entry: true });
      setSelectedId(stepId);
    },
    [updateStep]
  );

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildGraph(definition, handleMakeEntry),
    [definition, handleMakeEntry]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const commitPositions = useCallback(() => {
    updateDefinition((d) => {
      const posById = new Map(nodes.map((n) => [n.id, n.position]));
      return {
        ...d,
        steps: d.steps.map((s) => {
          const p = posById.get(s.id);
          return p ? { ...s, x: p.x, y: p.y } : s;
        }),
      };
    });
  }, [nodes, updateDefinition]);

  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target || !c.sourceHandle) return;
      updateStep(c.source, (s) => ({
        ...s,
        responses: s.responses.map((r) =>
          r.id === c.sourceHandle ? { ...r, next_step_id: c.target! } : r
        ),
      }));
    },
    [updateStep]
  );

  function autoArrange() {
    const positions = autoLayout(definition.steps);
    updateDefinition((d) => ({
      ...d,
      steps: d.steps.map((s) => ({
        ...s,
        x: positions[s.id]?.x ?? s.x ?? 0,
        y: positions[s.id]?.y ?? s.y ?? 0,
      })),
    }));
  }

  function addStep() {
    const id = "s_" + Math.random().toString(36).slice(2, 9);
    const newStep: ScriptStep = {
      id,
      caller_line: "",
      responses: [],
      x: 40,
      y: 40,
    };
    updateDefinition((d) => ({ ...d, steps: [...d.steps, newStep] }));
    setSelectedId(id);
  }

  async function publish() {
    if (!orgId || !data) return;
    setPublishing(true);
    try {
      // Ensure latest autosave is flushed first
      await supabase
        .from("scripts")
        .update({ name, definition: definition as unknown as never })
        .eq("id", scriptId);

      const vertical = (data as { vertical?: string }).vertical ?? "general";
      const { data: rows } = await supabase
        .from("scripts")
        .select("version")
        .eq("org_id", orgId)
        .eq("name", name)
        .order("version", { ascending: false })
        .limit(1);
      const nextVersion = (rows?.[0]?.version ?? data.version) + 1;

      await supabase
        .from("scripts")
        .update({ is_active: false })
        .eq("org_id", orgId)
        .eq("name", name);

      const insertPayload: Record<string, unknown> = {
        org_id: orgId,
        name,
        version: nextVersion,
        is_active: true,
        definition: definition as unknown as never,
        vertical,
      };
      const { data: inserted, error } = await supabase
        .from("scripts")
        .insert(insertPayload as never)
        .select("id")
        .single();
      if (error) throw error;
      navigate({ to: "/editor/$scriptId", params: { scriptId: inserted.id }, replace: true });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setPublishing(false);
    }
  }

  const selectedStep = definition.steps.find((s) => s.id === selectedId) ?? null;
  const customTypes = definition.custom_section_types ?? [];

  if (isLoading || !data) {
    return (
      <div className="px-6 py-12 text-xs uppercase tracking-[0.2em] text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col">
      <div className="border-b border-hairline px-6 py-4">
        <Link
          to="/editor"
          className="text-xs uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground"
        >
          ← All scripts
        </Link>
        <div className="mt-3 flex items-end justify-between gap-6">
          <div className="flex-1">
            <label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Script name
            </label>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setDirty(true);
              }}
              className="mt-1 w-full bg-transparent font-serif text-3xl outline-none"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              v{data.version} ·{" "}
              {data.is_active ? (
                <span className="text-iron">Published (active)</span>
              ) : (
                <span>Draft</span>
              )}{" "}
              · {definition.steps.length} step{definition.steps.length === 1 ? "" : "s"} ·{" "}
              {dirty ? "Saving…" : savedAt ? `Autosaved ${savedAt}` : "Up to date"}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex gap-2">
              <Button
                onClick={addStep}
                variant="outline"
                className="rounded-none border-foreground"
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Add step
              </Button>
              <Button
                onClick={autoArrange}
                variant="outline"
                className="rounded-none border-foreground"
              >
                Auto-arrange
              </Button>
              <PrinciplesButton />
              <Button onClick={publish} disabled={publishing} className="rounded-none">
                {publishing ? "Publishing…" : "Publish new version"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 bg-parchment">
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeDragStop={commitPositions}
              onNodeClick={(_, n) => setSelectedId(n.id)}
              fitView
              proOptions={{ hideAttribution: true }}
              defaultEdgeOptions={{ type: "default" }}
            >
              <Background gap={24} size={1} color="rgba(43,43,40,0.08)" />
              <MiniMap
                pannable
                zoomable
                maskColor="rgba(245,240,232,0.7)"
                nodeColor={(n) => {
                  const d = n.data as unknown as StepNodeData | undefined;
                  const section = d?.step?.section_type;
                  return section ? tintFor(section) : "#EAE4D8";
                }}
                style={{ background: "#F5F0E8", border: "1px solid rgba(43,43,40,0.15)" }}
              />
              <Controls showInteractive={false} />
            </ReactFlow>
          </ReactFlowProvider>
        </div>

        <ObjectionsPanel
          definition={definition}
          selectedStep={selectedStep}
          updateDefinition={updateDefinition}
        />
      </div>


      <Sheet open={!!selectedStep} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto rounded-none border-l border-hairline bg-parchment sm:max-w-lg"
        >
          {selectedStep && (
            <>
              <SheetHeader>
                <SheetTitle className="font-serif text-2xl">Edit step</SheetTitle>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  {selectedStep.id}
                </p>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                <div>
                  <label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    Caller line
                  </label>
                  <Textarea
                    value={selectedStep.caller_line}
                    onChange={(e) =>
                      updateStep(selectedStep.id, { caller_line: e.target.value })
                    }
                    className="mt-1 min-h-[120px] rounded-none border-hairline bg-transparent font-serif text-lg leading-snug"
                    placeholder="What the caller says on this step"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    Section type
                  </label>
                  <div className="mt-1">
                    <SectionSelect
                      value={selectedStep.section_type}
                      customTypes={customTypes}
                      onChange={(v) => updateStep(selectedStep.id, { section_type: v })}
                      onAddCustom={(v) => {
                        updateDefinition((d) => ({
                          ...d,
                          custom_section_types: Array.from(
                            new Set([...(d.custom_section_types ?? []), v])
                          ),
                        }));
                      }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between border-y border-hairline py-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                      Entry point
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Valid opening line for a scenario.
                    </p>
                  </div>
                  <Switch
                    checked={!!selectedStep.is_entry}
                    onCheckedChange={(v) =>
                      updateStep(selectedStep.id, {
                        is_entry: v,
                        entry_scenario: v ? selectedStep.entry_scenario ?? "" : null,
                      })
                    }
                  />
                </div>
                {selectedStep.is_entry && (
                  <div>
                    <label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                      Entry scenario
                    </label>
                    <Input
                      value={selectedStep.entry_scenario ?? ""}
                      onChange={(e) =>
                        updateStep(selectedStep.id, { entry_scenario: e.target.value })
                      }
                      placeholder="e.g. gatekeeper, direct_contact, cold_referral…"
                      className="mt-1 rounded-none border-hairline bg-transparent font-mono text-sm"
                    />
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                      Responses
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        updateStep(selectedStep.id, (s) => ({
                          ...s,
                          responses: [
                            ...s.responses,
                            { id: newResponseId(), label: "", next_step_id: null },
                          ],
                        }))
                      }
                      className="text-[10px] uppercase tracking-[0.16em] text-iron hover:underline"
                    >
                      + Add response
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Drag from a response's dot on the canvas to another node to wire it.
                  </p>

                  <div className="mt-3 space-y-3">
                    {selectedStep.responses.length === 0 && (
                      <p className="text-xs italic text-muted-foreground">No responses yet.</p>
                    )}
                    {selectedStep.responses.map((r) => (
                      <ResponseRow
                        key={r.id}
                        response={r}
                        onChange={(patch) =>
                          updateStep(selectedStep.id, (s) => ({
                            ...s,
                            responses: s.responses.map((x) =>
                              x.id === r.id ? { ...x, ...patch } : x
                            ),
                          }))
                        }
                        onPickMostLikely={() =>
                          updateStep(selectedStep.id, (s) => ({
                            ...s,
                            responses: s.responses.map((x) => ({
                              ...x,
                              is_most_likely: x.id === r.id,
                            })),
                          }))
                        }
                        onDelete={() =>
                          updateStep(selectedStep.id, (s) => ({
                            ...s,
                            responses: s.responses.filter((x) => x.id !== r.id),
                          }))
                        }
                      />
                    ))}
                  </div>
                </div>

                <div className="border-t border-hairline pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      if (!confirm("Delete this step? Any responses pointing to it will become unwired.")) return;
                      updateDefinition((d) => ({
                        ...d,
                        steps: d.steps
                          .filter((s) => s.id !== selectedStep.id)
                          .map((s) => ({
                            ...s,
                            responses: s.responses.map((r) =>
                              r.next_step_id === selectedStep.id
                                ? { ...r, next_step_id: null }
                                : r
                            ),
                          })),
                      }));
                      setSelectedId(null);
                    }}
                    className="text-xs uppercase tracking-[0.16em] text-muted-foreground hover:text-iron"
                  >
                    Delete step
                  </button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ResponseRow({
  response,
  onChange,
  onPickMostLikely,
  onDelete,
}: {
  response: ScriptResponse;
  onChange: (patch: Partial<ScriptResponse>) => void;
  onPickMostLikely: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="border border-hairline p-3">
      <div className="flex items-center gap-2">
        <Input
          value={response.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="What the prospect said"
          className="rounded-none border-hairline bg-transparent"
        />
        <button
          type="button"
          onClick={onDelete}
          className="grid h-9 w-9 place-items-center text-muted-foreground hover:text-iron"
          aria-label="Delete response"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px]">
        <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
          <input
            type="radio"
            checked={!!response.is_most_likely}
            onChange={onPickMostLikely}
            className="accent-[#C44A18]"
          />
          <span className="uppercase tracking-[0.16em]">Most likely</span>
        </label>
        <span className="font-mono text-[10px] text-muted-foreground">
          {response.next_step_id ? `→ ${response.next_step_id}` : "unwired"}
        </span>
      </div>
    </div>
  );
}

// ---------- Objections panel ----------

const STRATEGY_BY_SECTION: Record<
  string,
  { note: string; defaultResume: string }
> = {
  pre_qualifying: {
    note: "An objection here means you haven't earned the meeting. Go back UP — resume at another pain point or question.",
    defaultResume: "pain_points",
  },
  pain_points: {
    note: "They're resisting but you're close. Reframe toward the MEETING, not the sale.",
    defaultResume: "building_interest",
  },
  close: {
    note: "'Not ready' isn't 'no.' Drop back to a pain point or pencil a month out.",
    defaultResume: "pain_points",
  },
  gatekeeper_intro: {
    note: "This is about ACCESS, not the offer. Resume in-stage — name, callback, transfer.",
    defaultResume: "gatekeeper_intro",
  },
};

function ObjectionsPanel({
  definition,
  selectedStep,
  updateDefinition,
}: {
  definition: ScriptDefinition;
  selectedStep: ScriptStep | null;
  updateDefinition: (u: (d: ScriptDefinition) => ScriptDefinition) => void;
}) {
  const objections = definition.objections ?? [];
  const [openId, setOpenId] = useState<string | null>(null);
  const allSections = useMemo(() => {
    const custom = definition.custom_section_types ?? [];
    return [...BASE_SECTION_TYPES, ...custom];
  }, [definition.custom_section_types]);

  const selectedSection = selectedStep?.section_type ?? null;
  const strategy = selectedSection ? STRATEGY_BY_SECTION[selectedSection] : null;

  function addObjection() {
    const id = newObjectionId();
    const stages = selectedSection ? [selectedSection] : [];
    const resume_section = strategy?.defaultResume ?? null;
    const next: ScriptObjection = {
      id,
      label: "",
      reframe: "",
      stages,
      resume_section,
      resume_step_id: null,
    };
    updateDefinition((d) => ({ ...d, objections: [...(d.objections ?? []), next] }));
    setOpenId(id);
  }

  function updateObjection(id: string, patch: Partial<ScriptObjection>) {
    updateDefinition((d) => ({
      ...d,
      objections: (d.objections ?? []).map((o) => (o.id === id ? { ...o, ...patch } : o)),
    }));
  }

  function deleteObjection(id: string) {
    updateDefinition((d) => ({
      ...d,
      objections: (d.objections ?? []).filter((o) => o.id !== id),
    }));
    if (openId === id) setOpenId(null);
  }

  return (
    <aside className="w-[340px] shrink-0 overflow-y-auto border-l border-hairline bg-parchment/60">
      <div className="border-b border-hairline px-4 py-3">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Objections
          </p>
          <button
            type="button"
            onClick={addObjection}
            className="text-[10px] uppercase tracking-[0.16em] text-iron hover:underline"
          >
            + Add objection
          </button>
        </div>
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
          Authored off the graph. The runner surfaces these by stage.
        </p>
      </div>

      {selectedStep && strategy && (
        <div className="mx-4 mt-3 border border-iron/40 bg-iron/5 px-3 py-2">
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-iron">
            Strategy · {SECTION_TYPE_LABEL[selectedSection!] ?? selectedSection}
          </p>
          <p className="mt-1 font-serif text-[13px] leading-snug text-foreground">
            {strategy.note}
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            New objections default to resume at{" "}
            <span className="font-mono">{strategy.defaultResume}</span>.
          </p>
        </div>
      )}

      <div className="space-y-2 p-4">
        {objections.length === 0 && (
          <p className="text-xs italic text-muted-foreground">
            No objections yet. Prepare the 5–10 you hear most.
          </p>
        )}
        {objections.map((o) => {
          const isOpen = openId === o.id;
          return (
            <div key={o.id} className="border border-hairline bg-parchment">
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : o.id)}
                className="flex w-full items-start justify-between gap-2 px-3 py-2 text-left"
              >
                <span className="font-serif text-sm text-foreground">
                  {o.label || <span className="italic text-muted-foreground">Untitled objection</span>}
                </span>
                <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                  {o.stages.length} stage{o.stages.length === 1 ? "" : "s"}
                </span>
              </button>

              {isOpen && (
                <div className="space-y-3 border-t border-hairline px-3 py-3">
                  <div>
                    <label className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                      They say
                    </label>
                    <Input
                      value={o.label}
                      onChange={(e) => updateObjection(o.id, { label: e.target.value })}
                      placeholder="e.g. We already have someone."
                      className="mt-1 rounded-none border-hairline bg-transparent"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                      Reframe
                    </label>
                    <Textarea
                      value={o.reframe}
                      onChange={(e) => updateObjection(o.id, { reframe: e.target.value })}
                      placeholder="What the caller says back."
                      className="mt-1 min-h-[80px] rounded-none border-hairline bg-transparent font-serif text-sm"
                    />
                  </div>

                  <div>
                    <p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                      Relevant stages
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {allSections.map((s) => {
                        const on = o.stages.includes(s);
                        return (
                          <button
                            key={s}
                            type="button"
                            onClick={() =>
                              updateObjection(o.id, {
                                stages: on
                                  ? o.stages.filter((x) => x !== s)
                                  : [...o.stages, s],
                              })
                            }
                            className="border px-2 py-0.5 text-[10px]"
                            style={{
                              borderColor: on ? "#C44A18" : "rgba(43,43,40,0.2)",
                              background: on ? "rgba(196,74,24,0.08)" : "transparent",
                              color: on ? "#C44A18" : "#2B2B28",
                            }}
                          >
                            {SECTION_TYPE_LABEL[s] ?? s}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                        Resume section
                      </label>
                      <Select
                        value={o.resume_section ?? "__none"}
                        onValueChange={(v) =>
                          updateObjection(o.id, {
                            resume_section: v === "__none" ? null : v,
                          })
                        }
                      >
                        <SelectTrigger className="mt-1 rounded-none">
                          <SelectValue placeholder="Section" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">None</SelectItem>
                          <SelectGroup>
                            <SelectLabel className="text-[10px] uppercase tracking-[0.16em]">
                              Sections
                            </SelectLabel>
                            {allSections.map((s) => (
                              <SelectItem key={s} value={s}>
                                {SECTION_TYPE_LABEL[s] ?? s}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                        Pin step (optional)
                      </label>
                      <Select
                        value={o.resume_step_id ?? "__none"}
                        onValueChange={(v) =>
                          updateObjection(o.id, {
                            resume_step_id: v === "__none" ? null : v,
                          })
                        }
                      >
                        <SelectTrigger className="mt-1 rounded-none">
                          <SelectValue placeholder="Any" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">Any (use section)</SelectItem>
                          {definition.steps.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {truncate(s.caller_line || s.id, 40)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Resumes at:{" "}
                    <span className="font-mono">
                      {o.resume_step_id
                        ? `step ${o.resume_step_id}`
                        : o.resume_section ?? "—"}
                    </span>
                    {o.resume_step_id && o.resume_section && (
                      <span className="opacity-60"> (pin overrides section)</span>
                    )}
                  </p>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => deleteObjection(o.id)}
                      className="flex items-center gap-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground hover:text-iron"
                    >
                      <X className="h-3 w-3" /> Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

// ---------- Cold-call principles reference ----------

function PrinciplesButton() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="rounded-none border-foreground">
          <BookOpen className="mr-1 h-3.5 w-3.5" /> Principles
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl rounded-none border-hairline bg-parchment">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Cold-call principles</DialogTitle>
        </DialogHeader>
        <ul className="mt-2 space-y-3 font-serif text-[15px] leading-snug text-foreground">
          <li>
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-iron">
              Goal
            </span>
            <p>The immediate goal is the MEETING, not the sale.</p>
          </li>
          <li>
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-iron">
              Talk time
            </span>
            <p>Aim for 80/20 toward the prospect. If you're talking, you're losing.</p>
          </li>
          <li>
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-iron">
              Voice
            </span>
            <p>Don't sound like a rep in the first 20 seconds. Peer, not pitch.</p>
          </li>
          <li>
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-iron">
              Opener
            </span>
            <p>
              Use "have I caught you in the middle of anything" — never "are you busy." One
              disarms, the other signals low value.
            </p>
          </li>
          <li>
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-iron">
              Objections
            </span>
            <p>
              Objections to buying aren't objections to meeting. Reframe toward the meeting.
            </p>
          </li>
          <li>
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-iron">
              Preparation
            </span>
            <p>
              You face the same 5–10 objections repeatedly. Prepare them — that's what the
              Objections panel is for.
            </p>
          </li>
        </ul>
      </DialogContent>
    </Dialog>
  );
}
