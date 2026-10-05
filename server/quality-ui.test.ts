import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { ReportQualityNotice } from "../client/src/components/report-quality-notice";
import type { ReportPresentation } from "../shared/report-quality";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import InvestmentReview from "../client/src/pages/investment-review";
import { QUESTOES } from "./suitability";

const documentDate = "2026-10-02T12:00:00Z";
const quality: ReportPresentation = {
  analysisStatus: "complete", analysisReason: "Avaliações sintéticas válidas.",
  availableAgents: 9, expectedAgents: 9, consensusScore: 7.4,
  highRisk: false, historical: false, marketDataAt: documentDate, fundamentalsPeriod: "2026-06-30",
  recommendation: {
    status: "pending", professionalReview: "pending", profileStatus: "compatible",
    reasons: ["Revisão do consultor pendente."],
  },
};
const render = (value: ReportPresentation) => renderToStaticMarkup(createElement(ReportQualityNotice, {
  quality: value, generatedAt: documentDate, source: "Fonte exclusivamente sintética",
}));
describe("quality UI rendering with synthetic data only", () => {
  for (const [status, label] of [
    ["complete", "Análise completa"], ["partial", "Análise parcial"],
    ["unavailable", "Análise indisponível"], ["outdated", "Análise desatualizada"],
  ] as const) {
    it(`shows ${status}, source and dates without implying professional approval`, () => {
      const html = render({ ...quality, analysisStatus: status, consensusScore: status === "complete" ? 7.4 : null });
      assert.ok(html.includes(label));
      assert.ok(html.includes("Data do documento:"));
      assert.ok(html.includes("Data dos dados de mercado:"));
      assert.ok(html.includes("Fonte exclusivamente sintética"));
      assert.ok(html.includes("Recomendação pendente de revisão profissional"));
      assert.ok(html.includes("isso não equivale a aprovação ou recomendação"));
      assert.ok(!html.includes("Comprar") && !html.includes("Manter"));
    });
  }
  it("partial content has explicit informative limitations and no consensus score", () => {
    const html = render({ ...quality, analysisStatus: "partial", availableAgents: 8, consensusScore: null });
    assert.ok(html.includes("Conteúdo parcial"));
    assert.ok(html.includes("não há sinal financeiro nem pontuação de consenso"));
    assert.ok(!html.includes("7.4"));
  });
  it("historical records retain dated labels and high-risk warnings", () => {
    const html = render({ ...quality, historical: true, highRisk: true, analysisStatus: "outdated", consensusScore: null });
    assert.ok(html.includes("Documento histórico"));
    assert.ok(html.includes("Risco elevado"));
    assert.ok(html.includes("2026"));
  });
  it("missing market date and profile are shown as unknown/pending", () => {
    const html = render({ ...quality, marketDataAt: null, recommendation: { ...quality.recommendation, profileStatus: "pending" } });
    assert.ok(html.includes("Não informado"));
    assert.ok(html.includes("Adequação ao perfil ainda não confirmada"));
  });
  it("approved and rejected decisions show real reviewer, date, reason and report version", () => {
    for (const decision of ["approved", "rejected"] as const) {
      const html = render({ ...quality, recommendation: { ...quality.recommendation,
        status: decision, professionalReview: decision,
        review: { id: "synthetic-review", clientId: "synthetic-client", reportId: "synthetic-report",
          reviewerId: "synthetic-consultant", reportVersion: "synthetic-version", profileVersion: "synthetic-profile-version",
          reviewedAt: documentDate, decision, reason: "Justificativa exclusivamente sintética.", recommendationText: null },
      } });
      assert.ok(html.includes(decision === "approved" ? "Recomendação aprovada por consultor" : "Recomendação rejeitada por consultor"));
      assert.ok(html.includes("synthetic-consultant"));
      assert.ok(html.includes("synthetic-version"));
      assert.ok(html.includes("Data da revisão:"));
      assert.ok(html.includes("Justificativa exclusivamente sintética."));
    }
  });
  it("consultant workspace displays meaningful profile answers, full report and version-bound decision controls", () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, queryFn: async () => { throw new Error("No network in UI test"); } } } });
    client.setQueryData(["/api/investments/review-access"], { assignments: [{ clientId: "synthetic-client" }] });
    client.setQueryData(["/api/investments/review-clients", "synthetic-client", "reports"], {
      questionnaire: QUESTOES,
      reports: [{ ...quality, id: "synthetic-report", ticker: "BBDC3", companyName: "Empresa sintética",
        summary: "Conteúdo de teste para revisão.", reportVersion: "synthetic-report-version",
        profileVersion: "synthetic-profile-version", reviews: [],
        profile: { perfil: "AGRESSIVO", respostas: Object.fromEntries(QUESTOES.map(q => [q.id, 4])),
          dataAvaliacao: documentDate, dataProximaReavaliacao: "2027-10-02T12:00:00Z" },
      }],
    });
    const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(InvestmentReview)));
    for (const text of ["Revisão profissional", "Conteúdo de teste para revisão.", "synthetic-report-version",
      "synthetic-profile-version", "Justificativa profissional", "Recomendação escrita pelo consultor",
      "Registrar aprovação", "Rejeitar", QUESTOES[0].pergunta, QUESTOES[0].opcoes[4], "Histórico de auditoria"])
      assert.ok(html.includes(text), text);
    client.clear();
  });
  it("users without assigned clients never receive review decision controls", () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    client.setQueryData(["/api/investments/review-access"], { assignments: [] });
    const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(InvestmentReview)));
    assert.ok(html.includes("Nenhuma revisão atribuída"));
    assert.ok(!html.includes("Registrar aprovação"));
    client.clear();
  });
});