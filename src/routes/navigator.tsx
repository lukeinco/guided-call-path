import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check } from "lucide-react";
import {
  type ScriptDefinition,
  type ScriptStep,
  type ScriptObjection,
  SECTION_TYPE_LABEL,
} from "@/lib/script-types";

export const Route = createFileRoute("/navigator")({
  ssr: false,
  component: NavigatorPage,
});

interface ActiveScript {
  id: string;
  name: string;
  definition: ScriptDefinition;
}

function NavigatorPage() {
  const auth = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!auth.loading && !auth.userId) navigate({ to: "/auth", replace: true });
  }, [auth.loading, auth.userId, navigate]);

  const { data: scripts, isLoading } = useQuery({
    queryKey: ["active-scripts", auth.orgId],
    enabled: !!auth.orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scripts")
        .select("id, name, definition")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as unknown as ActiveScript[];
    },
  });

  const [scriptId, setScriptId] = useState<string | null>(null);
  const [scenario, setScenario] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [path, setPath] = useState<string[]>([]);

  useEffect(() => {
    if (scripts && scripts.length > 0 && !scriptId) setScriptId(scripts[0].id);
  }, [scripts, scriptId]);

  const script = useMemo(() => scripts?.find((s) => s.id === scriptId), [scripts, scriptId]);
  const stepsById = useMemo(() => {
    const m = new Map<string, ScriptStep>();
    script?.definition.steps.forEach((s) => m.set(s.id, s));
    return m;
  }, [script]);

  // Scenario -> entry steps map, derived from free-text entry_scenario on is_entry steps
  const entryStepsByScenario = useMemo(() => {
    const m = new Map<string, ScriptStep[]>();
    script?.definition.steps.forEach((s) => {
      if (s.is_entry) {
        const key = (s.entry_scenario as string | null | undefined)?.trim() || "default";
        const arr = m.get(key) ?? [];
        arr.push(s);
        m.set(key, arr);
      }
    });
    return m;
  }, [script]);

  const scenarioList = useMemo(() => Array.from(entryStepsByScenario.keys()), [entryStepsByScenario]);

  async function startRun(s: string) {
    if (!auth.orgId || !script) return;
    const entry = entryStepsByScenario.get(s)?.[0];
    if (!entry) return alert("No entry step exists for this scenario.");
    const { data, error } = await supabase
      .from("call_runs")
      .insert({ org_id: auth.orgId, script_id: script.id, caller_id: auth.userId!, scenario: s })
      .select("id")
      .single();
    if (error) return alert(error.message);
    setRunId(data.id);
    setScenario(s);
    setPath([entry.id]);
  }

  async function endCall(opts?: {
    disposition?: string;
    killed_by_objection_id?: string | null;
    ended_on_step_id?: string | null;
  }) {
    if (runId) {
      const update: {
        ended_at: string;
        disposition?: string;
        killed_by_objection_id?: string | null;
        ended_on_step_id?: string | null;
      } = { ended_at: new Date().toISOString() };
      if (opts?.disposition) update.disposition = opts.disposition;
      if (opts?.killed_by_objection_id) update.killed_by_objection_id = opts.killed_by_objection_id;
      if (opts?.ended_on_step_id) update.ended_on_step_id = opts.ended_on_step_id;
      await supabase.from("call_runs").update(update).eq("id", runId);
    }
    setRunId(null);
    setScenario(null);
    setPath([]);
  }

  async function pickResponse(step: ScriptStep, respId: string, label: string, nextId: string | null | undefined) {
    if (!auth.orgId || !runId) return;
    await supabase.from("events").insert({
      run_id: runId,
      org_id: auth.orgId,
      step_id: step.id,
      type: "response_selected",
      response_label: `${label} [${respId}]`,
      section_type: step.section_type ?? null,
    });
    if (nextId && stepsById.has(nextId)) {
      setPath((p) => [...p, nextId]);
    } else {
      await endCall();
    }
  }

  async function logObjectionOpened(step: ScriptStep, obj: ScriptObjection) {
    if (!auth.orgId || !runId) return;
    await supabase.from("events").insert({
      run_id: runId,
      org_id: auth.orgId,
      step_id: step.id,
      type: "objection_opened",
      response_label: obj.label,
      detail: obj.reframe,
      section_type: step.section_type ?? null,
    });
  }

  async function logNotAccounted(step: ScriptStep, text: string) {
    if (!auth.orgId || !runId) return;
    await supabase.from("events").insert({
      run_id: runId,
      org_id: auth.orgId,
      step_id: step.id,
      type: "not_accounted_for",
      detail: text,
      section_type: step.section_type ?? null,
    });
  }

  function jumpTo(idx: number) {
    setPath((p) => p.slice(0, idx + 1));
  }
  function pickSibling(siblingStepId: string) {
    setPath((p) => [...p.slice(0, -1), siblingStepId]);
  }
  function resumeAt(stepId: string) {
    setPath((p) => [...p, stepId]);
  }

  if (auth.loading || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-xs uppercase tracking-[0.2em] text-muted-foreground">
        Loading
      </div>
    );
  }

  return (
    <AppShell title="Navigator">
      {!script ? (
        <div className="mx-auto max-w-2xl px-6 py-20 text-center">
          <h1 className="font-serif text-3xl">No active script</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            An admin needs to set a script as active in the editor.
          </p>
        </div>
      ) : !runId ? (
        <ScenarioPicker
          script={script}
          scripts={scripts ?? []}
          onPickScript={setScriptId}
          scenarios={scenarioList}
          onStart={startRun}
        />
      ) : (
        <RunnerView
          script={script}
          stepsById={stepsById}
          path={path}
          scenario={scenario!}
          onJump={jumpTo}
          onPickResponse={pickResponse}
          onPickSibling={pickSibling}
          onResumeAt={resumeAt}
          onObjectionOpened={logObjectionOpened}
          onNotAccounted={logNotAccounted}
          onEnd={endCall}
        />
      )}
    </AppShell>
  );
}

