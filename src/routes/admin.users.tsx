import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useActingOrg } from "@/lib/acting-org";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/admin/users")({
  ssr: false,
  component: AdminUsers,
});

interface UserRow {
  id: string;
  display_name: string | null;
  org_id: string;
  orgs: { id: string; name: string } | null;
  user_roles: { role: string }[] | null;
  email?: string | null;
}

function AdminUsers() {
  const auth = useAuth();
  const acting = useActingOrg();
  const navigate = useNavigate();

  useEffect(() => {
    if (auth.loading) return;
    if (!auth.userId) navigate({ to: "/auth", replace: true });
    else if (auth.role !== "superadmin") navigate({ to: "/navigator", replace: true });
  }, [auth.loading, auth.userId, auth.role, navigate]);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users"],
    enabled: auth.role === "superadmin",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, org_id, orgs(id, name), user_roles:user_roles!user_roles_user_id_fkey(role)")
        .order("created_at", { ascending: false });
      if (error) {
        // Fallback if no explicit FK relationship on user_roles.user_id: fetch roles separately.
        const { data: profiles, error: e1 } = await supabase
          .from("profiles")
          .select("id, display_name, org_id, orgs(id, name)")
          .order("created_at", { ascending: false });
        if (e1) throw e1;
        const ids = (profiles ?? []).map((p) => p.id);
        const { data: roles } = await supabase.from("user_roles").select("user_id, role").in("user_id", ids);
        const byUser = new Map<string, { role: string }[]>();
        for (const r of roles ?? []) {
          const list = byUser.get(r.user_id) ?? [];
          list.push({ role: r.role });
          byUser.set(r.user_id, list);
        }
        return (profiles ?? []).map((p) => ({ ...p, user_roles: byUser.get(p.id) ?? [] })) as unknown as UserRow[];
      }
      return data as unknown as UserRow[];
    },
  });

  if (auth.loading || auth.role !== "superadmin") return null;

  function openOrg(row: UserRow) {
    if (!row.orgs) return;
    acting.setActingOrg({ id: row.orgs.id, name: row.orgs.name });
    navigate({ to: "/editor" });
  }

  function primaryRole(roles: { role: string }[] | null): string {
    const r = (roles ?? []).map((x) => x.role);
    if (r.includes("superadmin")) return "superadmin";
    if (r.includes("admin")) return "admin";
    if (r.includes("caller")) return "caller";
    return "—";
  }

  return (
    <AppShell title="All users">
      <div className="mx-auto max-w-[1100px] px-6 py-12">
        <h1 className="font-serif text-4xl">Users</h1>
        <p className="mt-1 text-xs text-muted-foreground">Every profile across every org. Superadmin view.</p>

        <table className="mt-8 w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              <th className="py-2 font-normal">Name</th>
              <th className="py-2 font-normal">User</th>
              <th className="py-2 font-normal">Org</th>
              <th className="py-2 font-normal">Role</th>
              <th className="py-2 font-normal text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="py-4 text-muted-foreground">Loading…</td></tr>}
            {!isLoading && (data?.length ?? 0) === 0 && (
              <tr><td colSpan={5} className="py-4 text-muted-foreground">No users yet.</td></tr>
            )}
            {data?.map((r) => (
              <tr key={r.id} className="border-b border-hairline/60">
                <td className="py-3">{r.display_name ?? "—"}</td>
                <td className="py-3 font-mono text-xs text-muted-foreground">{r.id.slice(0, 8)}</td>
                <td className="py-3">{r.orgs?.name ?? "—"}</td>
                <td className="py-3 text-muted-foreground">{primaryRole(r.user_roles)}</td>
                <td className="py-3 text-right">
                  <button
                    onClick={() => openOrg(r)}
                    disabled={!r.orgs}
                    className="text-xs uppercase tracking-[0.16em] hover:text-iron disabled:opacity-40"
                  >
                    Open org
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
