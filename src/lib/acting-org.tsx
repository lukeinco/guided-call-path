import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";

const STORAGE_KEY = "acting_org_v1";

export interface ActingOrg {
  id: string;
  name: string;
}

interface ActingOrgState {
  actingOrg: ActingOrg | null;
  setActingOrg: (org: ActingOrg | null) => void;
  clearActingOrg: () => void;
  /** The org id the app should read/write against — acting org for superadmins, else the user's own org. */
  activeOrgId: string | null;
  /** True when a superadmin is currently acting as another org. */
  isActing: boolean;
}

const Ctx = createContext<ActingOrgState | null>(null);

export function ActingOrgProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [actingOrg, setActingOrgState] = useState<ActingOrg | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        setActingOrgState(JSON.parse(raw));
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  // Only superadmins get to "act as" another org.
  useEffect(() => {
    if (!auth.loading && auth.role !== "superadmin" && actingOrg) {
      setActingOrgState(null);
      if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY);
    }
  }, [auth.loading, auth.role, actingOrg]);

  const setActingOrg = useCallback((org: ActingOrg | null) => {
    setActingOrgState(org);
    if (typeof window === "undefined") return;
    if (org) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(org));
    else window.localStorage.removeItem(STORAGE_KEY);
  }, []);

  const clearActingOrg = useCallback(() => setActingOrg(null), [setActingOrg]);

  const isActing = auth.role === "superadmin" && !!actingOrg;
  const activeOrgId = isActing ? actingOrg!.id : auth.orgId;

  return (
    <Ctx.Provider value={{ actingOrg: isActing ? actingOrg : null, setActingOrg, clearActingOrg, activeOrgId, isActing }}>
      {children}
    </Ctx.Provider>
  );
}

export function useActingOrg() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useActingOrg must be used within ActingOrgProvider");
  return v;
}
