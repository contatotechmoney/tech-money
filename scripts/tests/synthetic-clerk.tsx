// TEST FIXTURE ONLY. Aliased exclusively by simulation-browser-server.ts.
// Never imported by production; no Clerk API, account creation, email or token.
import * as React from "react";

const Context = React.createContext<any>(null);
function identity() {
  const match = document.cookie.match(/(?:^|;\s*)tm_sim_fixture=(alpha|beta)(?:;|$)/);
  return match?.[1] ?? null;
}
export function publishableKeyFromHost() { return "synthetic-test-fixture-not-a-key"; }
export function ClerkProvider({ children }: { children: React.ReactNode; [key: string]: unknown }) {
  const [actor, setActor] = React.useState(identity);
  const attempt = React.useMemo(() => {
    let identifier = "";
    const value = {
      status: "needs_identifier",
      supportedFirstFactors: [{ strategy: "email_code", emailAddressId: "fixture-email" }],
      async create(input: { identifier: string }) {
        identifier = input.identifier; value.status = "needs_first_factor"; return value;
      },
      async prepareFirstFactor() { return value; }, // No email is sent.
      async attemptFirstFactor(input: { code: string }) {
        if (input.code !== "000000") throw Error("Use somente o código fictício 000000.");
        const response = await fetch("/__fixture/sign-in", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ identifier }),
        });
        if (!response.ok) throw Error("Identidade fictícia inválida.");
        return { status: "complete", createdSessionId: "synthetic-session" };
      },
    };
    return value;
  }, []);
  const session = actor ? { id: "synthetic-session", currentTask: null } : null;
  const user = actor ? {
    id: `synthetic-${actor}`, firstName: "Synthetic", lastName: actor,
    fullName: `Synthetic ${actor}`, imageUrl: "",
    primaryEmailAddress: { emailAddress: `${actor}@example.test`, verification: { status: "verified" } },
    publicMetadata: {}, unsafeMetadata: {},
  } : null;
  const value = {
    actor, user, session, attempt,
    addListener(listener: (state: { user: unknown }) => void) {
      listener({ user });
      return () => {};
    },
    async setActive(input: { navigate?: (value: { session: unknown }) => Promise<void> }) {
      setActor(identity());
      await input.navigate?.({ session: { currentTask: null } });
    },
    async signOut(input?: { redirectUrl?: string }) {
      await fetch("/__fixture/sign-out", { method: "POST" });
      setActor(null);
      if (input?.redirectUrl) window.location.assign(input.redirectUrl);
    },
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useAuth() {
  const value = React.useContext(Context);
  return { isLoaded: true, isSignedIn: Boolean(value?.actor), userId: value?.user?.id ?? null };
}
export function useUser() {
  const value = React.useContext(Context);
  return { isLoaded: true, isSignedIn: Boolean(value?.actor), user: value?.user ?? null };
}
export function useSession() { return { isLoaded: true, session: React.useContext(Context)?.session }; }
export function useClerk() {
  const value = React.useContext(Context);
  return { signOut: value?.signOut, addListener: value?.addListener };
}
export function useSignIn() {
  const value = React.useContext(Context);
  return { isLoaded: true, signIn: value?.attempt, setActive: value?.setActive };
}
export function SignIn() { return <p>Fallback de autenticação fictício; nenhum provedor conectado.</p>; }
export function SignUp() { return <p>Cadastro fictício: nenhuma conta real é criada neste teste.</p>; }
