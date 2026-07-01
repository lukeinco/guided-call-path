import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth, isAdminish } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/editor")({
  ssr: false,
  component: EditorLayout,
});

function EditorLayout() {
  const auth = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (auth.loading) return;
    if (!auth.userId) navigate({ to: "/auth", replace: true });
    else if (!isAdminish(auth.role)) navigate({ to: "/navigator", replace: true });
  }, [auth.loading, auth.userId, auth.role, navigate]);

  if (auth.loading || !auth.userId || !isAdminish(auth.role)) {
    return <div className="flex min-h-screen items-center justify-center text-xs uppercase tracking-[0.2em] text-muted-foreground">Loading</div>;
  }
  return (
    <AppShell title="Script editor">
      <Outlet />
    </AppShell>
  );
}
