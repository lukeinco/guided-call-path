import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import type { ScriptDefinition, ScriptStep } from "@/lib/script-types";

export const Route = createFileRoute("/signals")({
  ssr: false,
  component: Gaps,
});

interface GapRow {
  id: string;
  created_at: string;
  step_id: string;
  section_type: string | null;
  detail: string | null;
  type: string;
  reviewed_at: string | null;
  run_id: string;
  call_runs: { caller_id: string; scenario: string; script_id: string } | null;
}

interface ScriptLite {
  id: string;
  name: string;
  definition: ScriptDefinition;
}

export function Gaps() {
  const auth = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (auth.loading) return;
    if (!auth.userId) navigate({ to: "/auth", replace: true });
    else if (auth.role !== "admin" && auth.role !== "superadmin")
      navigate({ to: "/navigator", replace: true });
  }, [auth.loading, auth.userId, auth.role, navigate]);

  const { data: gaps, isLoading } = useQuery({
    queryKey: ["gaps", auth.orgId],
    enabled: !!auth.userId && (auth.role === "admin" || auth.role === "superadmin"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select(
          "id, created_at, step_id, section_type, detail, type, reviewed_at, run_id, call_runs(caller_id, scenario, script_id)",
        )
        .in("type", ["not_accounted_for", "off_script"])
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as unknown as GapRow[];
    },
  });

  const scriptIds = useMemo(
    () => Array.from(new Set((gaps ?? []).map((g) => g.call_runs?.script_id).filter(Boolean) as string[])),
    [gaps],
  );

  const { data: scripts } = useQuery({
    queryKey: ["gaps-scripts", scriptIds.join(",")],
    enabled: scriptIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scripts")
        .select("id, name, definition")
        .in("id", scriptIds);
      if (error) throw error;
      return data as unknown as ScriptLite[];
    },
  });

  const stepIndex = useMemo(() => {
    const m = new Map<string, { script: ScriptLite; step: ScriptStep }>();
    (scripts ?? []).forEach((sc) => {
      (sc.definition?.steps ?? []).forEach((st) => m.set(`${sc.id}:${st.id}`, { script: sc, step: st }));
    });
    return m;
  }, [scripts]);

  async function markReviewed(id: string) {
    const { error } = await supabase
      .from("events")
      .update({ reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (!error) {
      qc.invalidateQueries({ queryKey: ["gaps"] });
      qc.invalidateQueries({ queryKey: ["gap-count"] });
    }
  }

  if (auth.loading || (auth.role !== "admin" && auth.role !== "superadmin")) return null;

  return (
    <AppShell title="Gaps inbox">
      <div className="mx-auto max-w-[1100px] px-6 py-12">
        <h1 className="font-serif text-4xl">Gaps</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Moments where the prospect said something the script didn't account for.
          Each one is a chance to add a response and cover that branch next time.
        </p>

        <div className="mt-8 space-y-3">
          {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
          {!isLoading && (gaps?.length ?? 0) === 0 && (
            <p className="text-xs text-muted-foreground">No gaps yet — the script has held up.</p>
          )}
          {gaps?.map((g) => {
            const scriptId = g.call_runs?.script_id ?? null;
            const key = scriptId ? `${scriptId}:${g.step_id}` : null;
            const found = key ? stepIndex.get(key) : null;
            const callerLine = found?.step.caller_line ?? "(step no longer in script)";
            const section = g.section_type ?? found?.step.section_type ?? null;
            const isNew = !g.reviewed_at;
            return (
              <div
                key={g.id}
                className={`border border-hairline p-4 ${isNew ? "bg-parchment/40" : "bg-background"}`}
              >
                <div className="flex items-start justify-between gap-6">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      <span>{new Date(g.created_at).toLocaleString()}</span>
                      {section && (
                        <>
                          <span className="text-hairline">·</span>
                          <span>{section.replace(/_/g, " ")}</span>
                        </>
                      )}
                      {g.type === "off_script" && (
                        <>
                          <span className="text-hairline">·</span>
                          <span>legacy</span>
                        </>
                      )}
                      {isNew && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-iron" />}
                    </div>
                    <p className="mt-2 font-serif text-lg leading-snug">{callerLine}</p>
                    {g.detail && (
                      <p className="mt-2 text-sm">
                        <span className="text-muted-foreground">They said: </span>
                        <span className="italic">"{g.detail}"</span>
                      </p>
                    )}
                    <p className="mt-2 font-mono text-[10px] text-muted-foreground">
                      caller {g.call_runs?.caller_id?.slice(0, 8) ?? "—"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {scriptId && found && (
                      <Link
                        to="/editor/$scriptId"
                        params={{ scriptId }}
                        search={{ openStep: g.step_id, addResponse: 1 }}
                      >
                        <Button size="sm" variant="outline">
                          Add response to this step
                        </Button>
                      </Link>
                    )}
                    {isNew && (
                      <button
                        onClick={() => markReviewed(g.id)}
                        className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground"
                      >
                        Mark reviewed
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}

export default Gaps;
