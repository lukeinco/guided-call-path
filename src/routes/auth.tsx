import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isAdminish } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

function AuthPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!auth.loading && auth.userId) {
      if (!auth.orgId && auth.role !== "superadmin") {
        navigate({ to: "/join", replace: true });
      } else {
        navigate({ to: auth.role === "admin" ? "/editor" : "/navigator", replace: true });
      }
    }
  }, [auth.loading, auth.userId, auth.orgId, auth.role, navigate]);

  async function handleGoogle() {
    setError(null);
    // NOTE: For a Google login to merge with a prior email/password account on
    // the same address into ONE user, enable "Link identities with same email"
    // in the Supabase dashboard under Authentication → Settings. Without it,
    // Supabase creates a distinct user for the Google identity.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) setError(error.message);
  }


  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              display_name: displayName,
              join_code: joinCode.trim() || null,
            },
          },
        });
        if (error) throw error;
      }
      await auth.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="font-serif text-4xl">Script<span className="text-iron">.</span></h1>
        <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
          {mode === "signin" ? "Sign in" : "Create account"}
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          {mode === "signup" && (
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Display name</label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Email</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Password</label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </div>
          {mode === "signup" && (
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Join code (optional)
              </label>
              <Input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Leave blank to create your own org"
              />
              <p className="text-[11px] text-muted-foreground">
                With a valid code you join as a caller. Blank creates a new org and makes you admin.
              </p>
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}

          <Button type="submit" disabled={busy} className="w-full rounded-none bg-foreground text-background hover:bg-foreground/90">
            {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <div className="mt-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-hairline" />
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">or</span>
          <div className="h-px flex-1 bg-hairline" />
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={handleGoogle}
          className="mt-4 w-full rounded-none border-foreground/40"
        >
          Continue with Google
        </Button>

        <button
          onClick={() => { setError(null); setMode(mode === "signin" ? "signup" : "signin"); }}
          className="mt-6 text-xs uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground"
        >
          {mode === "signin" ? "Need an account?" : "Have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
