import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth, isAdminish } from "@/lib/auth";

export const Route = createFileRoute("/")({
  ssr: false,
  component: Index,
});

function Index() {
  const auth = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (auth.loading) return;
    if (!auth.userId) navigate({ to: "/auth", replace: true });
    else if (auth.role === "admin") navigate({ to: "/editor", replace: true });
    else navigate({ to: "/navigator", replace: true });
  }, [auth.loading, auth.userId, auth.role, navigate]);
  return (
    <div className="flex min-h-screen items-center justify-center text-xs uppercase tracking-[0.2em] text-muted-foreground">
      Loading
    </div>
  );
}
