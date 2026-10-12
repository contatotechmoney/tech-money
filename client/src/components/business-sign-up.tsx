import { SignUp } from "@clerk/react";
import { useState, type ComponentProps } from "react";
import { EMAIL_MESSAGE, normalizeEmail } from "@shared/business-email";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function BusinessSignUp(props: ComponentProps<typeof SignUp>) {
  const [email, setEmail] = useState("");
  const [accepted, setAccepted] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (accepted) return <div className="w-full max-w-lg space-y-3">
    <p className="text-center text-sm text-muted-foreground">Cadastre seu e-mail para acessar a Tech Money.</p>
    <SignUp {...props} initialValues={{ ...props.initialValues, emailAddress: accepted }} />
  </div>;
  return <form className="w-full space-y-5" onSubmit={event => {
    event.preventDefault();
    const normalized = normalizeEmail(email);
    if (!normalized) { setError(EMAIL_MESSAGE); return; }
    setError(null); setAccepted(normalized);
  }}>
    <p className="text-sm text-muted-foreground">Use seu e-mail pessoal ou profissional. Confirme-o para acessar a Tech Money.</p>
    <div className="space-y-2"><Label htmlFor="business-sign-up-email">E-mail</Label><Input id="business-sign-up-email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required maxLength={254} /></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button className="w-full" type="submit">Continuar cadastro</Button>
    {props.signInUrl && <a className="block text-center text-sm underline" href={props.signInUrl}>Já tenho conta</a>}
  </form>;
}
