import { SignUp } from "@clerk/react";
import { useState, type ComponentProps } from "react";
import { BUSINESS_EMAIL_MESSAGE, normalizeBusinessEmail } from "@shared/business-email";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function BusinessSignUp(props: ComponentProps<typeof SignUp>) {
  const [email, setEmail] = useState("");
  const [accepted, setAccepted] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (accepted) return <div className="w-full max-w-lg space-y-3">
    <p className="text-center text-sm text-muted-foreground">Cadastre seu e-mail empresarial verificado para acessar a Tech Money.</p>
    <SignUp {...props} initialValues={{ ...props.initialValues, emailAddress: accepted }} />
  </div>;
  return <form className="w-full max-w-lg space-y-5 rounded-2xl border bg-card p-7" onSubmit={event => {
    event.preventDefault();
    const normalized = normalizeBusinessEmail(email);
    if (!normalized) { setError(BUSINESS_EMAIL_MESSAGE); return; }
    setError(null); setAccepted(normalized);
  }}>
    <h1 className="text-2xl font-semibold">Crie sua conta empresarial</h1>
    <p className="text-sm text-muted-foreground">Use o e-mail da sua empresa, com domínio próprio. Não aceitamos e-mails pessoais ou temporários.</p>
    <div className="space-y-2"><Label htmlFor="business-sign-up-email">E-mail empresarial</Label><Input id="business-sign-up-email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required maxLength={254} /></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button className="w-full" type="submit">Continuar cadastro</Button>
    {props.signInUrl && <a className="block text-center text-sm underline" href={props.signInUrl}>Já tenho conta</a>}
  </form>;
}
