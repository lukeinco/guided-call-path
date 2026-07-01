import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isAdminish } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/join")({
  ssr: false,
  component: JoinPage,
});

function JoinPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (auth.loading) return;
    if (!auth.userId) {
      navigate({ to: "/auth", replace: true });
    } else if (auth.orgId) {
      navigate({ to: isAdminish(auth.role) ? "/editor" : "/navigator", replace: true });
    } else if (auth.displayName && !displayName) {
      setDisplayName(auth.displayName);
    }
  }, [auth.loading, auth.userId, auth.orgId, auth.role, auth.displayName, displayName, navigate]);

  async function joinExisting(e: React.FormEvent) {
    e.preventDefault();
    if (!auth.userId) return;
    setBusy(true); setError(null);
    try {
      const code = joinCode.trim().toUpperCase();
      const { data: org, error: e1 } = await supabase
        .from("orgs").select("id").eq("join_code", code).maybeSingle();
      if (e1) throw e1;
      if (!org) throw new Error("Invalid join code");

      const name = displayName.trim() || (auth.email ?? "").split("@")[0];
      const { error: e2 } = await supabase
        .from("profiles")
        .upsert({ id: auth.userId, org_id: org.id, display_name: name });
      if (e2) throw e2;

      const { error: e3 } = await supabase
        .from("user_roles")
        .insert({ user_id: auth.userId, role: "caller" });
      if (e3 && !e3.message.toLowerCase().includes("duplicate")) throw e3;

      await auth.refresh();
      navigate({ to: "/navigator", replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join org");
    } finally {
      setBusy(false);
    }
  }

  async function createNew(e: React.FormEvent) {
    e.preventDefault();
    if (!auth.userId) return;
    setBusy(true); setError(null);
    try {
      const name = displayName.trim() || (auth.email ?? "").split("@")[0];
      const orgLabel = orgName.trim() || `${name}'s org`;
      const { data: org, error: e1 } = await supabase
        .from("orgs").insert({ name: orgLabel }).select("id").single();
      if (e1) throw e1;

      const { error: e2 } = await supabase
        .from("profiles")
        .upsert({ id: auth.userId, org_id: org.id, display_name: name });
      if (e2) throw e2;

      const { error: e3 } = await supabase
        .from("user_roles")
        .insert({ user_id: auth.userId, role: "admin" });
      if (e3 && !e3.message.toLowerCase().includes("duplicate")) throw e3;

      await auth.refresh();
      navigate({ to: "/editor", replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create org");
    } finally {
      setBusy(false);
    }
  }

  if (auth.loading || !auth.userId) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-md">
        <h1 className="font-serif text-4xl">One more step<span className="text-iron">.</span></h1>
        <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Join a team or start your own
        </p>

        <div className="mt-8 space-y-1.5">
          <label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Your name</label>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name" />
        </div>

        <form onSubmit={joinExisting} className="mt-8 border-t border-hairline pt-6 space-y-3">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Join with a code</p>
          <Input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="TEAM CODE"
          />
          <Button
            type="submit"
            disabled={busy || !joinCode.trim()}
            className="w-full rounded-none bg-foreground text-background hover:bg-foreground/90"
          >
            Join as caller
          </Button>
        </form>

        <form onSubmit={createNew} className="mt-8 border-t border-hairline pt-6 space-y-3">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Or start a new org</p>
          <Input
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="Org name (optional)"
          />
          <Button
            type="submit"
            variant="outline"
            disabled={busy}
            className="w-full rounded-none border-foreground/40"
          >
            Create org, become admin
          </Button>
        </form>

        {error && <p className="mt-4 text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}
