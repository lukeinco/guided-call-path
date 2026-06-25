import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/signals")({
  ssr: false,
  component: Signals,
});

interface SignalRow {
  id: string;
  created_at: string;
  step_id: string;
  run_id: string;
  call_runs: { caller_id: string; scenario: string; script_id: string } | null;
}

function Signals() {
  const auth = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (auth.loading) return;
    if (!auth.userId) navigate({ to: "/auth", replace: true });
    else if (auth.role !== "admin") navigate({ to: "/navigator", replace: true });
  }, [auth.loading, auth.userId, auth.role, navigate]);

  const { data, isLoading } = useQuery({
    queryKey: ["signals", auth.orgId],
    enabled: !!auth.orgId && auth.role === "admin",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, created_at, step_id, run_id, call_runs(caller_id, scenario, script_id)")
        .eq("type", "off_script")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as unknown as SignalRow[];
    },
  });

  if (auth.loading || auth.role !== "admin") return null;

  return (
    <AppShell title="Off-script signals">
      <div className="mx-auto max-w-[1100px] px-6 py-12">
        <h1 className="font-serif text-4xl">Signals</h1>
        <p className="mt-1 text-xs text-muted-foreground">Last 100 off-script moments across your org.</p>

        <table className="mt-8 w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              <th className="py-2 font-normal">When</th>
              <th className="py-2 font-normal">Scenario</th>
              <th className="py-2 font-normal">Step</th>
              <th className="py-2 font-normal">Caller</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={4} className="py-4 text-muted-foreground">Loading…</td></tr>}
            {!isLoading && (data?.length ?? 0) === 0 && (
              <tr><td colSpan={4} className="py-4 text-muted-foreground">No off-script moments yet.</td></tr>
            )}
            {data?.map((r) => (
              <tr key={r.id} className="border-b border-hairline/60">
                <td className="py-3 text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                <td className="py-3">{r.call_runs?.scenario ?? "—"}</td>
                <td className="py-3 font-mono text-xs">{r.step_id}</td>
                <td className="py-3 font-mono text-xs text-muted-foreground">{r.call_runs?.caller_id?.slice(0, 8) ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
