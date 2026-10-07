import * as React from "react";
import { Link } from "wouter";
import { TechMoneyBrand } from "@/components/tech-money-brand";
import "./auth-access-shell.css";

export type AuthAccessShellProps = {
  area: "invest" | "finance" | "general";
  mode: "sign-in" | "sign-up";
  signInHref: string;
  signUpHref: string;
  children: React.ReactNode;
};

const areaLabels = {
  invest: "INVESTIMENTOS",
  finance: "FINANCE",
  general: "ACESSO",
} as const;

export function AuthAccessShell({
  area,
  mode,
  signInHref,
  signUpHref,
  children,
}: AuthAccessShellProps) {
  return (
    <main className="tm-auth-shell">
      <section className="tm-auth-card" aria-labelledby="tm-auth-title">
        <header className="tm-auth-brand">
          <TechMoneyBrand areaLabel={areaLabels[area]} variant="auth" />
        </header>

        <h1 id="tm-auth-title" className="tm-auth-title">
          Bem-vindo à Tech Money
        </h1>

        <nav className="tm-auth-navigation" aria-label="Acesso à conta">
          <Link
            href={signInHref}
            className="tm-auth-nav-link"
            aria-current={mode === "sign-in" ? "page" : undefined}
          >
            Entrar
          </Link>
          <Link
            href={signUpHref}
            className="tm-auth-nav-link"
            aria-current={mode === "sign-up" ? "page" : undefined}
          >
            Criar conta
          </Link>
        </nav>

        <div className="tm-auth-content">{children}</div>
      </section>
    </main>
  );
}
