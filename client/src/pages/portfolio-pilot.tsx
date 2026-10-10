import { useAuth } from "@clerk/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Check, CircleHelp, LockKeyhole, ShieldCheck, WalletCards } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { TechMoneyBrand } from "@/components/tech-money-brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { PILOT_LIMITS, type PilotBudget, type PilotPosition, type PilotStatus } from "../../../shared/portfolio-pilot";

const ROOT = "/api/investments/portfolio-pilot";
const darkPalette = "color-scheme:dark;--pilot-page:#14231d;--pilot-ink:#e2eee7;--pilot-surface:#1b2c24;--pilot-subtle:#20352b;--pilot-line:#354b3e;--pilot-border:#486052;--pilot-muted:#b5c7bb;--pilot-muted-2:#8ea797;--pilot-green:#a5d8b8;--pilot-green-bright:#a4d8b6;--pilot-green-soft:#294638;--pilot-warn:#e5cc8e;--pilot-warn-bg:#3d3524;--pilot-warn-border:#665533;--pilot-skeleton:#304239";
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 6 });
const blockerCopy: Record<string, string> = {
  OWNER_ID_UNCONFIRMED: "A identidade do titular ainda não foi vinculada explicitamente no servidor.",
  MODEL_PRICE_UNCONFIRMED: "O modelo exato e sua versão de preço ainda não foram confirmados.",
  MARKET_DATA_UNVERIFIED: "Os dados de mercado ainda não foram verificados.",
  EXECUTOR_NOT_CONNECTED: "O mecanismo de preparação não está conectado.",
  DURABLE_AUDIT_NOT_READY: "A auditoria durável ainda não está pronta.",
  REAL_EXECUTION_DISABLED: "A execução real permanece desabilitada em qualquer situação.",
};

async function getJson<T>(url: string): Promise<T> {
  return (await apiRequest("GET", url)).json() as Promise<T>;
}

