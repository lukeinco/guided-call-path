import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import { supabase } from "@/integrations/supabase/client";
import { useActingOrg } from "@/lib/acting-org";
import { Button } from "@/components/ui/button";
import type { ScriptDefinition, ScriptStep } from "@/lib/script-types";

export const Route = createFileRoute("/editor/$scriptId")({
  ssr: false,
  component: ScriptEditor,
});

const NODE_W = 260;
const NODE_H = 120;

// Deterministic pastel tint from a section_type string.
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
};

function StepNode({ data }: NodeProps) {
  const { step, unreachable } = data as unknown as StepNodeData;
  const section = step.section_type ?? null;
  return (
    <div
      className="relative bg-card px-4 py-3"
      style={{
        width: NODE_W,
        minHeight: NODE_H,
        border: `1px ${unreachable ? "dashed" : "solid"} hsl(var(--hairline, 30 10% 80%))`,
        borderColor: unreachable ? "rgba(196, 74, 24, 0.55)" : undefined,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: "#2B2B28", width: 6, height: 6, border: 0 }} />
      <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
        {step.is_entry && <span className="text-iron">Entry</span>}
        {step.is_entry && section && <span>·</span>}
        {section && (
          <span
            className="rounded-sm px-1.5 py-0.5 text-[9px]"
            style={{ background: tintFor(section), color: "#2B2B28" }}
          >
            {section}
          </span>
        )}
        {!step.is_entry && !section && <span>Step</span>}
        <span className="ml-auto font-mono normal-case text-[9px] opacity-60">{step.id}</span>
      </div>
      <p className="mt-2 font-serif text-[15px] leading-snug text-foreground">
        {truncate(step.caller_line || "(empty step)", 120)}
      </p>
      {step.responses.length > 0 && (
        <p className="mt-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          {step.responses.length} response{step.responses.length === 1 ? "" : "s"}
        </p>
      )}
      <Handle type="source" position={Position.Right} style={{ background: "#2B2B28", width: 6, height: 6, border: 0 }} />
    </div>
  );
}

const nodeTypes = { step: StepNode };

function autoLayout(steps: ScriptStep[]): Record<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 40, ranksep: 80, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  steps.forEach((s) => g.setNode(s.id, { width: NODE_W, height: NODE_H }));
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
    if (n) out[s.id] = { x: n.x - NODE_W / 2, y: n.y - NODE_H / 2 };
  });
  return out;
}

