import { Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import type { ReactNode } from "react";

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const auth = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await auth.signOut();
    navigate({ to: "/auth" });
  }

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
            {auth.role === "admin" && (
              <>
                <Link to="/editor" activeProps={{ className: "text-foreground" }}>
                  Editor
                </Link>
                <Link to="/signals" activeProps={{ className: "text-foreground" }}>
                  Signals
                </Link>
              </>
            )}
            <span className="text-hairline">|</span>
            <span className="normal-case tracking-normal">{auth.displayName ?? auth.email}</span>
            <button onClick={handleSignOut} className="cursor-pointer hover:text-foreground">
              Sign out
            </button>
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
