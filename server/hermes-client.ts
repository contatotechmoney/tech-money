export type HermesModel = { id: string; label: string; provider: string; model: string };
export type HermesConfig = { url: string; key: string; models: HermesModel[]; tickers: string[]; users: string[]; dailyLimit: number; globalLimit: number; globalConcurrent: number };
export type HermesRun = { status: "running" | "completed" | "failed"; output: string | null; runtime: { provider: string; model: string } | null };

export function hermesConfig(env: NodeJS.ProcessEnv = process.env): HermesConfig | null {
  if (env.HERMES_ANALYSIS_ENABLED !== "true") return null;
  try {
    const url = new URL(env.HERMES_API_URL || "");
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null;
    const models: unknown = JSON.parse(env.HERMES_MODELS_JSON || "[]");
    if (!Array.isArray(models) || models.length === 0 || models.length > 10) return null;
    if (!models.every(m => m && [m.id, m.label, m.provider, m.model].every(v => typeof v === "string" && v.length > 0 && v.length <= 120))) return null;
    if (new Set(models.map(m => m.id)).size !== models.length) return null;
    const tickers = (env.HERMES_ALLOWED_TICKERS || "BBDC3,BBAS3").split(",").map(v => v.trim().toUpperCase());
    if (!tickers.every(t => /^[A-Z0-9]{4}\d{1,2}$/.test(t))) return null;
    const users = (env.HERMES_ALLOWED_USER_IDS || "").split(",").map(v => v.trim()).filter(Boolean);
    const dailyLimit = Number(env.HERMES_DAILY_LIMIT || "3");
    const globalLimit = Number(env.HERMES_GLOBAL_DAILY_LIMIT || "10");
    const globalConcurrent = Number(env.HERMES_GLOBAL_CONCURRENT || "2");
    if (!Number.isInteger(globalLimit) || globalLimit < 1 || globalLimit > 1000 || !Number.isInteger(globalConcurrent) || globalConcurrent < 1 || globalConcurrent > 10) return null;
    if (!env.HERMES_API_KEY || !users.length || !Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 100) return null;
    return { url: url.toString().replace(/\/$/, ""), key: env.HERMES_API_KEY, models: models as HermesModel[], tickers, users, dailyLimit, globalLimit, globalConcurrent };
  } catch { return null; }
}

export class HermesClient {
  constructor(private config: HermesConfig, private request: typeof fetch = fetch) {}
  private async call(path: string, init: RequestInit = {}) {
    const response = await this.request(`${this.config.url}${path}`, {
      ...init, redirect: "error", signal: AbortSignal.timeout(20_000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.config.key}`, ...init.headers },
    });
    if (!response.ok) throw new Error("HERMES_UNAVAILABLE");
    // Do not include remote errors, tool previews or credentials in public messages.
    return response.json();
  }
  async start(id: string, ticker: string, model: HermesModel): Promise<string> {
    const body = await this.call("/v1/runs", { method: "POST", headers: { "Idempotency-Key": id }, body: JSON.stringify({
      model: model.model, provider: model.provider,
      input: `Execute o fluxo de análise do comitê B3 configurado para ${ticker}. Esta solicitação é um estudo informativo, sem cliente associado.`,
      instructions: "Use o fluxo de comitê já instalado: coleta com fontes e datas, primeira rodada, exame cruzado, refutação e verificação de fatos. Não invente dados nem execute operações financeiras, envie mensagens ou publique materiais. Identifique etapas e agentes que não puderam executar. Retorne texto com fontes, divergências e limitações. A conclusão da execução não constitui verificação nem aprovação profissional. Não leia dados de clientes, credenciais ou arquivos pessoais. Não altere código ou configuração. Trabalhe somente nos dados públicos e artefatos do ticker solicitado.",
    }) });
    if (!body || typeof body.run_id !== "string" || !/^[\w-]{1,180}$/.test(body.run_id)) throw new Error("HERMES_INVALID_RESPONSE");
    return body.run_id;
  }
  async poll(runId: string): Promise<HermesRun> {
    const body = await this.call(`/v1/runs/${encodeURIComponent(runId)}`);
    if (!body || typeof body.status !== "string") throw new Error("HERMES_INVALID_RESPONSE");
    const status = ["started", "queued", "running"].includes(body.status) ? "running"
      : body.status === "completed" ? "completed"
      : ["failed", "cancelled", "interrupted"].includes(body.status) ? "failed" : null;
    if (!status) throw new Error("HERMES_INVALID_RESPONSE");
    const output = typeof body.output === "string" ? body.output.slice(0, 100_000) : null;
    if (status === "completed" && !output?.trim()) throw new Error("HERMES_INVALID_RESPONSE");
    const runtime = body.runtime && typeof body.runtime.provider === "string" && typeof body.runtime.model === "string"
      ? { provider: body.runtime.provider.slice(0, 120), model: body.runtime.model.slice(0, 120) } : null;
    return { status, output: status === "completed" ? output : null, runtime };
  }
}