function buildGraph(definition: ScriptDefinition): { nodes: Node[]; edges: Edge[] } {
  const steps = definition.steps ?? [];
  const stepIds = new Set(steps.map((s) => s.id));

  // Incoming edge counts per step id
  const incoming = new Map<string, number>();
  steps.forEach((s) =>
    s.responses.forEach((r) => {
      if (r.next_step_id && stepIds.has(r.next_step_id)) {
        incoming.set(r.next_step_id, (incoming.get(r.next_step_id) ?? 0) + 1);
      }
    })
  );

  // If any step lacks x/y, run dagre and fill in
  const needsLayout = steps.some((s) => s.x == null || s.y == null);
  const fallback = needsLayout ? autoLayout(steps) : {};

  const nodes: Node[] = steps.map((s) => {
    const pos =
      s.x != null && s.y != null
        ? { x: s.x, y: s.y }
        : fallback[s.id] ?? { x: 0, y: 0 };
    const unreachable = !s.is_entry && (incoming.get(s.id) ?? 0) === 0;
    return {
      id: s.id,
      type: "step",
      position: pos,
      data: { step: s, unreachable } as unknown as Record<string, unknown>,
      draggable: true,
    };
  });

  // Count convergence for edge styling
  const convergence = incoming;

  const edges: Edge[] = [];
  steps.forEach((s) => {
    s.responses.forEach((r) => {
      if (!r.next_step_id || !stepIds.has(r.next_step_id)) return;
      const converges = (convergence.get(r.next_step_id) ?? 0) > 1;
      edges.push({
        id: `${s.id}:${r.id}`,
        source: s.id,
        target: r.next_step_id,
        label: truncate(r.label || "", 28),
        labelStyle: { fontFamily: "IBM Plex Mono, monospace", fontSize: 10, fill: "#2B2B28" },
        labelBgStyle: { fill: "#F5F0E8", fillOpacity: 0.9 },
        labelBgPadding: [4, 2],
        style: {
          stroke: converges ? "#C44A18" : "#2B2B28",
          strokeWidth: converges ? 1.75 : 1,
          opacity: converges ? 0.95 : 0.75,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: converges ? "#C44A18" : "#2B2B28",
          width: 14,
          height: 14,
        },
      });
    });
  });

  return { nodes, edges };
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
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setName(data.name);
      setDefinition(data.definition as unknown as ScriptDefinition);
    }
  }, [data]);

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildGraph(definition),
    [definition]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  // Sync when definition changes (loaded / auto-arranged / saved)
  useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  // Persist drag positions back into definition (local state only)
  const commitPositions = useCallback(() => {
    setDefinition((d) => {
      const posById = new Map(nodes.map((n) => [n.id, n.position]));
      return {
        ...d,
        steps: d.steps.map((s) => {
          const p = posById.get(s.id);
          return p ? { ...s, x: p.x, y: p.y } : s;
        }),
      };
    });
  }, [nodes]);

  function autoArrange() {
    const positions = autoLayout(definition.steps);
    const next: ScriptDefinition = {
      ...definition,
      steps: definition.steps.map((s) => ({
        ...s,
        x: positions[s.id]?.x ?? s.x ?? 0,
        y: positions[s.id]?.y ?? s.y ?? 0,
      })),
    };
    setDefinition(next);
    void save({ asNewVersion: false, overrideDefinition: next });
  }

  async function save({
    asNewVersion,
    overrideDefinition,
  }: {
    asNewVersion: boolean;
    overrideDefinition?: ScriptDefinition;
  }) {
    if (!orgId || !data) return;
    setSaving(true);
    try {
      // Always commit latest drag positions into whatever we're about to save
      const posById = new Map(nodes.map((n) => [n.id, n.position]));
      const base = overrideDefinition ?? definition;
      const def: ScriptDefinition = {
        ...base,
        steps: base.steps.map((s) => {
          const p = posById.get(s.id);
          return p ? { ...s, x: p.x, y: p.y } : s;
        }),
      };
      if (asNewVersion) {
        const { data: rows } = await supabase
          .from("scripts").select("version").eq("org_id", orgId).eq("name", name).order("version", { ascending: false }).limit(1);
        const nextVersion = (rows?.[0]?.version ?? data.version) + 1;
        await supabase.from("scripts").update({ is_active: false }).eq("org_id", orgId).eq("name", name);
        const { data: inserted, error } = await supabase
          .from("scripts")
          .insert({ org_id: orgId, name, version: nextVersion, is_active: true, definition: def as unknown as never })
          .select("id").single();
        if (error) throw error;
        navigate({ to: "/editor/$scriptId", params: { scriptId: inserted.id }, replace: true });
      } else {
        const { error } = await supabase.from("scripts").update({ name, definition: def as unknown as never }).eq("id", scriptId);
        if (error) throw error;
        setDefinition(def);
      }
      setSavedAt(new Date().toLocaleTimeString());
    } catch (e) {
      alert(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading || !data) {
    return <div className="px-6 py-12 text-xs uppercase tracking-[0.2em] text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col">
      <div className="border-b border-hairline px-6 py-4">
        <Link to="/editor" className="text-xs uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground">
          ← All scripts
        </Link>
        <div className="mt-3 flex items-end justify-between gap-6">
          <div className="flex-1">
            <label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Script name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full bg-transparent font-serif text-3xl outline-none"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Version {data.version} · {data.is_active ? <span className="text-iron">Active</span> : "Draft"} · {definition.steps.length} step{definition.steps.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex gap-2">
              <Button onClick={autoArrange} disabled={saving} variant="outline" className="rounded-none border-foreground">
                Auto-arrange
              </Button>
              <Button onClick={() => { commitPositions(); void save({ asNewVersion: false }); }} disabled={saving} variant="outline" className="rounded-none border-foreground">
                Save draft
              </Button>
              <Button onClick={() => { commitPositions(); void save({ asNewVersion: true }); }} disabled={saving} className="rounded-none">
                Save as new active version
              </Button>
            </div>
            {savedAt && <p className="text-[11px] text-muted-foreground">Saved at {savedAt}</p>}
          </div>
        </div>
      </div>

      <div className="flex-1 bg-parchment">
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStop={commitPositions}
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
    </div>
  );
}
