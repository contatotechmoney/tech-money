import { randomUUID } from "node:crypto";
import type { Express, RequestHandler } from "express";
import { z } from "zod";
import { pool } from "./storage";
import { PORTFOLIO_AGENTS, PORTFOLIO_DEMO_VERSION, portfolioMetrics, portfolioScenario, presentPortfolioStudy, type PortfolioStudyRow } from "../shared/portfolio-simulation";

export interface PortfolioSimulationStore {
  list(userId: string): Promise<PortfolioStudyRow[]>;
  get(userId: string, id: string): Promise<PortfolioStudyRow | null>;
  create(userId: string, requestKey: string): Promise<PortfolioStudyRow>;
}

/** Separate from real holdings, market quotes, reports and review approvals. No startup queries. */
export const portfolioSimulationStore: PortfolioSimulationStore = {
  async list(userId) {
    return (await pool.query<PortfolioStudyRow>(
      "SELECT id,user_id,request_key,scenario_version,created_at FROM portfolio_simulation_studies WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 30",
      [userId])).rows;
  },
  async get(userId, id) {
    return (await pool.query<PortfolioStudyRow>(
      "SELECT id,user_id,request_key,scenario_version,created_at FROM portfolio_simulation_studies WHERE user_id=$1 AND id=$2",
      [userId, id])).rows[0] ?? null;
  },
  async create(userId, requestKey) {
    const tx = await pool.connect();
    try {
      await tx.query("BEGIN");
      await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`portfolio-simulation:${userId}`]);
      const existing = (await tx.query<PortfolioStudyRow>(
        "SELECT id,user_id,request_key,scenario_version,created_at FROM portfolio_simulation_studies WHERE user_id=$1 AND request_key=$2",
        [userId, requestKey])).rows[0];
      if (existing) { await tx.query("COMMIT"); return existing; }
      const counts = (await tx.query<{ active: number; daily: number }>(
        `SELECT count(*) FILTER (WHERE created_at > now()-interval '12 seconds')::int AS active,
         count(*) FILTER (WHERE created_at > now()-interval '24 hours')::int AS daily
         FROM portfolio_simulation_studies WHERE user_id=$1`, [userId])).rows[0];
      if (counts.active > 0) throw new Error("PORTFOLIO_SIMULATION_ACTIVE");
      if (counts.daily >= 30) throw new Error("PORTFOLIO_SIMULATION_LIMIT");
      const row = (await tx.query<PortfolioStudyRow>(
        "INSERT INTO portfolio_simulation_studies(id,user_id,request_key,scenario_version) VALUES($1,$2,$3,$4) RETURNING id,user_id,request_key,scenario_version,created_at",
        [randomUUID(), userId, requestKey, PORTFOLIO_DEMO_VERSION])).rows[0];
      await tx.query("COMMIT");
      return row;
    } catch (error) {
      await tx.query("ROLLBACK");
      throw error;
    } finally { tx.release(); }
  },
};

const input = z.object({ requestKey: z.string().uuid() }).strict();
export function registerPortfolioSimulationRoutes(app: Express, auth: RequestHandler, options: {
  store?: PortfolioSimulationStore; now?: () => number;
} = {}) {
  const store = options.store ?? portfolioSimulationStore;
  const present = (row: PortfolioStudyRow) => presentPortfolioStudy(row, options.now?.());
  const privateResponse: RequestHandler = (_req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    next();
  };
  const unavailable = (res: import("express").Response) => res.status(503).json({
    error: "PORTFOLIO_SIMULATION_UNAVAILABLE",
    message: "Não foi possível acessar o histórico da simulação de carteira. Nenhuma análise real foi iniciada. Tente novamente.",
  });
  app.get("/api/investments/portfolio-simulation/scenario", auth, privateResponse, (_req, res) => res.json({
    mode: "simulation", scenario: portfolioScenario(), metrics: portfolioMetrics(), agents: PORTFOLIO_AGENTS,
    tokensUsed: 0, creditsDebited: 0,
  }));
  app.get("/api/investments/portfolio-simulations", auth, privateResponse, async (req, res) => {
    try { res.json({ studies: (await store.list(req.userId!)).map(present) }); }
    catch { unavailable(res); }
  });
  app.post("/api/investments/portfolio-simulations", auth, privateResponse, async (req, res) => {
    const parsed = input.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Use apenas a chave de solicitação da demonstração. Posições, perfis ou modelos reais não são aceitos." });
    try { res.status(202).json(present(await store.create(req.userId!, parsed.data.requestKey))); }
    catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code === "PORTFOLIO_SIMULATION_ACTIVE") return res.status(409).json({ error: code, message: "Aguarde a demonstração atual terminar." });
      if (code === "PORTFOLIO_SIMULATION_LIMIT") return res.status(429).json({ error: code, message: "Limite diário de demonstrações atingido." });
      unavailable(res);
    }
  });
  app.get("/api/investments/portfolio-simulations/:id", auth, privateResponse, async (req, res) => {
    if (!z.string().uuid().safeParse(req.params.id).success) return res.status(400).json({ error: "Identificador inválido." });
    try {
      const row = await store.get(req.userId!, req.params.id);
      if (!row) return res.status(404).json({ error: "Demonstração não encontrada." });
      res.json(present(row));
    } catch { unavailable(res); }
  });
}
