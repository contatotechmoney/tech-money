// Separate, ephemeral test process. Never mounted by server/index.ts or production.
import express from "express";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { ReplitConnectors } from "@replit/connectors-sdk";

if (process.env.SYNTHETIC_BROWSER_TEST !== "1" || process.env.DATABASE_URL !== undefined) {
  throw Error("Isolated browser fixture requires SYNTHETIC_BROWSER_TEST=1 and no DATABASE_URL.");
}
const { registerRoutes } = await import("../../server/routes");
const { simulationStore } = await import("../../server/investment-simulation");
const { portfolioSimulationStore } = await import("../../server/portfolio-simulation");
const { PORTFOLIO_DEMO_VERSION } = await import("../../shared/portfolio-simulation");
const { pool, storage } = await import("../../server/storage");
const { startReportDeliveryWorker, reconcileUnconfirmedReportDeliveries } = await import("../../server/report-delivery");
const { shouldStartReportDeliveryWorker } = await import("../../shared/simulation-policy");

const evidence = { externalCalls: 0, databaseCalls: 0, legacyCalls: 0, signIns: 0, studiesCreated: 0 };
globalThis.fetch = async () => { evidence.externalCalls++; throw Error("EXTERNAL_NETWORK_FORBIDDEN"); };
ReplitConnectors.prototype.proxy = async () => { evidence.externalCalls++; throw Error("CONNECTOR_FORBIDDEN"); };
pool.query = (async () => { evidence.databaseCalls++; throw Error("DATABASE_FORBIDDEN"); }) as any;
pool.connect = (async () => { evidence.databaseCalls++; throw Error("DATABASE_FORBIDDEN"); }) as any;
for (const name of ["claimReportDeliveryRequests", "flagUnconfirmedReportDeliveries", "pruneReportDeliveryProviderEvents"] as const) {
  (storage[name] as any) = async () => { evidence.legacyCalls++; throw Error("LEGACY_QUERY_FORBIDDEN"); };
}
storage.listReportDeliveryRequests = async () => { evidence.legacyCalls++; throw Error("LEGACY_HISTORY_QUERY_FORBIDDEN"); };
storage.listReports = async () => [];
type Row = { id: string; user_id: string; request_key: string; ticker: string; created_at: string };
const rows: Row[] = [];
simulationStore.list = async owner => rows.filter(row => row.user_id === owner).slice().reverse();
simulationStore.get = async (owner, id) => rows.find(row => row.user_id === owner && row.id === id) ?? null;
simulationStore.create = async (owner, ticker, key) => {
  const previous = rows.find(row => row.user_id === owner && row.request_key === key);
  if (previous) {
    if (previous.ticker !== ticker) throw Error("SIMULATION_CONFLICT");
    return previous;
  }
  if (rows.some(row => row.user_id === owner && Date.now() - Date.parse(row.created_at) < 8000)) throw Error("SIMULATION_ACTIVE");
  const row = { id: randomUUID(), user_id: owner, request_key: key, ticker, created_at: new Date().toISOString() };
  rows.push(row); evidence.studiesCreated++; return row;
};
const portfolioRows: { id: string; user_id: string; request_key: string; scenario_version: string; created_at: string }[] = [];
portfolioSimulationStore.list = async owner => portfolioRows.filter(row => row.user_id === owner).slice().reverse();
portfolioSimulationStore.get = async (owner, id) => portfolioRows.find(row => row.user_id === owner && row.id === id) ?? null;
portfolioSimulationStore.create = async (owner, key) => {
  const existing = portfolioRows.find(row => row.user_id === owner && row.request_key === key);
  if (existing) return existing;
  if (portfolioRows.some(row => row.user_id === owner && Date.now() - Date.parse(row.created_at) < 12000)) throw Error("PORTFOLIO_SIMULATION_ACTIVE");
  const row = { id: randomUUID(), user_id: owner, request_key: key, scenario_version: PORTFOLIO_DEMO_VERSION, created_at: new Date().toISOString() };
  portfolioRows.push(row); evidence.studiesCreated++; return row;
};
// Exercise the exported defenses directly as well as the production startup predicate.
if (shouldStartReportDeliveryWorker("production")) throw Error("WORKER_MUST_NOT_START");
startReportDeliveryWorker()();
await reconcileUnconfirmedReportDeliveries();

