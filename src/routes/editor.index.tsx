import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { emptyDefinition } from "@/lib/script-types";
import { sampleDefinition, SAMPLE_SCRIPT_NAME } from "@/lib/sample-script";
import { useState } from "react";

export const Route = createFileRoute("/editor/")({
  ssr: false,
  component: EditorList,
});

interface ScriptRow {
  id: string;
  name: string;
  version: number;
  is_active: boolean;
  created_at: string;
}

function EditorList() {
  const auth = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const { data: scripts, isLoading } = useQuery({
    queryKey: ["scripts", auth.orgId],
    enabled: !!auth.orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scripts")
        .select("id, name, version, is_active, created_at")
        .order("name").order("version", { ascending: false });
      if (error) throw error;
      return data as ScriptRow[];
    },
  });

  async function createBlank() {
    if (!auth.orgId) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("scripts")
      .insert({ org_id: auth.orgId, name: "Untitled script", version: 1, is_active: false, definition: emptyDefinition() })
      .select("id").single();
    setBusy(false);
    if (error) return alert(error.message);
    navigate({ to: "/editor/$scriptId", params: { scriptId: data.id } });
  }

  async function loadSample() {
    if (!auth.orgId) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("scripts")
      .insert({ org_id: auth.orgId, name: SAMPLE_SCRIPT_NAME, version: 1, is_active: true, definition: sampleDefinition })
      .select("id").single();
    setBusy(false);
    if (error) return alert(error.message);
    await qc.invalidateQueries({ queryKey: ["scripts"] });
    navigate({ to: "/editor/$scriptId", params: { scriptId: data.id } });
  }

  async function setActive(row: ScriptRow) {
    // Deactivate other versions of same name in this org, then activate this one.
    await supabase.from("scripts").update({ is_active: false }).eq("name", row.name).neq("id", row.id);
    await supabase.from("scripts").update({ is_active: true }).eq("id", row.id);
    qc.invalidateQueries({ queryKey: ["scripts"] });
  }

  // Group by name
  const grouped: Record<string, ScriptRow[]> = {};
  for (const s of scripts ?? []) {
    (grouped[s.name] ||= []).push(s);
  }

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-12">
      <div className="flex items-end justify-between gap-6 border-b border-hairline pb-6">
        <div>
          <h1 className="font-serif text-4xl">Scripts</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Your org · <span className="font-mono">{auth.orgName}</span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Join code</p>
          <code className="font-mono text-lg tracking-widest text-iron">{auth.joinCode}</code>
          <p className="text-[11px] text-muted-foreground">Share this so callers can sign up into your org.</p>
        </div>
      </div>

      <div className="mt-6 flex gap-3">
        <Button onClick={createBlank} disabled={busy} className="rounded-none">New script</Button>
        <Button onClick={loadSample} disabled={busy} variant="outline" className="rounded-none border-foreground">
          Load sample MSP script
        </Button>
      </div>

      <div className="mt-10 space-y-10">
        {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
        {!isLoading && Object.keys(grouped).length === 0 && (
          <p className="text-sm text-muted-foreground">No scripts yet. Start with the sample or a blank one.</p>
        )}
        {Object.entries(grouped).map(([name, versions]) => (
          <section key={name}>
            <h2 className="font-serif text-2xl">{name}</h2>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  <th className="py-2 font-normal">Version</th>
                  <th className="py-2 font-normal">Status</th>
                  <th className="py-2 font-normal">Created</th>
                  <th className="py-2 font-normal text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {versions.map((v) => (
                  <tr key={v.id} className="border-b border-hairline/60">
                    <td className="py-3 font-mono">v{v.version}</td>
                    <td className="py-3">
                      {v.is_active ? <span className="text-iron">Active</span> : <span className="text-muted-foreground">Draft</span>}
                    </td>
                    <td className="py-3 text-muted-foreground">{new Date(v.created_at).toLocaleDateString()}</td>
                    <td className="py-3 text-right">
                      <Link to="/editor/$scriptId" params={{ scriptId: v.id }} className="text-xs uppercase tracking-[0.16em] hover:text-iron">
                        Edit
                      </Link>
                      {!v.is_active && (
                        <button onClick={() => setActive(v)} className="ml-4 text-xs uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground">
                          Set active
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </div>
  );
}
