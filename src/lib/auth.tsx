import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "caller" | "superadmin";

interface AuthState {
  loading: boolean;
  userId: string | null;
  email: string | null;
  orgId: string | null;
  orgName: string | null;
  joinCode: string | null;
  role: AppRole | null;
  displayName: string | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<AuthState, "refresh" | "signOut">>({
    loading: true,
    userId: null,
    email: null,
    orgId: null,
    orgName: null,
    joinCode: null,
    role: null,
    displayName: null,
  });

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setState({ loading: false, userId: null, email: null, orgId: null, orgName: null, joinCode: null, role: null, displayName: null });
      return;
    }
    const [{ data: profile }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("org_id, display_name, orgs(name, join_code)").eq("id", user.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", user.id),
    ]);
    const role: AppRole | null = roles?.some((r: { role: string }) => r.role === "admin")
      ? "admin"
      : roles?.some((r: { role: string }) => r.role === "caller")
      ? "caller"
      : null;
    const org = (profile as { orgs?: { name: string; join_code: string } | null } | null)?.orgs ?? null;
    setState({
      loading: false,
      userId: user.id,
      email: user.email ?? null,
      orgId: profile?.org_id ?? null,
      orgName: org?.name ?? null,
      joinCode: org?.join_code ?? null,
      role,
      displayName: profile?.display_name ?? null,
    });
  }

  useEffect(() => {
    void loadProfile();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        void loadProfile();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value: AuthState = {
    ...state,
    refresh: loadProfile,
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