function usdMicros(value: string): number | null {
  const normalized = value.trim();
  if (!/^(?:\d+)(?:\.\d{0,6})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const micros = Number(whole) * 1_000_000 + Number(fraction.padEnd(6, "0"));
  return Number.isSafeInteger(micros) && micros > 0 && micros <= PILOT_LIMITS.ceilingUsdMicros ? micros : null;
}

function formatMicros(value: number): string {
  return usd.format(value / 1_000_000);
}

function modelIdentity(model: PilotStatus["models"][number]): string {
  return JSON.stringify([model.key, model.priceVersion]);
}

export default function PortfolioPilot() {
  const { userId, isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <main className="portfolio-pilot min-h-[100dvh] p-5"><div className="mx-auto max-w-5xl animate-pulse space-y-4" role="status"><div className="h-7 w-48 rounded bg-[#dce7df]" /><div className="h-48 rounded-3xl bg-[#dce7df]" /></div></main>;
  if (!isSignedIn || !userId) return <main className="portfolio-pilot grid min-h-[100dvh] place-items-center p-5"><Card className="max-w-lg"><CardContent className="p-7"><LockKeyhole className="mb-4 h-7 w-7" /><h1 className="text-xl font-semibold">Entre para acessar esta preparação</h1><p className="mt-2 text-sm leading-6 text-[var(--pilot-muted)]">Esta área é privada e vinculada à sua sessão.</p></CardContent></Card></main>;
  return <PilotBody key={userId} userId={userId} />;
}

function PilotBody({ userId }: { userId: string }) {
  const status = useQuery<PilotStatus>({
    queryKey: ["portfolio-pilot-status", userId],
    queryFn: () => getJson<PilotStatus>(`${ROOT}/status`),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedModelIdentity, setSelectedModelIdentity] = useState("");
  const [spendInput, setSpendInput] = useState("");
  const [budget, setBudget] = useState<PilotBudget | null>(null);
  const [budgetExpired, setBudgetExpired] = useState(false);
  const [approved, setApproved] = useState(false);
  const [approvalError, setApprovalError] = useState("");
  const requestKey = useRef<string | null>(null);

  const positions = useQuery<PilotPosition[]>({
    queryKey: ["portfolio-pilot-positions", userId],
    queryFn: () => getJson<PilotPosition[]>(`${ROOT}/positions`),
    enabled: status.data?.allowed === true,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const availableModels = status.data?.models ?? [];
  const modelKeyCounts = new Map<string, number>();
  const seenModelIdentities = new Set<string>();
  for (const model of availableModels) modelKeyCounts.set(model.key, (modelKeyCounts.get(model.key) ?? 0) + 1);
  const models = availableModels.filter(model => {
    const identity = modelIdentity(model);
    if (seenModelIdentities.has(identity) || modelKeyCounts.get(model.key) !== 1) return false;
    seenModelIdentities.add(identity);
    return Boolean(model.key && model.priceVersion);
  });
  const chosenModel = models.find(model => modelIdentity(model) === selectedModelIdentity);
  const spendMicros = usdMicros(spendInput);
  const selectedPositions = (positions.data ?? []).filter(position => selectedIds.includes(position.id));
  const invalidQuantity = selectedPositions.some(position => !Number.isFinite(position.quantity) || position.quantity <= 0);

  useEffect(() => {
    if (!budget) {
      setBudgetExpired(false);
      return;
    }
    const delay = budget.expiresAt - Date.now();
    if (!Number.isFinite(delay) || delay <= 0) {
      setBudgetExpired(true);
      return;
    }
    const timer = window.setTimeout(() => setBudgetExpired(true), delay);
    return () => window.clearTimeout(timer);
  }, [budget]);

  const prepare = useMutation({
    mutationFn: async () => {
      if (!chosenModel || !spendMicros || selectedIds.length === 0 || invalidQuantity) throw new Error("INVALID_PREPARATION");
      if (budget && Date.now() >= budget.expiresAt) requestKey.current = null;
      if (!requestKey.current) requestKey.current = crypto.randomUUID();
      const stableRequestKey = requestKey.current;
      const response = await apiRequest("POST", `${ROOT}/budgets`, {
        requestKey: stableRequestKey,
        positionIds: selectedIds,
        modelKey: chosenModel.key,
        maxSpendUsdMicros: spendMicros,
      });
      return response.json() as Promise<PilotBudget>;
    },
    onSuccess: result => {
      setBudget(result);
      setBudgetExpired(false);
      setApproved(false);
      setApprovalError("");
    },
  });
  const approve = useMutation({
    mutationFn: async () => {
      if (!budget) throw new Error("BUDGET_REQUIRED");
      if (!Number.isFinite(budget.expiresAt) || Date.now() >= budget.expiresAt) throw new Error("BUDGET_EXPIRED_LOCAL");
      const response = await apiRequest("POST", `${ROOT}/approvals`, {
        budgetId: budget.id,
        fingerprint: budget.fingerprint,
        confirm: true,
      });
      return response.json() as Promise<{ approved: boolean; executable: false }>;
    },
    onSuccess: result => {
      setApproved(result.approved && result.executable === false);
      setApprovalError("");
    },
    onError: error => {
      if (error instanceof Error && error.message === "BUDGET_EXPIRED_LOCAL") {
        setBudgetExpired(true);
        setApprovalError("Este orçamento venceu. Prepare um novo para solicitar confirmação.");
        return;
      }
      requestKey.current = null;
      setApprovalError("A confirmação não foi registrada. O orçamento pode ter expirado ou mudado; prepare novamente.");
    },
  });
  const clearPreparation = () => {
    setBudget(null);
    setBudgetExpired(false);
    setApproved(false);
    setApprovalError("");
    requestKey.current = null;
    prepare.reset();
    approve.reset();
  };
  const togglePosition = (id: string) => {
    clearPreparation();
    setSelectedIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  };
  const setModel = (identity: string) => {
    clearPreparation();
    setSelectedModelIdentity(identity);
  };
  const setSpend = (value: string) => {
    clearPreparation();
    setSpendInput(value);
  };
  const isBusy = prepare.isPending || approve.isPending;
  const isBudgetExpired = Boolean(budget && (budgetExpired || !Number.isFinite(budget.expiresAt) || Date.now() >= budget.expiresAt));
  const approveExplicitly = () => {
    if (!budget) return;
    if (!Number.isFinite(budget.expiresAt) || Date.now() >= budget.expiresAt) {
      setBudgetExpired(true);
      setApprovalError("Este orçamento venceu. Prepare um novo para solicitar confirmação.");
      return;
    }
    approve.mutate();
  };

  return (
    <main className="portfolio-pilot min-h-[100dvh] px-4 py-6 sm:px-7 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <Link href="/investments/portfolio" className="mb-7 inline-flex items-center gap-2 text-sm font-semibold text-[var(--pilot-green)] transition-opacity hover:opacity-75">
          <ArrowLeft className="h-4 w-4" /> Voltar à carteira
        </Link>
        <header className="relative overflow-hidden rounded-[1.7rem] border border-[var(--pilot-border)] bg-[var(--pilot-surface)] p-6 shadow-[0_20px_55px_rgba(38,73,57,.08)] sm:p-10">
          <div className="pointer-events-none absolute -right-12 -top-16 h-64 w-64 rounded-full border border-[var(--pilot-border)]" />
          <div className="relative max-w-3xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-[var(--pilot-green-soft)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.14em] text-[var(--pilot-green)]"><ShieldCheck className="h-3.5 w-3.5" /> Preparação privada · sem execução</div>
            <div className="mb-4 flex flex-wrap items-center gap-4">
              <TechMoneyBrand areaLabel="INVESTIMENTOS" />
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[.18em] text-[var(--pilot-muted-2)]">PILOTO DE CARTEIRA</span>
            </div>
            <h1 className="max-w-2xl text-3xl font-semibold leading-tight tracking-[-.04em] sm:text-5xl">Prepare com limites.<br /><span className="font-serif font-normal italic text-[var(--pilot-green-bright)]">Sem movimentar ativos.</span></h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-[var(--pilot-muted)] sm:text-base">Uma área de preparação do proprietário. Nenhuma chamada paga é feita, nenhum dado é enviado nesta etapa e uma aprovação não habilita execução real.</p>
          </div>
          <div className="relative mt-7 flex items-center gap-3 rounded-xl border border-[var(--pilot-border)] bg-[var(--pilot-subtle)] p-4 sm:max-w-2xl">
            <LockKeyhole className="h-5 w-5 shrink-0 text-[var(--pilot-green)]" />
            <p className="text-xs leading-5 text-[var(--pilot-muted)]"><strong className="text-[var(--pilot-ink)]">Execução real sempre desabilitada.</strong> O mecanismo de notebook não está conectado. Não use esta tela como ordem, recomendação ou autorização de investimento.</p>
          </div>
        </header>

        <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_310px]">
          <div className="space-y-6">
            <Card className="overflow-hidden">
              <CardHeader className="border-b border-[var(--pilot-line)] px-5 py-5 sm:px-7">
                <p className="font-mono text-[10px] uppercase tracking-[.16em] text-[var(--pilot-muted-2)]">01 / DISPONIBILIDADE</p>
                <CardTitle className="mt-2 text-xl">O que ainda falta</CardTitle>
              </CardHeader>
              <CardContent className="p-5 sm:p-7">
                {status.isLoading ? <div className="space-y-3" role="status" aria-label="Verificando disponibilidade"><div className="h-5 w-48 animate-pulse rounded bg-[var(--pilot-skeleton)]" /><div className="h-14 animate-pulse rounded-xl bg-[var(--pilot-skeleton)]" /><div className="h-14 animate-pulse rounded-xl bg-[var(--pilot-skeleton)]" /></div>
                  : status.isError || !status.data ? <div role="alert" className="rounded-xl border border-[var(--pilot-warn-border)] bg-[var(--pilot-warn-bg)] p-4"><div className="flex gap-3"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div className="min-w-0 flex-1"><p className="text-sm font-semibold">Não foi possível verificar o estado privado.</p><p className="mt-1 text-xs leading-5 text-[var(--pilot-muted)]">Nenhuma posição foi consultada. Tente novamente mais tarde.</p><Button variant="outline" size="sm" className="mt-3" onClick={() => void status.refetch()}>Tentar novamente</Button></div></div></div>
                  : <div className="space-y-3">
                    <p className="mb-4 text-sm leading-6 text-[var(--pilot-muted)]">{status.data.allowed ? "A preparação foi liberada pelo servidor. Isso não habilita execução." : "A preparação está fechada nesta fase. Nenhuma posição ou cotação foi consultada."}</p>
                    {(status.data.blockers.length ? status.data.blockers : ["REAL_EXECUTION_DISABLED"]).map((blocker, index) => <div key={`${blocker}-${index}`} className="flex items-start gap-3 rounded-xl border border-[var(--pilot-line)] bg-[var(--pilot-subtle)] p-3.5"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--pilot-warn-bg)] font-mono text-[10px] font-bold text-[var(--pilot-warn)]">{String(index + 1).padStart(2, "0")}</span><p className="text-sm leading-6">{blockerCopy[blocker] ?? "A preparação não está disponível."}</p></div>)}
                  </div>}
                <div className="mt-5 border-t border-[var(--pilot-line)] pt-4">
                  <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[var(--pilot-muted-2)]">Modelos mencionados · informação, não opções confirmadas</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-lg bg-[var(--pilot-subtle)] p-3"><p className="text-xs font-semibold">Hermes principal</p><p className="mt-1 font-mono text-[11px] text-[var(--pilot-muted)]">Nous · deepseek/deepseek-v4-flash</p></div>
                    <div className="rounded-lg bg-[var(--pilot-subtle)] p-3"><p className="text-xs font-semibold">Consultor</p><p className="mt-1 font-mono text-[11px] text-[var(--pilot-muted)]">Nous · z-ai/glm-5.2</p></div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {status.data?.allowed === true && <Card>
              <CardHeader className="border-b border-[var(--pilot-line)] px-5 py-5 sm:px-7"><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[var(--pilot-muted-2)]">02 / ESCOPO DA PREPARAÇÃO</p><CardTitle className="mt-2 text-xl">Escolha ativos e limite</CardTitle></CardHeader>
              <CardContent className="space-y-6 p-5 sm:p-7">
                <div>
                  <h2 className="mb-3 text-sm font-semibold">Posições pertencentes à conta</h2>
                  {positions.isLoading ? <div className="space-y-2" role="status"><div className="h-12 animate-pulse rounded-lg bg-[var(--pilot-skeleton)]" /><div className="h-12 animate-pulse rounded-lg bg-[var(--pilot-skeleton)]" /></div>
                    : positions.isError ? <div role="alert" className="rounded-xl border border-[var(--pilot-warn-border)] p-4 text-sm"><p>As posições privadas não puderam ser carregadas.</p><Button variant="outline" size="sm" className="mt-3" onClick={() => void positions.refetch()}>Tentar novamente</Button></div>
                      : positions.data?.length ? <div className="space-y-2">{positions.data.map(position => {
                        const invalid = !Number.isFinite(position.quantity) || position.quantity <= 0;
                        return <label key={position.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-[var(--pilot-line)] bg-[var(--pilot-subtle)] p-3.5">
                          <input type="checkbox" checked={selectedIds.includes(position.id)} onChange={() => togglePosition(position.id)} disabled={isBusy} className="h-4 w-4 accent-[var(--pilot-green)]" />
                          <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{position.ticker}</span><span className="mt-0.5 block font-mono text-xs text-[var(--pilot-muted)]">{invalid ? "Quantidade ausente ou inválida" : `Quantidade · ${position.quantity}`}</span></span>
                          {invalid && <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--pilot-warn)]">Bloqueada</span>}
                        </label>;
                      })}</div> : <div className="rounded-xl border border-dashed border-[var(--pilot-border)] p-6 text-center"><WalletCards className="mx-auto h-5 w-5 text-[var(--pilot-muted-2)]" /><p className="mt-2 text-sm font-semibold">Nenhuma posição disponível</p><p className="mt-1 text-xs text-[var(--pilot-muted)]">Sem posições, não é possível preparar um orçamento.</p></div>}
                </div>
                <div>
                  <label htmlFor="pilot-model" className="mb-2 block text-sm font-semibold">Modelo confirmado pelo servidor</label>
                  <select id="pilot-model" value={selectedModelIdentity} onChange={event => setModel(event.target.value)} className="h-11 w-full rounded-lg border border-[var(--pilot-border)] bg-[var(--pilot-surface)] px-3 text-sm" disabled={!models.length || isBusy}>
                    <option value="">Nenhum modelo verificado disponível</option>
                    {models.map(model => <option key={modelIdentity(model)} value={modelIdentity(model)}>{model.key} · preço {model.priceVersion} ({model.name})</option>)}
                  </select>
                  {!models.length && <p className="mt-2 text-xs leading-5 text-[var(--pilot-muted)]">Não é possível escolher um modelo pelo nome. É necessário haver uma única chave e versão de preço configurada pelo servidor.</p>}
                </div>
                <div>
                  <label htmlFor="pilot-spend" className="mb-2 block text-sm font-semibold">Limite solicitado em USD</label>
                  <div className="flex items-center rounded-lg border border-[var(--pilot-border)] bg-[var(--pilot-surface)] px-3"><span className="font-mono text-sm text-[var(--pilot-muted)]">$</span><input id="pilot-spend" inputMode="decimal" autoComplete="off" value={spendInput} onChange={event => setSpend(event.target.value)} placeholder="0.00" disabled={isBusy} className="h-11 w-full bg-transparent px-2 font-mono text-sm outline-none disabled:opacity-60" aria-describedby="pilot-spend-help" /></div>
                  <p id="pilot-spend-help" className="mt-2 text-xs leading-5 text-[var(--pilot-muted)]">Máximo {formatMicros(PILOT_LIMITS.ceilingUsdMicros)}. Até seis casas decimais; um USD equivale a 1.000.000 micros.</p>
                  {spendInput && !spendMicros && <p className="mt-1 text-xs text-[var(--pilot-warn)]">Informe um valor positivo dentro do limite.</p>}
                </div>
                <div className="rounded-xl border border-[var(--pilot-border)] bg-[var(--pilot-subtle)] p-4">
                  <div className="flex gap-3"><CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-[var(--pilot-green)]" /><div><p className="text-xs font-semibold">O que seria compartilhado</p><p className="mt-1 text-xs leading-5 text-[var(--pilot-muted)]">Na preparação, nada é enviado. O orçamento descreve ativos e quantidades selecionados, dados de mercado verificados e resultados derivados, com destinatário previsto identificado pelo servidor. Nome, contato, identificador de conta, credenciais e arquivos do notebook ficam de fora.</p></div></div>
                </div>
                <Button onClick={() => prepare.mutate()} disabled={!positions.data?.length || selectedIds.length === 0 || invalidQuantity || !chosenModel || !spendMicros || isBusy || positions.isLoading} className="h-11 w-full rounded-xl bg-[var(--pilot-green)] text-white hover:opacity-90">
                  {prepare.isPending ? "Preparando orçamento…" : "Preparar orçamento"}
                </Button>
                {prepare.isError && <p role="alert" className="text-sm text-[var(--pilot-warn)]">Não foi possível preparar. Verifique os dados e tente novamente.</p>}
              </CardContent>
            </Card>}

            {budget && <Card className="border-[var(--pilot-green)]">
              <CardHeader className="border-b border-[var(--pilot-line)] px-5 py-5 sm:px-7"><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[var(--pilot-muted-2)]">03 / REVISÃO EXPLÍCITA</p><CardTitle className="mt-2 text-xl">Orçamento preparado</CardTitle></CardHeader>
              <CardContent className="space-y-5 p-5 sm:p-7">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Summary label="Estimativa máxima" value={formatMicros(budget.estimatedMaxUsdMicros)} />
                  <Summary label="Seu teto solicitado" value={formatMicros(budget.maxSpendUsdMicros)} />
                  <Summary label="Válido até" value={Number.isFinite(budget.expiresAt) ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(budget.expiresAt)) : "Prazo indisponível"} />
                  <Summary label="Modelo / preço" value={`${budget.modelKey} · ${budget.priceVersion}`} />
                </div>
                <div className="rounded-xl border border-[var(--pilot-line)] p-4"><p className="text-xs font-bold uppercase tracking-[.1em]">Limites informados pelo servidor</p><p className="mt-2 font-mono text-xs leading-6 text-[var(--pilot-muted)]">{budget.limits.calls} chamadas · {budget.limits.inputTokens.toLocaleString("pt-BR")} tokens de entrada · {budget.limits.outputTokens.toLocaleString("pt-BR")} tokens de saída · {budget.limits.retries} tentativas · {Math.round(budget.limits.timeoutMs / 1000)} s</p></div>
                <div className="rounded-xl bg-[var(--pilot-subtle)] p-4"><p className="text-xs font-semibold">Compartilhamento previsto</p><ul className="mt-2 space-y-1.5">{budget.sharing.map((item, index) => <li key={`${item}-${index}`} className="flex gap-2 text-xs leading-5 text-[var(--pilot-muted)]"><span className="text-[var(--pilot-green)]">·</span>{item}</li>)}</ul><p className="mt-3 break-all font-mono text-[10px] text-[var(--pilot-muted-2)]">Fingerprint · {budget.fingerprint}</p></div>
                {isBudgetExpired ? <div role="alert" className="rounded-xl border border-[var(--pilot-warn-border)] bg-[var(--pilot-warn-bg)] p-4"><p className="text-sm font-semibold">O orçamento venceu.</p><p className="mt-1 text-xs leading-5 text-[var(--pilot-muted)]">Ele não pode mais ser confirmado. Prepare um novo orçamento para continuar.</p></div>
                  : approved ? <div role="status" className="flex items-start gap-3 rounded-xl border border-[var(--pilot-green)] bg-[var(--pilot-green-soft)] p-4"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--pilot-green)]" /><p className="text-sm leading-6"><strong>Preparação aprovada explicitamente.</strong> Isso não é execução nem dispara chamadas pagas. Execução real permanece desabilitada.</p></div>
                    : <div className="rounded-xl border border-[var(--pilot-warn-border)] bg-[var(--pilot-warn-bg)] p-4"><p className="text-sm font-semibold">A aprovação requer uma ação separada.</p><p className="mt-1 text-xs leading-5 text-[var(--pilot-muted)]">Revise o limite, os ativos, a validade e o compartilhamento acima. Nenhuma aprovação é automática.</p><Button onClick={approveExplicitly} disabled={isBusy || isBudgetExpired} className="mt-4 h-10 bg-[var(--pilot-green)] text-white hover:opacity-90">{approve.isPending ? "Registrando confirmação…" : "Confirmo esta preparação"}</Button>{approvalError && <p role="alert" className="mt-3 text-xs leading-5">{approvalError}</p>}</div>}
              </CardContent>
            </Card>}
          </div>

          <aside className="space-y-5">
            <Card><CardHeader className="px-5 pb-2 pt-5"><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[var(--pilot-muted-2)]">SALVAGUARDAS</p><CardTitle className="mt-2 text-lg">Preparação, não execução</CardTitle></CardHeader><CardContent className="space-y-3 px-5 pb-5"><AsideFact title="Sem chamadas pagas" body="Preparar e aprovar não envia solicitações a provedores." /><AsideFact title="Sem conexão de notebook" body="Nenhum mecanismo de execução está conectado nesta fase." /><AsideFact title="Sem ordens reais" body="O endpoint de execução não é chamado por esta interface." /><div className="rounded-lg border border-[var(--pilot-warn-border)] bg-[var(--pilot-warn-bg)] p-3 text-xs font-semibold leading-5">Execução real está permanentemente desabilitada nesta experiência.</div></CardContent></Card>
            <Card><CardContent className="p-5"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.12em] text-[var(--pilot-green)]"><ShieldCheck className="h-4 w-4" /> Privacidade</div><p className="mt-3 text-xs leading-6 text-[var(--pilot-muted)]">A página só solicita posições se o status autorizado pelo servidor vier como permitido. Não carrega cotações, não atualiza dados em segundo plano e descarta orçamento e confirmação quando a seleção local muda.</p></CardContent></Card>
          </aside>
        </section>
        <footer className="mt-7 rounded-xl border border-[var(--pilot-border)] bg-[var(--pilot-green-soft)] px-5 py-4 text-xs leading-6 text-[var(--pilot-muted)]">Ambiente privado de preparação. Não constitui recomendação financeira, ordem, aprovação de suitability ou autorização de execução. O estado permitido pelo servidor não altera a desabilitação de execução real.</footer>
      </div>
      <style>{`
        .portfolio-pilot{color-scheme:light;--pilot-page:#edf3ef;--pilot-ink:#203b32;--pilot-surface:#fbfcf8;--pilot-subtle:#f1f6f2;--pilot-line:#e0e9e2;--pilot-border:#cbd9d0;--pilot-muted:#587066;--pilot-muted-2:#84978d;--pilot-green:#28684f;--pilot-green-bright:#39745d;--pilot-green-soft:#e2eee7;--pilot-warn:#77591e;--pilot-warn-bg:#fff7e7;--pilot-warn-border:#e3cda2;--pilot-skeleton:#e3ebe5;background:var(--pilot-page);color:var(--pilot-ink)}
        .portfolio-pilot [class~="text-card-foreground"]{color:var(--pilot-ink)}
        .portfolio-pilot [class~="bg-card"]{background:var(--pilot-surface);border-color:var(--pilot-line)}
        .dark .portfolio-pilot{${darkPalette}}
        @media(prefers-color-scheme:dark){:root:not(.light) .portfolio-pilot{${darkPalette}}}
        @media(prefers-color-scheme:dark){:root:not(.light) .portfolio-pilot button[class~="bg-[var(--pilot-green)]"]{color:#14231d}}
        .dark .portfolio-pilot button[class~="bg-[var(--pilot-green)]"]{color:#14231d}
        @media(prefers-reduced-motion:reduce){.portfolio-pilot .animate-pulse{animation:none!important}.portfolio-pilot [class*="transition-"]{transition:none!important}}
      `}</style>
    </main>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-[var(--pilot-subtle)] p-3"><p className="text-[10px] font-bold uppercase tracking-[.1em] text-[var(--pilot-muted-2)]">{label}</p><p className="mt-1 break-words font-mono text-xs font-semibold">{value}</p></div>;
}

function AsideFact({ title, body }: { title: string; body: string }) {
  return <div className="border-l-2 border-[var(--pilot-border)] pl-3"><p className="text-xs font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-[var(--pilot-muted)]">{body}</p></div>;
}
