import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useActingOrg } from "@/lib/acting-org";
import { supabase } from "@/integrations/supabase/client";
import type { ReactNode } from "react";

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const auth = useAuth();
  const acting = useActingOrg();
  const navigate = useNavigate();

  async function handleSignOut() {
    await auth.signOut();
    navigate({ to: "/auth" });
  }

  const isSuper = auth.role === "superadmin";
  const showAdminNav = auth.role === "admin" || isSuper;

  const { data: gapCount = 0 } = useQuery({
    queryKey: ["gap-count", auth.orgId, isSuper],
    enabled: showAdminNav && !!auth.userId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("events")
        .select("id", { count: "exact", head: true })
        .in("type", ["not_accounted_for", "off_script"])
        .is("reviewed_at", null);
      if (error) return 0;
      return count ?? 0;
    },
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-hairline">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-6 px-6 py-4">
          <div className="flex items-center gap-8">
            <Link to="/" className="font-serif text-xl tracking-tight">
              Script<span className="text-iron">.</span>
            </Link>
            {title && <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{title}</span>}
          </div>
          <nav className="flex items-center gap-5 text-xs uppercase tracking-[0.16em] text-muted-foreground">
            <Link to="/navigator" activeProps={{ className: "text-foreground" }}>
              Navigator
            </Link>
            {showAdminNav && (
              <>
                <Link to="/editor" activeProps={{ className: "text-foreground" }}>
                  Editor
                </Link>
                <Link
                  to="/signals"
                  activeProps={{ className: "text-foreground" }}
                  className="flex items-center gap-1.5"
                >
                  Gaps
                  {gapCount > 0 && (
                    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-iron px-1 font-mono text-[9px] normal-case tracking-normal text-parchment">
                      {gapCount > 99 ? "99+" : gapCount}
                    </span>
                  )}
                </Link>
              </>
            )}
            {isSuper && (
              <Link to="/admin/users" activeProps={{ className: "text-foreground" }}>
                Users
              </Link>
            )}
            <span className="text-hairline">|</span>
            <span className="normal-case tracking-normal">{auth.displayName ?? auth.email}</span>
            <button onClick={handleSignOut} className="cursor-pointer hover:text-foreground">
              Sign out
            </button>
          </nav>
        </div>
      </header>

      {acting.isActing && acting.actingOrg && (
        <div className="border-b border-hairline bg-iron/5">
          <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-6 px-6 py-2 text-xs">
            <span className="tracking-[0.12em] text-iron">
              Acting as <span className="font-mono">{acting.actingOrg.name}</span>
            </span>
            <button
              onClick={() => {
                acting.clearActingOrg();
                navigate({ to: "/admin/users" });
              }}
              className="uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground"
            >
              Exit
            </button>
          </div>
        </div>
      )}

      <main>{children}</main>
    </div>
  );
}
