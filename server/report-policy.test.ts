import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canDeliverPersonalizedRecommendation, informationalReport, reportPresentation, REPORT_FRESHNESS_MS } from "./report-policy";
import type { AnalysisQuality } from "../shared/report-quality";

const now = Date.parse("2026-10-02T12:00:00Z");
const quality: AnalysisQuality = {
  version: 1, status: "complete", reason: "Avaliações válidas de teste.",
  availableAgents: 9, expectedAgents: 9, missingAgents: [],
  consensusScore: 7.4, highRisk: false,
  marketDataAt: new Date(now).toISOString(), fundamentalsPeriod: "2026-06-30",
};
const document = {
  id: "synthetic-document", userId: "synthetic-owner", generatedAt: new Date(now).toISOString(),
  riskScore: 3, analysisQuality: quality, signal: "Comprar", summary: "Documento de teste.",
  source: "Fonte sintética", price: 25, changePercent: 0,
  strengths: ["Teste"], risks: [], outlook: "Teste",
};

describe("report safety policy (pure synthetic data)", () => {
  it("complete analysis with compatible profile still requires actual professional review", () => {
    const result = reportPresentation(document, { now, profile: { ok: true } });
    assert.equal(result.analysisStatus, "complete");
    assert.equal(result.consensusScore, 7.4);
    assert.equal(result.recommendation.profileStatus, "compatible");
    assert.equal(result.recommendation.status, "pending");
    assert.equal(result.recommendation.professionalReview, "pending");
    assert.equal(canDeliverPersonalizedRecommendation(), false);
  });
  it("no profile is pending and never silently sufficient", () => {
    const result = reportPresentation(document, { now, profile: { ok: false, motivo: "Sem perfil avaliado." } });
    assert.equal(result.recommendation.profileStatus, "pending");
    assert.ok(result.recommendation.reasons.includes("Sem perfil avaliado."));
  });
  it("incompatible profile remains pending even if an awareness term was signed", () => {
    const result = reportPresentation(document, { now, profile: { ok: false, incompativel: true, motivo: "Perfil incompatível." } });
    assert.equal(result.recommendation.profileStatus, "incompatible");
    assert.equal(result.recommendation.status, "pending");
  });
  it("missing or invalid risk never authorizes a recommendation or consensus", () => {
    for (const riskScore of [null, NaN, 11]) {
      const result = reportPresentation({ ...document, riskScore }, { now, profile: { ok: true } });
      assert.equal(result.analysisStatus, "partial");
      assert.equal(result.consensusScore, null);
      assert.ok(result.recommendation.reasons.includes("Classificação de risco válida pendente."));
    }
  });
  it("partial/unavailable analysis never exposes technical consensus", () => {
    for (const status of ["partial", "unavailable"] as const) {
      const result = reportPresentation({ ...document, analysisQuality: { ...quality, status } }, { now });
      assert.equal(result.analysisStatus, status);
      assert.equal(result.consensusScore, null);
    }
  });
  it("refresh failure marks even a recent document outdated without changing its date or contents", () => {
    const original = structuredClone(document);
    const result = reportPresentation(document, { now, refreshFailure: "Atualização frustrada." });
    assert.equal(result.analysisStatus, "outdated");
    assert.equal(result.consensusScore, null);
    assert.match(result.analysisReason, /Atualização frustrada/);
    assert.deepEqual(document, original);
  });
  it("expired market data and expired document dates are never called updated", () => {
    const old = new Date(now - REPORT_FRESHNESS_MS - 1).toISOString();
    assert.equal(reportPresentation({ ...document, generatedAt: old }, { now }).analysisStatus, "outdated");
    assert.equal(reportPresentation({ ...document, analysisQuality: { ...quality, marketDataAt: old } }, { now }).analysisStatus, "outdated");
  });
  it("legacy documents remain preserved, unverified and without artificial public financial content", () => {
    const legacy = { ...document, analysisQuality: null, summary: "Nota consolidada 5/10: Manter." };
    const original = structuredClone(legacy);
    const view = informationalReport(legacy, reportPresentation(legacy, { now, historical: true }));
    assert.equal(view.historical, true);
    assert.equal(view.analysisStatus, "outdated");
    assert.equal(view.signal, "Recomendação pendente");
    assert.equal(view.riskScore, null);
    assert.doesNotMatch(view.summary, /5\/10|Manter/);
    assert.equal(view.generatedAt, legacy.generatedAt);
    assert.deepEqual(legacy, original);
  });
  it("missing market date or fundamentals reference prevents valid consensus", () => {
    for (const fields of [{ marketDataAt: "" }, { fundamentalsPeriod: null }]) {
      const result = reportPresentation({ ...document, analysisQuality: { ...quality, ...fields } }, { now });
      assert.equal(result.analysisStatus, "partial");
      assert.equal(result.consensusScore, null);
    }
  });
  it("high risk is explicitly carried to the public safety warning", () => {
    const result = reportPresentation({ ...document, riskScore: 9 }, { now });
    assert.equal(result.highRisk, true);
    assert.ok(result.recommendation.reasons.some((reason) => reason.includes("veto")));
  });
});