const app = express();
const server = createServer(app);
app.use(express.json());
app.use((req, _res, next) => {
  const actor = req.headers.cookie?.match(/(?:^|;\s*)tm_sim_fixture=(alpha|beta)(?:;|$)/)?.[1];
  const auth = Object.assign(() => ({
    userId: actor ? `synthetic-${actor}` : null, tokenType: "session_token",
  }), { [Symbol.for("@clerk/express.auth")]: true });
  Object.assign(req, { auth }); next();
});
app.post("/__fixture/sign-in", (req, res) => {
  const actor = req.body.identifier === "alpha@example.test" ? "alpha"
    : req.body.identifier === "beta@example.test" ? "beta" : null;
  if (!actor) return res.status(400).json({ error: "Use alpha@example.test or beta@example.test" });
  evidence.signIns++;
  res.setHeader("Set-Cookie", `tm_sim_fixture=${actor}; Path=/; SameSite=Lax`);
  res.json({ synthetic: true });
});
app.post("/__fixture/sign-out", (_req, res) => {
  res.setHeader("Set-Cookie", "tm_sim_fixture=; Path=/; Max-Age=0"); res.json({ synthetic: true });
});
app.get("/__fixture/evidence", (_req, res) => res.json({
  ...evidence, synthetic: true, productionWorkerEnabled: shouldStartReportDeliveryWorker("production"),
  tokensConsumed: 0, realCreditsChanged: 0, accountsCreated: 0,
}));
// Registration and review data here are fictitious. Production lead routes are untouched.
app.get("/api/leads/profile", (req, res) => {
  const userId = req.auth?.().userId;
  if (!userId) return res.status(401).json({ error: "UNAUTHORIZED" });
  res.json({ registered: true, enabled: true, nome: "Synthetic", email: `${userId}@example.test`, marketing_opt_in: false });
});
app.get("/api/investments/review-access", (_req, res) => res.json({ assignments: [], canReview: false, canManageAssignments: false }));
app.get("/api/investments/review-pending-count", (_req, res) => res.json({ total: 0 }));
await registerRoutes(server, app, { checkProfile: async () => ({ ok: false, motivo: "Perfil exclusivamente fictício." }) });
const root = process.cwd();
const vite = await createViteServer({
  configFile: false, envDir: "/tmp/tm-no-env-files", root: path.join(root, "client"),
  plugins: [react(), tailwindcss({ optimize: false })],
  resolve: { alias: [
    { find: /^@clerk\/react(?:\/(?:legacy|internal))?$/, replacement: path.join(root, "scripts/tests/synthetic-clerk.tsx") },
    { find: "@", replacement: path.join(root, "client/src") },
    { find: "@shared", replacement: path.join(root, "shared") },
    { find: "@assets", replacement: path.join(root, "attached_assets") },
  ] },
  css: { postcss: { plugins: [] } },
  server: { middlewareMode: true, allowedHosts: true, hmr: { server }, fs: { allow: [root] } },
});
app.get("/__fixture/legacy-monitor", async (req, res) => {
  res.type("html").send(await vite.transformIndexHtml(req.originalUrl,
    `<html><head></head><body><div id="root"></div><script type="module" src="/@fs/${root}/scripts/tests/legacy-delivery-widget.tsx"></script></body></html>`));
});
app.use(vite.middlewares);
server.listen(5110, "0.0.0.0", () => console.log("SYNTHETIC_BROWSER_READY http://127.0.0.1:5110 (no database, providers or real accounts)"));
process.once("SIGTERM", () => { void vite.close().then(() => server.close(() => process.exit(0))); });
