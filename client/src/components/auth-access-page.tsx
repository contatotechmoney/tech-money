import * as React from "react";
import { SignIn, useAuth, useSession } from "@clerk/react";
import { useSignIn } from "@clerk/react/legacy";
import { Link, useLocation, useSearch } from "wouter";
import { AuthAccessShell } from "./auth-access-shell";
import { BusinessSignUp } from "./business-sign-up";
import { authLink, getAccessArea, getAuthRedirect, withAppBase } from "@/lib/auth-redirect";
import { beginEmailCode, verifyEmailCode, type EmailCodeStep } from "@/lib/email-code-sign-in";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const accessClerkAppearance = {
  variables: { colorPrimary: "#087d61" },
  elements: {
    rootBox: "tm-auth-clerk-root",
    cardBox: "tm-auth-clerk-card-box",
    card: "tm-auth-clerk-card",
    formButtonPrimary: "tm-auth-clerk-primary",
    otpCodeFieldInput: "tm-auth-clerk-code",
  },
};

export function AuthAccessPage({ mode = "sign-in" }: { mode?: "sign-in" | "sign-up" }) {
  const search = useSearch();
  const [location, navigate] = useLocation();
  const { isLoaded, isSignedIn } = useAuth();
  const { session } = useSession();
  const { isLoaded: signInLoaded, signIn, setActive } = useSignIn();
  // Keep the initial destination through Clerk's verification and callback subpaths.
  const [redirectPath] = React.useState(() => getAuthRedirect(search, basePath, window.location.hostname));
  const destination = withAppBase(redirectPath, basePath);
  const signInHref = authLink("/sign-in", redirectPath);
  const signUpHref = authLink("/sign-up", redirectPath);
  const nativeHref = `${signInHref}&method=clerk`;
  const nativeWanted = new URLSearchParams(search).get("method") === "clerk"
    || (location.startsWith("/sign-in/"))
    || Boolean(signIn?.status && signIn.status !== "needs_identifier" && signIn.status !== "needs_first_factor");
  const native = location.startsWith("/sign-in") && nativeWanted;
  const [email, setEmail] = React.useState("");
  const [code, setCode] = React.useState("");
  const [codeSent, setCodeSent] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (isLoaded && isSignedIn && session && !session.currentTask) {
      navigate(redirectPath, { replace: true });
      return;
    }
    if (mode === "sign-in" && nativeWanted && !native) {
      navigate(nativeHref, { replace: true });
    }
  }, [isLoaded, isSignedIn, session, redirectPath, navigate, mode, nativeWanted, native, nativeHref]);

  async function finish(step: EmailCodeStep) {
    if (step.kind === "code") { setCodeSent(true); return; }
    if (step.kind === "native") { navigate(nativeHref); return; }
    if (!setActive) return;
    await setActive({
      session: step.sessionId,
      navigate: async ({ session: activeSession }) => {
        // Clerk's components, not this form, resolve pending session tasks.
        navigate(activeSession.currentTask ? nativeHref : redirectPath, { replace: true });
      },
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!signInLoaded || !signIn || busy) return;
    setBusy(true); setError(null);
    try {
      await finish(codeSent
        ? await verifyEmailCode(signIn, code.trim())
        : await beginEmailCode(signIn, email.trim()));
    } catch {
      // Do not retry or weaken security after a provider error. Native Clerk handles
      // unsupported methods, CAPTCHA, account recovery, rate limits and verification.
      setError("Continue pelos métodos seguros disponíveis para sua conta.");
      navigate(nativeHref);
    } finally { setBusy(false); }
  }

  return (
    <AuthAccessShell area={getAccessArea(window.location.hostname, redirectPath)} mode={mode}
      signInHref={signInHref} signUpHref={signUpHref}>
      {mode === "sign-up" ? (
        <BusinessSignUp routing="path" path={`${basePath}/sign-up`} appearance={accessClerkAppearance}
          signInUrl={withAppBase(signInHref, basePath)}
          forceRedirectUrl={destination} signInForceRedirectUrl={destination} />
      ) : native ? (
        <SignIn routing="path" path={`${basePath}/sign-in`} appearance={accessClerkAppearance}
          signUpUrl={withAppBase(signUpHref, basePath)}
          forceRedirectUrl={destination} signUpForceRedirectUrl={destination} />
      ) : (
        <>
          <form onSubmit={submit} aria-busy={busy}>
            <label htmlFor="access-email">E-mail
              <input id="access-email" type="email" autoComplete="email" value={email}
                onChange={event => setEmail(event.target.value)} required maxLength={254}
                readOnly={codeSent} placeholder="seu@email.com" />
            </label>
            {codeSent ? (
              <>
                <label htmlFor="access-code">Código enviado por e-mail
                  <input id="access-code" autoComplete="one-time-code" inputMode="numeric"
                    pattern="[0-9]{6}" maxLength={6} value={code}
                    onChange={event => setCode(event.target.value)} required autoFocus />
                </label>
                <p className="tm-auth-helper">Informe o código. Sua conta pode exigir uma etapa adicional de segurança.</p>
              </>
            ) : (
              <p className="tm-auth-helper">Entre com um código por e-mail, se disponível, ou pelos métodos configurados para sua conta.</p>
            )}
            {error && <p role="alert">{error}</p>}
            <div id="clerk-captcha" />
            <button type="submit" disabled={!signInLoaded || busy}>
              {busy ? "Aguarde…" : codeSent ? "Verificar código" : "Continuar"}
            </button>
          </form>
          <Link className="tm-auth-other-methods" href={nativeHref}>Usar outros métodos de acesso</Link>
        </>
      )}
    </AuthAccessShell>
  );
}
