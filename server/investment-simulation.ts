import { randomUUID } from "node:crypto";
import type { Express, RequestHandler } from "express";
import { z } from "zod";
import { pool } from "./storage";

export const SIMULATION_TICKERS = ["BBDC3", "BBAS3"] as const;
export const REAL_INVESTMENT_ANALYSIS_ENABLED = false;
type StudyRow = { id: string; user_id: string; request_key: string; ticker: string; created_at: Date | string };
export interface SimulationStore {
  list(userId: string): Promise<StudyRow[]>;
  get(userId: string, id: string): Promise<StudyRow | null>;
  create(userId: string, ticker: string, requestKey: string): Promise<StudyRow>;
}

export const simulationStore: SimulationStore = {
  async list(userId) {
    return (await pool.query<StudyRow>(
      "SELECT id,user_id,request_key,ticker,created_at FROM investment_simulation_studies WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 30", [userId])).rows;
  },
  async get(userId, id) {
    return (await pool.query<StudyRow>(
      "SELECT id,user_id,request_key,ticker,created_at FROM investment_simulation_studies WHERE user_id=$1 AND id=$2", [userId, id])).rows[0] ?? null;
  },
  async create(userId, ticker, requestKey) {
    const tx = await pool.connect();
    try {
      await tx.query("BEGIN");
      await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`simulation:${userId}`]);
      const existing = (await tx.query<StudyRow>(
        "SELECT id,user_id,request_key,ticker,created_at FROM investment_simulation_studies WHERE user_id=$1 AND request_key=$2", [userId, requestKey])).rows[0];
      if (existing) {
        if (existing.ticker !== ticker) throw new Error("SIMULATION_CONFLICT");
        await tx.query("COMMIT");
        return existing;
      }
      const counts = (await tx.query<{ active: number; daily: number }>(
        `SELECT count(*) FILTER (WHERE created_at > now()-interval '8 seconds')::int AS active,
         count(*) FILTER (WHERE created_at > now()-interval '24 hours')::int AS daily
         FROM investment_simulation_studies WHERE user_id=$1`, [userId])).rows[0];
      if (counts.active > 0) throw new Error("SIMULATION_ACTIVE");
      if (counts.daily >= 30) throw new Error("SIMULATION_LIMIT");
      const study = (await tx.query<StudyRow>(
        "INSERT INTO investment_simulation_studies(id,user_id,request_key,ticker) VALUES($1,$2,$3,$4) RETURNING id,user_id,request_key,ticker,created_at",
        [randomUUID(), userId, requestKey, ticker])).rows[0];
      await tx.query("COMMIT");
      return study;
    } catch (error) {
      await tx.query("ROLLBACK"); throw error;
    } finally { tx.release(); }
  },
};

/** Progress is a deterministic local demonstration, not background inference or market research. */
export function publicSimulation(row: StudyRow, now = Date.now()) {
  const age = Math.max(0, now - new Date(row.created_at).getTime());
  const status = age < 2000 ? "queued" : age < 8000 ? "running" : "completed";
  return {
    id: row.id, ticker: row.ticker, createdAt: new Date(row.created_at).toISOString(),
    mode: "simulation" as const, status,
    stage: status === "queued" ? "Preparando demonstração"
      : status === "running" ? "Montando o exemplo local" : "Estudo simulado concluído",
    output: status === "completed"
      ? `SIMULAÇÃO — DADOS FICTÍCIOS\nEstudo demonstrativo de ${row.ticker}.\n\n1. Organizar cotações e fundamentos seria o primeiro passo de um estudo real. Nenhum dado de mercado foi consultado aqui.\n2. Comparar riscos e cenários seria a etapa seguinte. Nenhuma avaliação de IA foi executada.\n3. Conferir fontes, datas e limites exigiria trabalho profissional. Isso não ocorreu nesta demonstração.\n\nEste exemplo usa um roteiro fixo, não mede o valor da ação e não indica compra ou venda. Não tem revisão profissional, não libera recomendação e não pode ser enviado como relatório aprovado. Tokens utilizados: 0. Créditos reais debitados: 0.`
      : null,
    tokensUsed: 0 as const, creditsDebited: 0 as const,
    professionalReview: "not_applicable" as const, recommendation: "blocked" as const,
  };
}

const input = z.object({ ticker: z.enum(SIMULATION_TICKERS), requestKey: z.string().uuid() }).strict();
export function registerSimulationRoutes(app: Express, auth: RequestHandler, options: {
  store?: SimulationStore; now?: () => number;
} = {}) {
  const store = options.store ?? simulationStore;
  const present = (row: StudyRow) => publicSimulation(row, options.now?.());
  const failure = (res: import("express").Response) => res.status(503).json({
    error: "SIMULATION_UNAVAILABLE", message: "Não foi possível acessar a simulação. Tente novamente; nenhuma análise paga foi iniciada.",
  });
  app.get("/api/investments/simulation-options", auth, (_req, res) => res.json({
    mode: "simulation", tickers: SIMULATION_TICKERS, tokensUsed: 0, creditsDebited: 0, realAnalysisEnabled: false,
  }));
  app.get("/api/investments/simulations", auth, async (req, res) => {
    try { res.json({ studies: (await store.list(req.userId!)).map(present) }); }
    catch { failure(res); }
  });
  app.post("/api/investments/simulations", auth, async (req, res) => {
    const parsed = input.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "INVALID_SIMULATION", message: "Selecione uma ação válida para a demonstração." });
    try { return res.status(202).json(present(await store.create(req.userId!, parsed.data.ticker, parsed.data.requestKey))); }
    catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code === "SIMULATION_CONFLICT") return res.status(409).json({ error: code, message: "Essa solicitação já foi usada para outra ação." });
      if (code === "SIMULATION_ACTIVE") return res.status(409).json({ error: code, message: "Acompanhe a simulação em andamento antes de iniciar outra." });
      if (code === "SIMULATION_LIMIT") return res.status(429).json({ error: code, message: "Limite diário de demonstrações atingido." });
      return failure(res);
    }
  });
  app.get("/api/investments/simulations/:id", auth, async (req, res) => {
    if (!z.string().uuid().safeParse(req.params.id).success) return res.status(404).json({ error: "SIMULATION_NOT_FOUND" });
    try {
      const row = await store.get(req.userId!, req.params.id);
      if (!row) return res.status(404).json({ error: "SIMULATION_NOT_FOUND" });
      return res.json(present(row));
    } catch { return failure(res); }
  });
}
