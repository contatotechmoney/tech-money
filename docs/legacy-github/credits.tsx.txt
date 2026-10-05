import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Check, CreditCard, Loader2, Sparkles } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

type Ciclo = "mensal" | "anual";

interface PlanoApi {
  id: string;
  nome: string;
  descricao: string;
  creditos: number;
  modo: "payment" | "subscription";
  sobConsulta: boolean;
  destaque: boolean;
  recursos: string[];
  precoUnicoBrl: number | null;
  precoMensalBrl: number | null;
  precoAnualBrl: number | null;
  precoMensalEquivalenteAnualBrl: number | null;
}

interface CatalogoApi {
  configurado: boolean;
  mesesGratisAnual: number;
  planos: PlanoApi[];
}

export default function Credits() {
  const { t, formatCurrency } = useLanguage();
  const [isAnnual, setIsAnnual] = useState(false);
  const [catalogo, setCatalogo] = useState<CatalogoApi | null>(null);
  const [creditos, setCreditos] = useState<number | null>(null);
  const [carregando, setCarregando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const [cat, saldo] = await Promise.all([
          fetch("/api/investments/billing/catalog").then((r) => r.json()),
          fetch("/api/investments/credits").then((r) => (r.ok ? r.json() : null)),
        ]);
        if (!ativo) return;
        setCatalogo(cat);
        if (saldo) setCreditos(saldo.creditos);
      } catch {
        if (ativo) setErro("Não foi possível carregar os planos.");
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  async function assinar(plano: PlanoApi) {
    setErro(null);
    if (plano.sobConsulta) {
      window.location.href = "mailto:contato@techmoney.com.br?subject=Plano%20Enterprise";
      return;
    }
    setCarregando(plano.id);
    try {
      const res = await fetch("/api/investments/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planoId: plano.id,
          ciclo: plano.modo === "subscription" ? (isAnnual ? "anual" : "mensal") : undefined,
        }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Falha ao iniciar o pagamento.");
      window.location.href = data.url;
    } catch (e) {
      setErro((e as Error).message);
      setCarregando(null);
    }
  }

  const ciclo: Ciclo = isAnnual ? "anual" : "mensal";

  function precoDoPlano(p: PlanoApi) {
    if (p.sobConsulta) return "Sob consulta";
    if (p.modo === "payment") return formatCurrency(p.precoUnicoBrl ?? 0);
    return formatCurrency((isAnnual ? p.precoAnualBrl : p.precoMensalBrl) ?? 0);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-12 py-8 animate-in fade-in duration-500">
      <div className="space-y-4 text-center">
        <h1 className="font-heading text-4xl font-bold">{t("plansCredits")}</h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          1 crédito = 1 análise completa do comitê (renda variável ou renda fixa).
        </p>

        {creditos !== null && (
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-semibold text-primary">
            <CreditCard className="h-4 w-4" />
            Seus créditos: <span className="text-base font-bold">{creditos}</span>
          </div>
        )}

        <div className="mt-8 flex items-center justify-center gap-4">
          <Label className={`text-sm font-medium ${!isAnnual ? "text-primary" : "text-muted-foreground"}`}>
            Mensal
          </Label>
          <Switch id="billing-switch" checked={isAnnual} onCheckedChange={setIsAnnual} />
          <Label className={`text-sm font-medium ${isAnnual ? "text-primary" : "text-muted-foreground"}`}>
            Anual{" "}
            <span className="ml-1 text-xs font-bold text-green-600">
              (2 meses grátis)
            </span>
          </Label>
        </div>
      </div>

      {erro && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-center text-sm text-destructive">
          {erro}
        </div>
      )}

      {!catalogo ? (
        <div className="flex min-h-48 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 animate-spin" /> Carregando planos...
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {catalogo.planos.map((p) => (
            <Card
              key={p.id}
              className={`flex flex-col border-t-4 ${
                p.destaque
                  ? "relative border-primary shadow-xl lg:scale-105"
                  : "border-t-slate-200 shadow-sm hover:shadow-lg"
              }`}
            >
              {p.destaque && (
                <div className="absolute -mr-2 -mt-2 right-0 top-0">
                  <span className="flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground shadow-md">
                    <Sparkles className="h-3 w-3" /> Popular
                  </span>
                </div>
              )}
              <CardHeader>
                <CardTitle className={`text-xl ${p.destaque ? "text-primary" : ""}`}>
                  {p.nome}
                </CardTitle>
                <CardDescription>{p.descricao}</CardDescription>
                <div className="mt-4">
                  <span className="text-3xl font-bold">{precoDoPlano(p)}</span>
                  {p.modo === "subscription" && !p.sobConsulta && (
                    <span className="text-sm text-muted-foreground">
                      {isAnnual ? "/ano" : "/mês"}
                    </span>
                  )}
                  {p.modo === "payment" && (
                    <span className="text-sm text-muted-foreground"> (único)</span>
                  )}
                </div>
                {isAnnual && p.precoMensalEquivalenteAnualBrl && (
                  <p className="mt-1 text-xs font-medium text-green-600">
                    equivale a {formatCurrency(p.precoMensalEquivalenteAnualBrl)}/mês — faturado
                    anualmente
                  </p>
                )}
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="space-y-3 text-sm">
                  {p.recursos.map((r) => (
                    <li key={r} className="flex items-start gap-2">
                      <Check
                        className={`mt-0.5 h-4 w-4 shrink-0 ${
                          p.destaque ? "text-primary" : "text-green-600"
                        }`}
                      />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button
                  className="w-full"
                  variant={p.destaque ? "default" : "outline"}
                  disabled={carregando === p.id || (!p.sobConsulta && !catalogo.configurado)}
                  onClick={() => assinar(p)}
                >
                  {carregando === p.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : p.sobConsulta ? (
                    "Falar com vendas"
                  ) : p.modo === "payment" ? (
                    "Comprar pacote"
                  ) : (
                    "Assinar agora"
                  )}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {catalogo && !catalogo.configurado && (
        <p className="text-center text-xs text-muted-foreground">
          Pagamento ainda não conectado neste ambiente. Os planos ficam editáveis em{" "}
          <code>server/billing.ts</code>.
        </p>
      )}

      <div className="mt-12 rounded-lg bg-muted/50 p-8">
        <h3 className="mb-4 text-lg font-bold">Como funcionam os créditos</h3>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded border border-border bg-background p-4">
            <div className="font-semibold text-primary">1 crédito</div>
            <div className="text-sm text-muted-foreground">1 análise do comitê</div>
          </div>
          <div className="rounded border border-border bg-background p-4">
            <div className="font-semibold text-primary">Validade</div>
            <div className="text-sm text-muted-foreground">Acumulam no plano</div>
          </div>
          <div className="rounded border border-border bg-background p-4">
            <div className="font-semibold text-primary">Renda variável</div>
            <div className="text-sm text-muted-foreground">9 agentes + moderador</div>
          </div>
          <div className="rounded border border-border bg-background p-4">
            <div className="font-semibold text-primary">Renda fixa</div>
            <div className="text-sm text-muted-foreground">6 agentes + moderador</div>
          </div>
        </div>
      </div>
    </div>
  );
}
