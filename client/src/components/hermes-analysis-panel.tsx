import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BrainCircuit, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Options = { available: boolean; models: { id: string; label: string; credits: number; priceVersion: string }[]; tickers: string[]; dailyLimit?: number; wallet?: { available: number; reserved: number }; message?: string };
type Job = { id: string; requestKey: string; ticker: string; modelId: string; status: "submitting" | "running" | "completed" | "failed"; output: string | null; runtime: { provider: string; model: string } | null; createdAt: string };
const labels = { submitting: "Solicitação aguardando confirmação", running: "Comitê em execução", completed: "Execução concluída — conteúdo não revisado", failed: "Execução interrompida ou frustrada" };

export function HermesAnalysisPanel() {
  const cache = useQueryClient();
  const options = useQuery<Options>({ queryKey: ["/api/investments/analysis-options"], retry: false });
  const history = useQuery<{ jobs: Job[] }>({ queryKey: ["/api/investments/analyses"], enabled: options.data?.available === true, retry: false });
  const [ticker, setTicker] = useState("");
  const [modelId, setModelId] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ ticker: string; modelId: string; label: string; credits: number; priceVersion: string } | null>(null);
  const request = useRef<{ key: string; ticker: string; modelId: string; confirmedCredits: number; priceVersion: string } | null>(null);
  useEffect(() => {
    if (!ticker && options.data?.tickers[0]) setTicker(options.data.tickers[0]);
    if (!modelId && options.data?.models[0]) setModelId(options.data.models[0].id);
  }, [options.data, ticker, modelId]);
  useEffect(() => {
    const pending = history.data?.jobs.find(j => j.status === "running" || j.status === "submitting");
    if (!activeId && pending) setActiveId(pending.id);
  }, [history.data, activeId]);
  const detail = useQuery<Job>({
    queryKey: [`/api/investments/analyses/${activeId}`], enabled: Boolean(activeId), retry: false,
    refetchInterval: q => q.state.error ? false : q.state.data?.status === "running" ? 5000 : false,
  });
  const submit = useMutation({
    mutationFn: async (retryJob?: Job) => {
      if (retryJob) {
        const model = options.data?.models.find(m => m.id === retryJob.modelId);
        if (!model) throw new Error("Modelo indisponível. Solicite a conferência do consultor.");
        // Retry uses the same request key; the store rejects changed execution pricing.
        request.current = { key: retryJob.requestKey, ticker: retryJob.ticker, modelId: retryJob.modelId, confirmedCredits: model.credits, priceVersion: model.priceVersion };
      }
      if (!request.current) throw new Error("Confirme o preço antes de iniciar a análise.");
      const response = await apiRequest("POST", "/api/investments/analyses", { ticker: request.current.ticker, modelId: request.current.modelId, idempotencyKey: request.current.key, confirmedCredits: request.current.confirmedCredits, priceVersion: request.current.priceVersion });
      return await response.json() as Job;
    },
    onError: error => {
      if (error.message.includes("PRICE_CHANGED")) {
        request.current = null;
        setConfirmation(null);
        void cache.invalidateQueries({ queryKey: ["/api/investments/analysis-options"] });
      }
    },
    onSuccess: job => {
      setActiveId(job.id); request.current = null;
      cache.setQueryData([`/api/investments/analyses/${job.id}`], job);
      void cache.invalidateQueries({ queryKey: ["/api/investments/analyses"] });
      void cache.invalidateQueries({ queryKey: ["/api/investments/analysis-options"] });
      void cache.invalidateQueries({ queryKey: ["/api/investments/credits"] });
    },
  });
  useEffect(() => {
    if (detail.data?.status === "completed" || detail.data?.status === "failed") {
      void cache.invalidateQueries({ queryKey: ["/api/investments/analysis-options"] });
      void cache.invalidateQueries({ queryKey: ["/api/investments/credits"] });
      void cache.invalidateQueries({ queryKey: ["/api/investments/analyses"] });
    }
  }, [detail.data?.status, cache]);
  const selectedModel = options.data?.models.find(m => m.id === modelId);
  const selectedPrice = selectedModel?.credits;
  const affordable = selectedPrice !== undefined && (options.data?.wallet?.available ?? 0) >= selectedPrice;
  const job = detail.data;
  const busy = submit.isPending || job?.status === "running" || job?.status === "submitting" || Boolean(request.current);
  return <Card>
    <CardHeader><CardTitle className="flex items-center gap-2"><BrainCircuit className="h-5 w-5" />Solicitar análise ao comitê Hermes</CardTitle>
      <p className="text-sm text-muted-foreground">Escolha uma ação e acompanhe o estudo. Recomendações para clientes exigem uma etapa própria de adequação e revisão.</p>
    </CardHeader>
    <CardContent className="space-y-5">
      {options.isLoading ? <p role="status">Verificando disponibilidade…</p> : options.isError ? <div role="alert"><p>Não foi possível verificar a conexão.</p><Button variant="outline" onClick={() => options.refetch()}>Tentar novamente</Button></div>
      : !options.data?.available ? <p className="rounded-lg bg-muted p-4 text-sm">{options.data?.message || "Integração em preparação."} Novas execuções aguardam a validação dos limites de consumo.</p>
      : <>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm font-medium"><span>Ação</span><select className="block w-full rounded-md border bg-background p-3" value={ticker} onChange={e => setTicker(e.target.value)} disabled={busy}>{options.data.tickers.map(t => <option key={t}>{t}</option>)}</select></label>
          <label className="space-y-2 text-sm font-medium"><span>Modelo da análise</span><select className="block w-full rounded-md border bg-background p-3" value={modelId} onChange={e => setModelId(e.target.value)} disabled={busy}>{options.data.models.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
        </div>
        <p className="text-xs text-muted-foreground">Piloto: até {options.data.dailyLimit} solicitações em 24 horas e uma análise em andamento por conta.</p>
        <p className="rounded-md border p-3 text-sm">Saldo disponível: {options.data.wallet?.available ?? 0} créditos · Reservados: {options.data.wallet?.reserved ?? 0}.<br />Esta análise reserva {selectedPrice ?? "—"} créditos. O consumo ocorre ao concluir o estudo informativo, antes da revisão profissional. Falha confirmada devolve os créditos; confirmação incerta mantém a reserva.</p>
        <Button onClick={() => { if (selectedModel) { submit.reset(); setConfirmation({ ticker, modelId, label: selectedModel.label, credits: selectedModel.credits, priceVersion: selectedModel.priceVersion }); } }} disabled={!ticker || !modelId || busy || !affordable}>{submit.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Revisar preço e análise</Button>
        <Dialog open={Boolean(confirmation)} onOpenChange={open => { if (!open) setConfirmation(null); }}>
          <DialogContent><DialogHeader><DialogTitle>Confirmar análise</DialogTitle><DialogDescription>Confira o modelo e o preço total antes de iniciar.</DialogDescription></DialogHeader>
            {confirmation && <div className="space-y-3 text-sm">
              <p>Ação: <strong>{confirmation.ticker}</strong> · Modelo: <strong>{confirmation.label}</strong></p>
              <p className="text-lg font-semibold">Preço fixo: {confirmation.credits} créditos</p>
              <p>Saldo disponível: {options.data?.wallet?.available ?? 0} créditos. Após a reserva: {(options.data?.wallet?.available ?? 0) - confirmation.credits} créditos.</p>
              <p>Você receberá o estudo informativo do comitê, ainda pendente de revisão profissional. Não há cobrança adicional automática.</p>
              <p>Falha confirmada devolve os créditos; execução com confirmação incerta mantém a reserva até conferência.</p>
            </div>}
            <DialogFooter><Button variant="outline" onClick={() => setConfirmation(null)}>Voltar</Button><Button disabled={!confirmation || submit.isPending || !options.data?.available || (options.data.wallet?.available ?? 0) < (confirmation?.credits ?? Infinity)} onClick={() => {
              if (!confirmation) return;
              request.current = { key: crypto.randomUUID(), ticker: confirmation.ticker, modelId: confirmation.modelId, confirmedCredits: confirmation.credits, priceVersion: confirmation.priceVersion };
              setConfirmation(null); submit.mutate(undefined);
            }}>Confirmar e iniciar análise</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        {submit.isError && <div role="alert" className="space-y-2 text-sm"><p>{submit.error.message}</p>{request.current && <Button variant="outline" disabled={submit.isPending} onClick={() => submit.mutate(undefined)}>Confirmar a mesma solicitação</Button>}</div>}
        {history.isError && <div role="alert"><p>Não foi possível carregar o histórico.</p><Button variant="outline" onClick={() => history.refetch()}>Recarregar histórico</Button></div>}
        {detail.isError && <div role="alert"><p>Andamento temporariamente indisponível. Isso não confirma falha da execução.</p><Button variant="outline" onClick={() => detail.refetch()}>Consultar novamente</Button></div>}
        {job && <div className="space-y-3 rounded-lg border p-4" aria-live="polite">
          <p className="font-medium">{job.ticker} · {labels[job.status]}</p>
          {job.status === "running" && <p className="text-sm text-muted-foreground">O Hermes está trabalhando. Você pode sair desta página e retomar pelo histórico.</p>}
          {job.status === "submitting" && <><p className="text-sm">A confirmação pode ter sido interrompida. Retome a mesma solicitação para evitar duplicidade.</p><Button variant="outline" disabled={submit.isPending} onClick={() => submit.mutate(job)}>Retomar solicitação</Button></>}
          {job.runtime && <p className="text-xs text-muted-foreground">Modelo efetivamente utilizado: {job.runtime.provider} / {job.runtime.model}</p>}
          {job.status === "completed" && <><p className="rounded-md bg-muted p-3 text-sm">Texto produzido pelo motor, ainda sem verificação independente ou aprovação do consultor. Conclusão da execução não significa análise completa ou recomendação aprovada.</p><pre className="max-h-[36rem] overflow-auto whitespace-pre-wrap break-words font-sans text-sm leading-6">{job.output}</pre></>}
        </div>}
        {history.data?.jobs.length ? <div className="space-y-2"><h3 className="font-medium">Suas solicitações recentes</h3>{history.data.jobs.map(j => <button type="button" key={j.id} className="block w-full rounded-md border p-3 text-left text-sm hover:bg-muted" onClick={() => { setActiveId(j.id); submit.reset(); }}>
          {j.ticker} · {labels[j.status]} · {new Date(j.createdAt).toLocaleString("pt-BR")}
        </button>)}</div> : null}
      </>}
    </CardContent>
  </Card>;
}