function ScenarioPicker({
  script,
  scripts,
  onPickScript,
  scenarios,
  onStart,
}: {
  script: ActiveScript;
  scripts: ActiveScript[];
  onPickScript: (id: string) => void;
  scenarios: string[];
  onStart: (s: string) => void;
}) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-serif text-4xl">Start a call</h1>
      <p className="mt-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">Pick the situation</p>

      {scripts.length > 1 && (
        <div className="mt-6">
          <label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Script</label>
          <select
            value={script.id}
            onChange={(e) => onPickScript(e.target.value)}
            className="mt-1 w-full border border-hairline bg-transparent px-3 py-2 text-sm"
          >
            {scripts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {scenarios.length === 0 && (
          <p className="text-xs text-muted-foreground">
            This script has no entry steps. An admin needs to mark at least one step as an entry.
          </p>
        )}
        {scenarios.map((s) => (
          <button
            key={s}
            onClick={() => onStart(s)}
            className="group border border-hairline bg-card p-6 text-left transition-colors hover:border-foreground"
          >
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Scenario</p>
            <p className="mt-1 font-serif text-2xl">{s}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function RunnerView({
  script,
  stepsById,
  path,
  scenario,
  onJump,
  onPickResponse,
  onPickSibling,
  onResumeAt,
  onObjectionOpened,
  onNotAccounted,
  onEnd,
}: {
  script: ActiveScript;
  stepsById: Map<string, ScriptStep>;
  path: string[];
  scenario: string;
  onJump: (idx: number) => void;
  onPickResponse: (step: ScriptStep, respId: string, label: string, nextId: string | null | undefined) => void;
  onPickSibling: (stepId: string) => void;
  onResumeAt: (stepId: string) => void;
  onObjectionOpened: (step: ScriptStep, obj: ScriptObjection) => void;
  onNotAccounted: (step: ScriptStep, text: string) => void;
  onEnd: (opts?: { disposition?: string; killed_by_objection_id?: string | null; ended_on_step_id?: string | null }) => void;
}) {
  const currentId = path[path.length - 1];
  const current = stepsById.get(currentId);
  const parentId = path[path.length - 2];
  const parent = parentId ? stepsById.get(parentId) : undefined;

  const bypassed = (parent?.responses ?? []).filter((r) => r.next_step_id && r.next_step_id !== currentId);

  const allObjections = script.definition.objections ?? [];
  const [showAllObjections, setShowAllObjections] = useState(false);
  const [openObjection, setOpenObjection] = useState<ScriptObjection | null>(null);
  const [resumePicks, setResumePicks] = useState<ScriptStep[] | null>(null);
  const [notAccountedOpen, setNotAccountedOpen] = useState(false);
  const [notAccountedText, setNotAccountedText] = useState("");
  const [endStage, setEndStage] = useState<"idle" | "confirming" | "dialog">("idle");
  const [disposition, setDisposition] = useState<string>("");
  const [killedByObjectionId, setKilledByObjectionId] = useState<string>("");
  const endedOnStepIdRef = useMemo(() => ({ id: currentId }), [currentId]);

  function beginEndCall() {
    setDisposition("");
    setKilledByObjectionId("");
    endedOnStepIdRef.id = currentId;
    setEndStage("confirming");
    setTimeout(() => setEndStage("dialog"), 550);
  }

  function submitDisposition() {
    if (!disposition) return;
    onEnd({
      disposition,
      ended_on_step_id: endedOnStepIdRef.id,
      killed_by_objection_id:
        disposition === "objection_unbeat" ? killedByObjectionId || null : null,
    });
    setEndStage("idle");
  }

  const relevantObjections = useMemo(() => {
    if (!current) return [];
    const sec = current.section_type;
    if (!sec) return [];
    return allObjections.filter((o) => o.stages?.includes(sec));
  }, [allObjections, current]);

  const visibleObjections = showAllObjections ? allObjections : relevantObjections;

  if (!current) return <div className="px-6 py-12">Step not found.</div>;

  function handleObjectionClick(obj: ScriptObjection) {
    if (!current) return;
    onObjectionOpened(current, obj);
    setOpenObjection(obj);
    setResumePicks(null);
  }

  function handleResume(obj: ScriptObjection) {
    if (obj.resume_step_id && stepsById.has(obj.resume_step_id)) {
      onResumeAt(obj.resume_step_id);
      setOpenObjection(null);
      return;
    }
    if (obj.resume_section) {
      const matches = Array.from(stepsById.values()).filter((s) => s.section_type === obj.resume_section);
      if (matches.length === 1) {
        onResumeAt(matches[0].id);
        setOpenObjection(null);
        return;
      }
      if (matches.length > 1) {
        setResumePicks(matches.slice(0, 3));
        return;
      }
    }
    setOpenObjection(null);
  }

  async function submitNotAccounted() {
    if (!current || !notAccountedText.trim()) return;
    await onNotAccounted(current, notAccountedText.trim());
    setNotAccountedText("");
    setNotAccountedOpen(false);
  }

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-6">
      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-2 border-b border-hairline pb-4">
        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{scenario}</span>
        <span className="text-hairline">/</span>
        {path.map((sid, i) => {
          const s = stepsById.get(sid);
          const isLast = i === path.length - 1;
          return (
            <button
              key={sid + i}
              onClick={() => !isLast && onJump(i)}
              disabled={isLast}
              className={`max-w-[200px] truncate border border-hairline px-2 py-1 text-[11px] font-mono ${
                isLast ? "bg-foreground text-background" : "hover:border-foreground"
              }`}
            >
              {s?.caller_line.slice(0, 30) ?? sid}
              {s && s.caller_line.length > 30 ? "…" : ""}
            </button>
          );
        })}
      </div>

      {/* Main grid: siblings | center | responses | objections rail */}
      <div className="mt-8 grid gap-6 lg:grid-cols-[220px_1fr_300px_260px]">
        {/* Left: bypassed siblings */}
        <aside className="order-3 lg:order-1">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">If they said something else</p>
          <div className="mt-3 space-y-2">
            {bypassed.length === 0 && <p className="text-xs text-muted-foreground">—</p>}
            {bypassed.map((r) => (
              <button
                key={r.id}
                onClick={() => r.next_step_id && onPickSibling(r.next_step_id)}
                className="w-full border border-hairline bg-card p-3 text-left text-xs hover:border-foreground"
              >
                {r.label}
              </button>
            ))}
          </div>
        </aside>

        {/* Center: you say */}
        <section className="order-1 flex flex-col items-center justify-center px-2 py-10 text-center lg:order-2 lg:px-6 lg:py-16">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">You say</p>
          {current.section_type && (
            <p className="mt-1 text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
              {SECTION_TYPE_LABEL[current.section_type] ?? current.section_type}
            </p>
          )}
          <p className="mt-6 font-serif text-3xl leading-snug text-foreground sm:text-4xl lg:text-5xl">
            {current.caller_line}
          </p>
        </section>

        {/* Right: they respond */}
        <aside className="order-2 lg:order-3">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">They respond</p>
          <div className="mt-3 space-y-2">
            {current.responses.length === 0 && (
              <p className="text-xs text-muted-foreground">No responses — call ends here.</p>
            )}
            {current.responses.map((r) => (
              <button
                key={r.id}
                onClick={() => onPickResponse(current, r.id, r.label, r.next_step_id)}
                className={`w-full border p-4 text-left text-sm transition-colors hover:border-iron hover:text-iron ${
                  r.is_most_likely
                    ? "border-iron bg-card"
                    : "border-hairline bg-card"
                }`}
              >
                {r.is_most_likely && (
                  <span className="mb-1 block text-[9px] font-mono uppercase tracking-[0.2em] text-iron">
                    Most likely
                  </span>
                )}
                {r.label}
                {!r.next_step_id && (
                  <span className="ml-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    Ends call
                  </span>
                )}
              </button>
            ))}
          </div>
        </aside>

        {/* Objection rail */}
        <aside className="order-4 border-l border-hairline pl-4 lg:pl-6">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Objections</p>
            <button
              onClick={() => setShowAllObjections((v) => !v)}
              className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
            >
              {showAllObjections ? "Relevant" : "Show all"}
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {visibleObjections.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {allObjections.length === 0 ? "None authored." : "None for this stage."}
              </p>
            )}
            {visibleObjections.map((o) => (
              <button
                key={o.id}
                onClick={() => handleObjectionClick(o)}
                className="w-full border border-hairline bg-card p-3 text-left text-xs hover:border-foreground"
              >
                {o.label}
              </button>
            ))}
          </div>
        </aside>
      </div>

      {/* Objection panel */}
      {openObjection && (
        <div className="mt-6 border border-hairline bg-card p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Objection</p>
              <p className="mt-1 font-serif text-2xl">{openObjection.label}</p>
            </div>
            <button
              onClick={() => setOpenObjection(null)}
              className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          </div>
          <p className="mt-4 font-serif text-lg leading-snug">{openObjection.reframe}</p>

          {resumePicks ? (
            <div className="mt-4">
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Resume where?</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {resumePicks.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      onResumeAt(s.id);
                      setOpenObjection(null);
                      setResumePicks(null);
                    }}
                    className="border border-hairline p-3 text-left text-xs hover:border-foreground"
                  >
                    {s.caller_line.slice(0, 80)}
                    {s.caller_line.length > 80 ? "…" : ""}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-4 flex items-center gap-3">
              <Button
                variant="outline"
                className="rounded-none border-iron text-iron"
                onClick={() => handleResume(openObjection)}
              >
                Resume →
              </Button>
              <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
                Call position unchanged until you resume
              </span>
            </div>
          )}
        </div>
      )}

      {/* Not accounted for + end */}
      <div className="mt-10 grid gap-2 border-t border-hairline pt-4 sm:grid-cols-[1fr_auto]">
        {notAccountedOpen ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              autoFocus
              value={notAccountedText}
              onChange={(e) => setNotAccountedText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitNotAccounted()}
              placeholder="What did they say?"
              className="flex-1 border border-hairline bg-transparent px-3 py-3 text-sm"
            />
            <Button onClick={submitNotAccounted} variant="outline" className="rounded-none border-foreground">
              Log
            </Button>
            <Button
              onClick={() => {
                setNotAccountedOpen(false);
                setNotAccountedText("");
              }}
              variant="ghost"
              className="rounded-none"
            >
              Cancel
            </Button>
          </div>
        ) : (
          <button
            onClick={() => setNotAccountedOpen(true)}
            className="border border-dashed border-hairline px-4 py-3 text-xs uppercase tracking-[0.2em] text-muted-foreground hover:border-iron hover:text-iron"
          >
            Response not accounted for
          </button>
        )}
        <Button onClick={beginEndCall} variant="outline" className="rounded-none border-foreground">
          End call
        </Button>
      </div>

      <p className="mt-4 text-center text-[10px] text-muted-foreground">Script: {script.name}</p>
    </div>
  );
}
