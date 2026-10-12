import { useEffect, useState } from "react";
import { AlertTriangle, Check, Clock3, FlaskConical, ShieldCheck } from "lucide-react";
import { TechMoneyBrand } from "@/components/tech-money-brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { REHEARSAL_MODELS, approveRehearsal, prepareRehearsal, type RehearsalBudget } from "../../../shared/portfolio-rehearsal";

const MAX_CEILING_USD_MICROS = 1_000_000;
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 6 });

function parseCeiling(value: string): number | null {
  const normalized = value.trim();
  if (!/^(?:\d+)(?:\.\d{0,6})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const micros = Number(whole) * 1_000_000 + Number(fraction.padEnd(6, "0"));
  return Number.isSafeInteger(micros) && micros > 0 && micros <= MAX_CEILING_USD_MICROS ? micros : null;
}

function formatUsdMicros(value: number): string {
  return usd.format(value / 1_000_000);
}

export function PortfolioBudgetRehearsal({ onStart, disabled }: { onStart: () => void; disabled: boolean }) {
  const [modelId, setModelId] = useState("");
  const [ceilingInput, setCeilingInput] = useState("");
  const [quote, setQuote] = useState<RehearsalBudget | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");

  const ceilingMicros = parseCeiling(ceilingInput);
  const clearQuote = () => {
    setQuote(null);
    setConfirmed(false);
    setError("");
  };

  useEffect(() => {
    if (!quote) return;
    const remaining = quote.expiresAt - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) {
      setQuote(null);
      setConfirmed(false);
      setError("A cotação fictícia venceu. Prepare outra para continuar.");
      return;
    }
    const timeout = window.setTimeout(() => {
      setQuote(null);
      setConfirmed(false);
      setError("A cotação fictícia venceu. Prepare outra para continuar.");
    }, remaining);
    return () => window.clearTimeout(timeout);
  }, [quote]);

  const createQuote = () => {
    clearQuote();
    if (!modelId || !ceilingMicros) {
      setError("Escolha um modelo fictício e informe um teto de até US$ 1.");
      return;
    }
    try {
      setQuote(prepareRehearsal(modelId, ceilingMicros, Date.now()));
    } catch {
      setError("Não foi possível preparar esta cotação fictícia. Confira as opções e tente novamente.");
    }
  };

  const approveAndStart = () => {
    if (disabled || !quote || !confirmed) return;
    try {
      approveRehearsal(quote, modelId, ceilingMicros ?? -1, Date.now(), confirmed);
      setError("");
      onStart();
    } catch {
      setQuote(null);
      setConfirmed(false);
      setError("A validação falhou ou a cotação venceu. Prepare uma nova cotação.");
    }
  };

  return (
    <Card className="mt-6 overflow-hidden rounded-2xl border-[#cbd9d0] bg-[#fbfcf8] shadow-sm">
      <CardHeader className="border-b border-[#e0e9e2] px-5 py-5 sm:px-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#84978d]">PREPARAÇÃO OPCIONAL · ENSAIO LOCAL</p>
            <CardTitle className="mt-2 text-xl tracking-tight">Ensaio de orçamento</CardTitle>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#587066]">Entenda como um teto poderia ser apresentado antes de uma preparação. Esta cotação existe apenas no navegador e não altera a demonstração gratuita.</p>
          </div>
          <TechMoneyBrand areaLabel="INVESTIMENTOS" />
        </div>
      </CardHeader>
      <CardContent className="space-y-5 p-5 sm:p-7">
        <div className="rounded-xl border border-[#d7b77a] bg-[#fff7e7] p-4 text-xs leading-5 text-[#77591e]">
          <div className="flex items-start gap-2"><FlaskConical className="mt-0.5 h-4 w-4 shrink-0" /><p><strong>100% fictício.</strong> Modelos A/B não representam modelos, tarifas ou preços Nous. Cobrança real: US$ 0 · tokens: 0 · créditos: 0.</p></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="rehearsal-model" className="mb-2 block text-sm font-semibold">Modelo de ensaio</label>
            <select id="rehearsal-model" value={modelId} onChange={event => { setModelId(event.target.value); clearQuote(); }} className="h-11 w-full rounded-lg border border-[#cbd9d0] bg-[#fbfcf8] px-3 text-sm" disabled={disabled}>
              <option value="">Selecione A ou B</option>
              {REHEARSAL_MODELS.map(model => <option key={model.id} value={model.id}>{model.label}</option>)}
            </select>
            <p className="mt-2 text-xs leading-5 text-[#6b8177]">Modelos sintéticos para treinamento; não são opções reais de provedor.</p>
          </div>
          <div>
            <label htmlFor="rehearsal-ceiling" className="mb-2 block text-sm font-semibold">Teto fictício (USD)</label>
            <div className="flex items-center rounded-lg border border-[#cbd9d0] bg-[#fbfcf8] px-3"><span className="font-mono text-sm text-[#587066]">$</span><input id="rehearsal-ceiling" inputMode="decimal" autoComplete="off" value={ceilingInput} onChange={event => { setCeilingInput(event.target.value); clearQuote(); }} placeholder="0.25" disabled={disabled} className="h-11 w-full bg-transparent px-2 font-mono text-sm outline-none" aria-describedby="rehearsal-ceiling-help" /></div>
            <p id="rehearsal-ceiling-help" className="mt-2 text-xs leading-5 text-[#6b8177]">Até US$ 1,00 · máximo de seis casas decimais.</p>
            {ceilingInput && !ceilingMicros && <p className="mt-1 text-xs text-[#824833]">Informe um valor positivo de até US$ 1.</p>}
          </div>
        </div>
        <Button type="button" variant="outline" onClick={createQuote} disabled={disabled || !modelId || !ceilingMicros} className="h-10 rounded-lg border-[#cbd9d0] bg-[#f1f6f2] text-[#28684f] hover:bg-[#e2eee7]">
          Preparar cotação fictícia
        </Button>
        {quote && <div className="space-y-4 rounded-xl border border-[#a8c8b3] bg-[#f1f6f2] p-4 sm:p-5">
          <div className="flex items-start gap-3"><Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-[#28684f]" /><div><p className="text-sm font-semibold">Cotação de ensaio · somente neste navegador</p><p className="mt-1 text-xs leading-5 text-[#587066]">{quote.modelLabel} · teto {formatUsdMicros(quote.ceilingUsdMicros)} · estimativa fictícia {formatUsdMicros(quote.estimatedUsdMicros)}.</p><p className="mt-1 text-xs leading-5 text-[#587066]">Válida até {Number.isFinite(quote.expiresAt) ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(quote.expiresAt)) : "prazo indisponível"}. Nenhum valor será cobrado.</p></div></div>
          <div className="rounded-lg border border-[#d8e5dc] bg-[#fbfcf8] p-3"><p className="text-xs font-semibold">Compartilhamento apenas hipotético</p><ul className="mt-2 space-y-1">{quote.sharing.map((item, index) => <li key={`${item}-${index}`} className="text-xs leading-5 text-[#587066]">· {item}</li>)}</ul><p className="mt-2 text-[11px] leading-5 text-[#71877b]">Nada será enviado por este ensaio. A aprovação de treinamento não é orçamento real, vínculo do titular ou autorização oficial; o histórico privado permanece no serviço de demonstração existente.</p></div>
          <label className="flex cursor-pointer items-start gap-3 text-xs leading-5 text-[#425f51]"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#28684f]" disabled={disabled} /><span>Confirmo especificamente esta cotação fictícia: {quote.modelLabel}, teto {formatUsdMicros(quote.ceilingUsdMicros)} e estimativa {formatUsdMicros(quote.estimatedUsdMicros)}. Entendo que isso não aprova um orçamento real.</span></label>
          <Button type="button" onClick={approveAndStart} disabled={disabled || !confirmed} className="h-11 w-full rounded-xl bg-[#216b51] text-white hover:bg-[#174f3d]"><Check className="h-4 w-4" />Validar ensaio e iniciar demonstração existente</Button>
        </div>}
        {error && <p role="alert" className="flex items-start gap-2 text-xs leading-5 text-[#824833]"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
        <p className="flex items-start gap-2 border-t border-[#e0e9e2] pt-4 text-xs leading-5 text-[#6b8177]"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#28684f]" />A aprovação de ensaio só valida os campos fictícios e aciona a demonstração autenticada existente. Nenhum orçamento de ensaio é enviado à API, não há chamada paga nem execução ou envio para fila.</p>
      </CardContent>
    </Card>
  );
}
