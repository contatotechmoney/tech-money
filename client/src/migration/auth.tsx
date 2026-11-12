import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from "react";
import { queryClient } from "@/lib/queryClient";
import { localInvestPreview } from "./invest-preview-session";

type Session = { id: string; email: string; canViewInternalCosts: boolean };
type AuthState = { loaded: boolean; session: Session | null; customerPilot: boolean; persistentCredits: boolean };
const initialAuth: AuthState = { loaded: false, session: null, customerPilot: false, persistentCredits: false };
const Context = createContext<AuthState>(initialAuth);

export function MigrationAuthProvider({ children }: { children: ReactNode }) {
  const lastIdentity = useRef<string | null>(null);
  const [state, setState] = useState(initialAuth);

  useEffect(() => {
    let active = true;
    let sequence = 0;
    async function check() {
      const checkId = ++sequence;
      try {
        const response = await fetch("/api/migration/session", { credentials: "same-origin", cache: "no-store" });
        const result = response.ok ? await response.json() : null;
        if (!active || checkId !== sequence) return;

        const customerPilot = result?.accessMode === "customer-pilot";
        const user = (customerPilot ? result.authenticated === true : result?.ownerBound === true) ? result.user : null;
        const session = typeof user?.id === "string" && typeof user.email === "string" ? {
          id: user.id,
          email: user.email,
          canViewInternalCosts: !customerPilot && (result.canViewInternalCosts === true || (localInvestPreview && user.id === "local-demo")),
        } : null;
        const identity = session ? `${customerPilot ? "pilot" : "owner"}:${session.id}` : null;
        if (lastIdentity.current !== identity) {
          queryClient.clear();
          lastIdentity.current = identity;
        }
        setState({ loaded: true, session, customerPilot, persistentCredits: customerPilot && result?.persistentCredits === true });
      } catch {
        if (!active || checkId !== sequence) return;
        queryClient.clear();
        lastIdentity.current = null;
        setState(current => ({ ...current, loaded: true, session: null }));
      }
    }

    void check();
    const timer = window.setInterval(check, 60_000);
    window.addEventListener("focus", check);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, []);

  return <Context.Provider value={state}>{children}</Context.Provider>;
}

export function useAuth() {
  const { loaded, session, customerPilot, persistentCredits } = useContext(Context);
  return { isLoaded: loaded, isSignedIn: !!session, userId: session?.id ?? null, sessionId: null,
    canViewInternalCosts: session?.canViewInternalCosts === true, customerPilot, persistentCredits };
}

export function useUser() {
  const { loaded, session } = useContext(Context);
  return { isLoaded: loaded, isSignedIn: !!session,
    user: session ? { id: session.id, fullName: null, primaryEmailAddress: { emailAddress: session.email } } : null };
}

export function useClerk() {
  const { customerPilot } = useContext(Context);
  return {
    signOut: async (_options?: unknown) => {
      const path = customerPilot ? "/api/migration/customer-pilot/logout" : "/api/migration/auth/logout";
      const response = await fetch(path, { method: "POST", credentials: "same-origin" });
      if (!response.ok) throw Error("Não foi possível encerrar sua sessão.");
      queryClient.clear();
      window.location.replace(customerPilot ? "/piloto/entrar" : "/migration/login");
    },
  };
}
