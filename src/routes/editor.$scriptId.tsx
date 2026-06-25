import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  type ScriptDefinition,
  type ScriptStep,
  type EntryScenario,
  SCENARIO_LABEL,
  newStepId,
  newResponseId,
} from "@/lib/script-types";

export const Route = createFileRoute("/editor/$scriptId")({
  ssr: false,
  component: ScriptEditor,
});

function ScriptEditor() {
  const { scriptId } = Route.useParams();
  const navigate = useNavigate();
  const auth = useAuth();

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
      setDefinition(data.definition as ScriptDefinition);
    }
  }, [data]);

  function updateStep(idx: number, patch: Partial<ScriptStep>) {
    setDefinition((d) => ({ steps: d.steps.map((s, i) => (i === idx ? { ...s, ...patch } : s)) }));
  }
  function addStep() {
    setDefinition((d) => ({ steps: [...d.steps, { id: newStepId(), caller_line: "", responses: [] }] }));
  }
  function removeStep(idx: number) {
    if (!confirm("Delete this step? Any responses pointing to it will need updating.")) return;
    setDefinition((d) => ({ steps: d.steps.filter((_, i) => i !== idx) }));
  }
  function addResponse(stepIdx: number) {
    updateStep(stepIdx, {
      responses: [...definition.steps[stepIdx].responses, { id: newResponseId(), label: "", next_step_id: null }],
    });
  }
  function updateResponse(stepIdx: number, respIdx: number, patch: Partial<{ label: string; next_step_id: string | null }>) {
    const step = definition.steps[stepIdx];
    updateStep(stepIdx, {
      responses: step.responses.map((r, i) => (i === respIdx ? { ...r, ...patch } : r)),
    });
  }
  function removeResponse(stepIdx: number, respIdx: number) {
    const step = definition.steps[stepIdx];
    updateStep(stepIdx, { responses: step.responses.filter((_, i) => i !== respIdx) });
  }

  async function save({ asNewVersion }: { asNewVersion: boolean }) {
    if (!auth.orgId || !data) return;
    setSaving(true);
    try {
      if (asNewVersion) {
        // Find highest version of this name and bump
        const { data: rows } = await supabase
          .from("scripts").select("version").eq("name", name).order("version", { ascending: false }).limit(1);
        const nextVersion = (rows?.[0]?.version ?? data.version) + 1;
        // Deactivate siblings
        await supabase.from("scripts").update({ is_active: false }).eq("name", name);
        const { data: inserted, error } = await supabase
          .from("scripts")
          .insert({ org_id: auth.orgId, name, version: nextVersion, is_active: true, definition })
          .select("id").single();
        if (error) throw error;
        navigate({ to: "/editor/$scriptId", params: { scriptId: inserted.id }, replace: true });
      } else {
        const { error } = await supabase.from("scripts").update({ name, definition }).eq("id", scriptId);
        if (error) throw error;
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

  const stepOptions = definition.steps.map((s) => ({
    id: s.id,
    label: s.caller_line.slice(0, 60) || "(empty step)",
  }));

  return (
    <div className="mx-auto max-w-[900px] px-6 py-10">
      <Link to="/editor" className="text-xs uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground">
        ← All scripts
      </Link>

      <div className="mt-4 flex items-end justify-between gap-6 border-b border-hairline pb-6">
        <div className="flex-1">
          <label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Script name</label>
          <input
            value={name} onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full bg-transparent font-serif text-3xl outline-none"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Version {data.version} · {data.is_active ? <span className="text-iron">Active</span> : "Draft"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2">
            <Button onClick={() => save({ asNewVersion: false })} disabled={saving} variant="outline" className="rounded-none border-foreground">
              Save draft
            </Button>
            <Button onClick={() => save({ asNewVersion: true })} disabled={saving} className="rounded-none">
              Save as new active version
            </Button>
          </div>
          {savedAt && <p className="text-[11px] text-muted-foreground">Saved at {savedAt}</p>}
        </div>
      </div>

      <div className="mt-8 space-y-6">
        {definition.steps.map((step, idx) => (
          <article key={step.id} className="border border-hairline bg-card p-5">
            <header className="flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              <span>Step {idx + 1} · <code className="font-mono normal-case">{step.id}</code></span>
              <button onClick={() => removeStep(idx)} className="text-muted-foreground hover:text-destructive">
                Delete step
              </button>
            </header>

            <div className="mt-3">
              <label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Caller line</label>
              <Textarea
                value={step.caller_line}
                onChange={(e) => updateStep(idx, { caller_line: e.target.value })}
                rows={2}
                className="mt-1 rounded-none border-hairline bg-transparent font-serif text-lg"
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={!!step.is_entry}
                  onChange={(e) => updateStep(idx, { is_entry: e.target.checked, entry_scenario: e.target.checked ? step.entry_scenario ?? "gatekeeper" : null })}
                />
                Entry step
              </label>
              {step.is_entry && (
                <select
                  value={step.entry_scenario ?? "gatekeeper"}
                  onChange={(e) => updateStep(idx, { entry_scenario: e.target.value as EntryScenario })}
                  className="border border-hairline bg-transparent px-2 py-1 text-xs"
                >
                  {(Object.keys(SCENARIO_LABEL) as EntryScenario[]).map((s) => (
                    <option key={s} value={s}>{SCENARIO_LABEL[s]}</option>
                  ))}
                </select>
              )}
            </div>

            <div className="mt-5">
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Responses</p>
              <div className="mt-2 space-y-2">
                {step.responses.map((r, ri) => (
                  <div key={r.id} className="grid grid-cols-[1fr_220px_auto] gap-2">
                    <Input
                      value={r.label}
                      onChange={(e) => updateResponse(idx, ri, { label: e.target.value })}
                      placeholder="What they said"
                      className="rounded-none border-hairline"
                    />
                    <select
                      value={r.next_step_id ?? ""}
                      onChange={(e) => updateResponse(idx, ri, { next_step_id: e.target.value || null })}
                      className="border border-hairline bg-transparent px-2 text-xs"
                    >
                      <option value="">— Ends call —</option>
                      {stepOptions.filter((o) => o.id !== step.id).map((o) => (
                        <option key={o.id} value={o.id}>{o.label}</option>
                      ))}
                    </select>
                    <button onClick={() => removeResponse(idx, ri)} className="px-2 text-xs text-muted-foreground hover:text-destructive">
                      ✕
                    </button>
                  </div>
                ))}
                <button onClick={() => addResponse(idx)} className="text-xs uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground">
                  + Add response
                </button>
              </div>
            </div>
          </article>
        ))}

        <button onClick={addStep} className="w-full border border-dashed border-hairline py-4 text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground">
          + Add step
        </button>
      </div>
    </div>
  );
}
