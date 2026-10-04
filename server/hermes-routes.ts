import { createHash } from "node:crypto";
import type { Express, RequestHandler } from "express";
import { z } from "zod";
import { HermesClient, hermesConfig, type HermesConfig } from "./hermes-client";
import { analysisStore, publicJob, type AnalysisStore } from "./hermes-jobs";

const inputSchema = z.object({ ticker: z.string().trim().toUpperCase(), modelId: z.string().max(120), idempotencyKey: z.string().uuid() }).strict();
export function registerHermesRoutes(app: Express, auth: RequestHandler, options: {
  config?: () => HermesConfig | null; store?: AnalysisStore; client?: Pick<HermesClient, "start" | "poll">;
} = {}) {
  const store = options.store || analysisStore;
  const config = options.config || hermesConfig;
  async function enabled(userId: string) {
    const current = config();
    if (!current || !current.users.includes(userId)) return null;
    return await store.ready() ? current : null;
  }
  app.get("/api/investments/analysis-options", auth, async (req, res) => {
    try {
      const current = await enabled(req.userId!);
      return res.json(current ? { available: true, models: current.models.map(m => ({ id: m.id, label: m.label, credits: m.credits })), tickers: current.tickers, dailyLimit: current.dailyLimit, wallet: await store.wallet(req.userId!) }
        : { available: false, models: [], tickers: [], message: "A conexão com o comitê Hermes ainda não está habilitada para esta conta." });
    } catch { return res.status(503).json({ error: "Não foi possível verificar a conexão do comitê." }); }
  });
  app.get("/api/investments/credits", auth, async (req, res) => {
    try {
      if (!await store.ready()) return res.status(503).json({ error: "Carteira em preparação." });
      return res.json(await store.wallet(req.userId!));
    } catch { return res.status(503).json({ error: "Não foi possível consultar os créditos." }); }
  });
  app.get("/api/investments/analyses", auth, async (req, res) => {
    try {
      if (!await enabled(req.userId!)) return res.json({ jobs: [] });
      return res.json({ jobs: (await store.list(req.userId!)).map(publicJob) });
    } catch { return res.status(503).json({ error: "Não foi possível carregar o histórico." }); }
  });
  app.post("/api/investments/analyses", auth, async (req, res) => {
    try {
      const current = await enabled(req.userId!);
      if (!current) return res.status(503).json({ error: "Conexão com o Hermes ainda não habilitada." });
      const input = inputSchema.safeParse(req.body);
      if (!input.success) return res.status(400).json({ error: "Solicitação inválida." });
      const { ticker, modelId, idempotencyKey } = input.data;
      const model = current.models.find(m => m.id === modelId);
      if (!model || !current.tickers.includes(ticker)) return res.status(400).json({ error: "Ação ou modelo não habilitado para este piloto." });
      let job = await store.reserve(req.userId!, idempotencyKey, ticker, modelId, current.dailyLimit, current.globalLimit, current.globalConcurrent, { credits: model.credits, maxCostMicroUsd: model.maxCostMicroUsd, dailyBudgetMicroUsd: current.dailyBudgetMicroUsd, executionFingerprint: createHash("sha256").update(JSON.stringify([model.provider,model.model,model.credits,model.maxCostMicroUsd,current.url])).digest("hex") });
      if (job.status === "submitting") {
        if (Date.now() - new Date(job.created_at).getTime() > 23 * 60 * 60 * 1000) return res.status(409).json({ error: "Solicitação antiga sem confirmação. O consultor deve conferir o histórico do Hermes antes de iniciar outra." });
        // Retrying an uncertain submission uses the same durable Hermes idempotency key.
        const runId = await (options.client || new HermesClient(current)).start(job.id, ticker, model);
        await store.attach(req.userId!, job.id, runId);
        job = (await store.get(req.userId!, job.id))!;
      }
      return res.status(202).json(publicJob(job));
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code === "INSUFFICIENT_CREDITS") return res.status(402).json({ error: "Saldo de créditos insuficiente. Nenhuma nova análise foi iniciada." });
      if (code === "FINANCIAL_BUDGET") return res.status(429).json({ error: "Limite financeiro de processamento atingido. Nenhuma nova análise foi iniciada." });
      if (code === "GLOBAL_LIMIT") return res.status(429).json({ error: "O orçamento diário de solicitações do piloto foi atingido. Nenhuma nova análise foi iniciada." });
      if (code === "GLOBAL_BUSY") return res.status(429).json({ error: "O comitê atingiu o limite de execuções simultâneas. Tente mais tarde." });
      if (code === "DAILY_LIMIT") return res.status(429).json({ error: "Limite de análises das últimas 24 horas atingido." });
      if (code === "ANALYSIS_ACTIVE") return res.status(409).json({ error: "Já existe uma análise em andamento. Acompanhe-a no histórico." });
      if (code === "IDEMPOTENCY_CONFLICT") return res.status(409).json({ error: "Esta solicitação já foi usada com outra ação ou modelo." });
      return res.status(503).json({ error: "A solicitação não pôde ser confirmada. Tente novamente com a mesma solicitação; não inicie outra análise." });
    }
  });
  app.get("/api/investments/analyses/:id", auth, async (req, res) => {
    if (!z.string().uuid().safeParse(req.params.id).success) return res.status(404).json({ error: "Análise não encontrada." });
    try {
      const current = await enabled(req.userId!);
      if (!current) return res.status(503).json({ error: "Conexão com o Hermes ainda não habilitada." });
      const job = await store.get(req.userId!, req.params.id);
      // Verify ownership before any remote request. Remote run identifiers are never accepted from clients.
      if (!job) return res.status(404).json({ error: "Análise não encontrada." });
      if (job.status === "running" && job.run_id) {
        const result = await (options.client || new HermesClient(current)).poll(job.run_id);
        await store.update(req.userId!, job.id, result);
        return res.json(publicJob((await store.get(req.userId!, job.id))!));
      }
      return res.json(publicJob(job));
    } catch { return res.status(503).json({ error: "Não foi possível consultar o andamento. O histórico permanece preservado." }); }
  });
}
