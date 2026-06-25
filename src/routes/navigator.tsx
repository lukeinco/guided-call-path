import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { type ScriptDefinition, type ScriptStep, type EntryScenario, SCENARIO_LABEL } from "@/lib/script-types";

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
        .from("scripts").select("id, name, definition").eq("is_active", true).order("name");
      if (error) throw error;
      return data as unknown as ActiveScript[];
    },
  });

  const [scriptId, setScriptId] = useState<string | null>(null);
  const [scenario, setScenario] = useState<EntryScenario | null>(null);
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

  const entryStepsByScenario = useMemo(() => {
    const m = new Map<EntryScenario, ScriptStep[]>();
    script?.definition.steps.forEach((s) => {
      if (s.is_entry && s.entry_scenario) {
        const arr = m.get(s.entry_scenario) ?? [];
        arr.push(s);
        m.set(s.entry_scenario, arr);
      }
    });
    return m;
  }, [script]);

  async function startRun(s: EntryScenario) {
    if (!auth.orgId || !script) return;
    const entry = entryStepsByScenario.get(s)?.[0];
    if (!entry) return alert("No entry step exists for this scenario.");
    const { data, error } = await supabase
      .from("call_runs")
      .insert({ org_id: auth.orgId, script_id: script.id, caller_id: auth.userId!, scenario: s })
      .select("id").single();
    if (error) return alert(error.message);
    setRunId(data.id);
    setScenario(s);
    setPath([entry.id]);
  }

  async function endCall() {
    if (runId) await supabase.from("call_runs").update({ ended_at: new Date().toISOString() }).eq("id", runId);
    setRunId(null); setScenario(null); setPath([]);
  }

  async function pickResponse(stepId: string, responseId: string, label: string, nextId: string | null | undefined) {
    if (!auth.orgId || !runId) return;
    await supabase.from("events").insert({
      run_id: runId, org_id: auth.orgId, step_id: stepId, type: "response_selected", response_label: `${label} [${responseId}]`,
    });
    if (nextId && stepsById.has(nextId)) {
      setPath((p) => [...p, nextId]);
    } else {
      // Leaf — end call
      await endCall();
    }
  }

  async function offScript() {
    if (!auth.orgId || !runId || path.length === 0) return;
    await supabase.from("events").insert({
      run_id: runId, org_id: auth.orgId, step_id: path[path.length - 1], type: "off_script",
    });
    alert("Off-script moment logged.");
  }

  function jumpTo(idx: number) {
    setPath((p) => p.slice(0, idx + 1));
  }

  function pickSibling(siblingStepId: string) {
    // Replace current step with sibling (came from same parent's bypassed responses)
    setPath((p) => [...p.slice(0, -1), siblingStepId]);
  }

  if (auth.loading || isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-xs uppercase tracking-[0.2em] text-muted-foreground">Loading</div>;
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
          entryStepsByScenario={entryStepsByScenario}
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
          onOffScript={offScript}
          onEnd={endCall}
        />
      )}
    </AppShell>
  );
}

function ScenarioPicker({
  script, scripts, onPickScript, entryStepsByScenario, onStart,
}: {
  script: ActiveScript;
  scripts: ActiveScript[];
  onPickScript: (id: string) => void;
  entryStepsByScenario: Map<EntryScenario, ScriptStep[]>;
  onStart: (s: EntryScenario) => void;
}) {
  const scenarios: EntryScenario[] = ["gatekeeper", "direct_contact", "no_name", "cell_vs_company"];
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-serif text-4xl">Start a call</h1>
      <p className="mt-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">Pick the situation</p>

      {scripts.length > 1 && (
        <div className="mt-6">
          <label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Script</label>
          <select
            value={script.id} onChange={(e) => onPickScript(e.target.value)}
            className="mt-1 w-full border border-hairline bg-transparent px-3 py-2 text-sm"
          >
            {scripts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {scenarios.map((s) => {
          const available = (entryStepsByScenario.get(s)?.length ?? 0) > 0;
          return (
            <button
              key={s}
              disabled={!available}
              onClick={() => onStart(s)}
              className="group border border-hairline bg-card p-6 text-left transition-colors hover:border-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Scenario</p>
              <p className="mt-1 font-serif text-2xl">{SCENARIO_LABEL[s]}</p>
              {!available && <p className="mt-2 text-[11px] text-muted-foreground">No entry line</p>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RunnerView({
  script, stepsById, path, scenario, onJump, onPickResponse, onPickSibling, onOffScript, onEnd,
}: {
  script: ActiveScript;
  stepsById: Map<string, ScriptStep>;
  path: string[];
  scenario: EntryScenario;
  onJump: (idx: number) => void;
  onPickResponse: (stepId: string, respId: string, label: string, nextId: string | null | undefined) => void;
  onPickSibling: (stepId: string) => void;
  onOffScript: () => void;
  onEnd: () => void;
}) {
  const currentId = path[path.length - 1];
  const current = stepsById.get(currentId);
  const parentId = path[path.length - 2];
  const parent = parentId ? stepsById.get(parentId) : undefined;

  // Bypassed siblings = parent's responses whose next_step_id != currentId
  const bypassed = (parent?.responses ?? []).filter((r) => r.next_step_id && r.next_step_id !== currentId);

  if (!current) {
    return <div className="px-6 py-12">Step not found.</div>;
  }

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-6">
      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-2 border-b border-hairline pb-4">
        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{SCENARIO_LABEL[scenario]}</span>
        <span className="text-hairline">/</span>
        {path.map((sid, i) => {
          const s = stepsById.get(sid);
          const isLast = i === path.length - 1;
          return (
            <button
              key={sid + i}
              onClick={() => !isLast && onJump(i)}
              disabled={isLast}
              className={`max-w-[200px] truncate border border-hairline px-2 py-1 text-[11px] ${isLast ? "bg-foreground text-background" : "hover:border-foreground"}`}
            >
              {s?.caller_line.slice(0, 30) ?? sid}{s && s.caller_line.length > 30 ? "…" : ""}
            </button>
          );
        })}
      </div>

      {/* 3-column runner */}
      <div className="mt-8 grid gap-6 lg:grid-cols-[260px_1fr_320px]">
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
        <section className="order-1 flex flex-col items-center justify-center px-2 py-10 text-center lg:order-2 lg:px-6 lg:py-20">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">You say</p>
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
                onClick={() => onPickResponse(current.id, r.id, r.label, r.next_step_id)}
                className="w-full border border-hairline bg-card p-4 text-left text-sm transition-colors hover:border-iron hover:text-iron"
              >
                {r.label}
                {!r.next_step_id && <span className="ml-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Ends call</span>}
              </button>
            ))}
          </div>
        </aside>
      </div>

      {/* Off-script + end call */}
      <div className="mt-10 grid gap-2 border-t border-hairline pt-4 sm:grid-cols-[1fr_auto]">
        <button
          onClick={onOffScript}
          className="border border-dashed border-hairline px-4 py-3 text-xs uppercase tracking-[0.2em] text-muted-foreground hover:border-iron hover:text-iron"
        >
          They said something that isn't here
        </button>
        <Button onClick={onEnd} variant="outline" className="rounded-none border-foreground">End call</Button>
      </div>

      <p className="mt-4 text-center text-[10px] text-muted-foreground">Script: {script.name}</p>
    </div>
  );
}
