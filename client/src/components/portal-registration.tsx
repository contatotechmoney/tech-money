import { useAuth, useClerk } from "@clerk/react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const base = import.meta.env.BASE_URL.replace(/\/$/, "");
type Profile = { enabled?: boolean; registered: boolean; email: string; nome: string | null; marketing_opt_in: boolean };
export function PortalRegistration({ children }: { children: ReactNode }) {
  const { userId } = useAuth();
  const { signOut } = useClerk();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [optIn, setOptIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setProfile(null); setOwner(userId ?? null); setError(null); setNome(""); setOptIn(false);
    if (!userId) return () => abort.abort();
    fetch(`${base}/api/leads/profile`, { credentials: "same-origin", signal: abort.signal, cache: "no-store" })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Não foi possível confirmar seu cadastro.");
        if (!abort.signal.aborted) { setProfile(data); setNome(data.nome ?? ""); }
      })
      .catch(error => { if (!abort.signal.aborted) setError(error.message); });
    return () => abort.abort();
  }, [userId, attempt]);
  if (owner !== userId) return <p>Conferindo seu cadastro…</p>;
  if (profile?.enabled === false) return <>{children}</>;
  if (profile?.registered) return <>{children}</>;
  return <PortalRegistrationCard profile={profile} nome={nome} optIn={optIn} error={error} busy={busy} setNome={setNome} setOptIn={setOptIn} onRetry={() => setAttempt(value => value + 1)} onSignOut={() => signOut({ redirectUrl: `${base}/` })} onSubmit={async event => {
        event.preventDefault(); setBusy(true); setError(null);
        try {
          const response = await fetch(`${base}/api/leads/profile`, {
            method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nome: nome.trim(), marketingOptIn: optIn }),
          });
          const data = await response.json();
          if (!response.ok || data.registered !== true) throw new Error(data.error || "Não foi possível salvar seu cadastro.");
          // Re-read the current owner's profile instead of trusting a stale save
          // response after an account switch.
          setAttempt(value => value + 1);
        } catch (error) { setError(error instanceof Error ? error.message : "Tente novamente."); }
        finally { setBusy(false); }
      }} />;
}

export function PortalRegistrationCard({profile,nome,optIn,error,busy,setNome,setOptIn,onSubmit,onRetry,onSignOut}: {
  profile: Profile | null; nome: string; optIn: boolean; error: string | null; busy: boolean;
  setNome(value: string): void; setOptIn(value: boolean): void;
  onSubmit(event: React.FormEvent<HTMLFormElement>): void; onRetry(): void; onSignOut(): void;
}) {
  return <main className="flex min-h-screen items-center justify-center bg-background p-6">
    <section className="w-full max-w-lg space-y-5 rounded-2xl border bg-card p-7">
      <h1 className="text-2xl font-semibold">Seu cadastro no Tech Money Invest</h1>
      <p className="text-sm text-muted-foreground">Confirme seus dados para acessar o Invest. E-mails pessoais e profissionais são aceitos.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!profile && !error && <p>Conferindo seu e-mail e cadastro…</p>}
      {profile && <form className="space-y-5" onSubmit={onSubmit}>
        <div className="space-y-2"><Label htmlFor="portal-email">E-mail verificado</Label><Input id="portal-email" type="email" value={profile.email} readOnly /></div>
        <div className="space-y-2"><Label htmlFor="portal-name">Nome completo</Label><Input id="portal-name" autoComplete="name" minLength={2} maxLength={120} value={nome} onChange={event => setNome(event.target.value)} required /></div>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={optIn} onChange={event => setOptIn(event.target.checked)} className="mt-1" /><span>Quero receber conteúdos e novidades sobre investimentos da Tech Money por e-mail. Esta opção é facultativa.</span></label>
        <p className="text-xs text-muted-foreground">Seus dados serão usados para seu cadastro e atendimento. <a className="underline" href="https://www.techmoney.com.br/privacidade" target="_blank" rel="noreferrer">Privacidade</a></p>
        <Button type="submit" disabled={busy} className="w-full">{busy ? "Salvando…" : "Concluir cadastro"}</Button>
      </form>}
      <div className="flex gap-3">{error && !profile && <Button variant="outline" onClick={onRetry}>Tentar novamente</Button>}<Button variant="ghost" onClick={onSignOut}>Sair e usar outra conta</Button></div>
    </section>
  </main>;
}
