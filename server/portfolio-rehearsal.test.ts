import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import express from "express";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { REHEARSAL_MODELS, prepareRehearsal, approveRehearsal } from "../shared/portfolio-rehearsal";
import { transformSync } from "esbuild";
import { runInNewContext } from "node:vm";
import { registerPortfolioSimulationRoutes, type PortfolioSimulationStore } from "./portfolio-simulation";
import type { PortfolioStudyRow } from "../shared/portfolio-simulation";

const now = Date.parse("2026-10-12T12:00:00Z");
function presentation(path: string, dependencies: Record<string, unknown>) {
  const compiled = transformSync(readFileSync(path, "utf8"), { loader: "tsx", format: "cjs", jsx: "transform" }).code;
  const module = { exports: {} as Record<string, React.ComponentType<any>> };
  runInNewContext(compiled, { module, exports: module.exports, React,
    require: (name: string) => {
      if (name === "react") return React;
      if (name.endsWith(".css")) return {};
      if (name in dependencies) return dependencies[name];
      throw new Error("Unexpected presentation dependency: " + name);
    },
  });
  return module.exports;
}
const brand = presentation("client/src/components/tech-money-brand.tsx", {});
const PortfolioBudgetRehearsal = presentation("client/src/components/portfolio-budget-rehearsal.tsx", {
  "lucide-react": Object.fromEntries(["AlertTriangle", "Check", "Clock3", "FlaskConical", "ShieldCheck"]
    .map(name => [name, (props: object) => createElement("svg", props)])),
  "@/components/tech-money-brand": brand,
  "@/components/ui/button": { Button: ({ children, ...props }: any) => createElement("button", props, children) },
  "@/components/ui/card": Object.fromEntries(["Card", "CardContent", "CardHeader", "CardTitle"]
    .map(name => [name, ({ children, ...props }: any) => createElement("div", props, children)])),
  "../../../shared/portfolio-rehearsal": { REHEARSAL_MODELS, prepareRehearsal, approveRehearsal },
}).PortfolioBudgetRehearsal;
describe("portfolio budget rehearsal — browser-only, no real approval", () => {
  it("requires an explicit fictional model, never accepts a Nous identifier", () => {
    for (const id of ["", "deepseek/deepseek-v4-flash", "z-ai/glm-5.2"])
      assert.throws(() => prepareRehearsal(id, 1_000_000, now), /MODEL_SELECTION_REQUIRED/);
    assert.equal(REHEARSAL_MODELS.length, 2);
  });
  it("rejects absent, invalid, excessive and insufficient ceilings", () => {
    for (const cap of [0, -1, 1_000_001, Infinity, NaN, 0.5])
      assert.throws(() => prepareRehearsal("fictional-a", cap, now), /INVALID_CEILING/);
    assert.throws(() => prepareRehearsal("fictional-b", 100_000, now), /BUDGET_EXCEEDED/);
  });
  it("never produces an executable budget and never shares positions", () => {
    const quote = prepareRehearsal("fictional-a", 500_000, now);
    assert.equal(quote.mode, "simulation");
    assert.equal(quote.executable, false);
    assert.equal(quote.expiresAt, now + 120_000);
    assert.match(quote.sharing.join(" "), /Nenhum dado/);
  });
  it("requires specific consent and rejects expired or reversed time", () => {
    const quote = prepareRehearsal("fictional-a", 500_000, now);
    assert.throws(() => approveRehearsal(quote, quote.modelId, 500_000, now, false), /APPROVAL_REQUIRED/);
    for (const at of [now - 1, now + 120_000, Infinity, NaN])
      assert.throws(() => approveRehearsal(quote, quote.modelId, 500_000, at, true), /BUDGET_EXPIRED/);
    approveRehearsal(quote, quote.modelId, 500_000, now + 1, true);
    assert.equal(quote.executable, false);
  });
  it("invalidates consent when model, cap, composition or quote values change", () => {
    const quote = prepareRehearsal("fictional-a", 500_000, now);
    assert.throws(() => approveRehearsal(quote, "fictional-b", 500_000, now, true), /APPROVAL_INVALIDATED/);
    assert.throws(() => approveRehearsal(quote, quote.modelId, 600_000, now, true), /APPROVAL_INVALIDATED/);
    for (const altered of [{ ...quote, scenarioVersion: "real" }, { ...quote, estimatedUsdMicros: 0 },
      { ...quote, executable: true }, { ...quote, expiresAt: now + 300_000 }])
      assert.throws(() => approveRehearsal(altered as typeof quote, quote.modelId, 500_000, now, true), /APPROVAL_INVALIDATED/);
  });
  it("renders honest initial state with no preselected model or consent", () => {
    const html = renderToStaticMarkup(createElement(PortfolioBudgetRehearsal, { onStart() { throw new Error("NO_AUTO_START"); }, disabled: false }));
    assert.match(html, /Ensaio de orçamento/);
    assert.match(html, /100% fictício/);
    assert.match(html, /Cobrança real: US\$ 0/);
    assert.match(html, /não representam modelos, tarifas ou preços Nous/);
    assert.doesNotMatch(html, /checked=""/);
  });
  it("never persists rehearsal values or dispatches real pilot APIs from the component", () => {
    const source = readFileSync("client/src/components/portfolio-budget-rehearsal.tsx", "utf8");
    assert.doesNotMatch(source, /localStorage|sessionStorage|apiRequest|fetch\(|\/api\//);
    assert.match(source, /if \(disabled \|\| !quote \|\| !confirmed\) return/);
    assert.match(source, /approveRehearsal\(/);
    const page = readFileSync("client/src/pages/portfolio-simulation.tsx", "utf8");
    assert.match(page, /key=\{userId\}/);
    assert.match(page, /PortfolioBudgetRehearsal/);
    assert.match(page, /não registra aprovação nem envia para fila/);
  });
});

describe("full authenticated rehearsal to six-agent private history — fake identities only", () => {
  it("requires login, rejects real data, completes all six agents, reopens history and isolates another user", async () => {
    let clock = now;
    const rows: PortfolioStudyRow[] = [];
    const store: PortfolioSimulationStore = {
      list: async owner => rows.filter(row => row.user_id === owner),
      get: async (owner, id) => rows.find(row => row.user_id === owner && row.id === id) ?? null,
      create: async (owner, key) => {
        const previous = rows.find(row => row.user_id === owner && row.request_key === key);
        if (previous) return previous;
        const row = { id: randomUUID(), user_id: owner, request_key: key,
          scenario_version: "portfolio-demo-v1", created_at: new Date(clock) };
        rows.push(row); return row;
      },
    };
    const app = express(); app.use(express.json());
    registerPortfolioSimulationRoutes(app, (req, res, next) => {
      const actor = req.get("x-synthetic-actor");
      if (!actor) { res.status(401).json({ error: "SIGNED_IN_REQUIRED" }); return; }
      req.userId = actor; next();
    }, { store, now: () => clock });
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    const address = server.address() as import("node:net").AddressInfo;
    const root = `http://127.0.0.1:${address.port}`;
    const request = (path: string, actor?: string, body?: unknown) => fetch(root + path, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", ...(actor ? { "x-synthetic-actor": actor } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    try {
      assert.equal((await request("/api/investments/portfolio-simulation/scenario")).status, 401);
      const scenario = await (await request("/api/investments/portfolio-simulation/scenario", "fake-owner")).json();
      assert.equal(scenario.agents.length, 6);
      const quote = prepareRehearsal("fictional-b", 500_000, clock);
      approveRehearsal(quote, quote.modelId, 500_000, clock, true);
      const requestKey = randomUUID();
      assert.equal((await request("/api/investments/portfolio-simulations", "fake-owner",
        { requestKey, positions: [{ ticker: "REAL", quantity: 1 }], quote })).status, 400);
      const started = await request("/api/investments/portfolio-simulations", "fake-owner", { requestKey });
      assert.equal(started.status, 202);
      const study = await started.json();
      assert.equal(study.status, "queued");
      clock += 4001;
      const progress = await (await request("/api/investments/portfolio-simulations/" + study.id, "fake-owner")).json();
      assert.equal(progress.status, "running");
      assert.equal(progress.completedAgents, 2);
      clock += 8000;
      const result = await (await request("/api/investments/portfolio-simulations/" + study.id, "fake-owner")).json();
      assert.equal(result.status, "completed");
      assert.equal(result.completedAgents, 6);
      assert.ok(result.agents.every((agent: { output: string }) => agent.output));
      assert.match(result.synthesis, /Denise/);
      assert.equal(result.tokensUsed, 0); assert.equal(result.creditsDebited, 0);
      assert.equal(result.recommendation, "blocked");
      assert.equal(result.professionalReview, "not_applicable");
      const history = await (await request("/api/investments/portfolio-simulations", "fake-owner")).json();
      assert.equal(history.studies[0].id, study.id);
      const repeated = await (await request("/api/investments/portfolio-simulations", "fake-owner", { requestKey })).json();
      assert.equal(repeated.id, study.id); assert.equal(rows.length, 1);
      assert.equal((await request("/api/investments/portfolio-simulations/" + study.id, "other-fake-owner")).status, 404);
      assert.deepEqual((await (await request("/api/investments/portfolio-simulations", "other-fake-owner")).json()).studies, []);
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });
});
