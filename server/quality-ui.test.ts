import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";
import { ReportQualityNotice } from "../client/src/components/report-quality-notice";
import type { ReportPresentation } from "../shared/report-quality";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InvestmentReviewPage } from "../client/src/pages/investment-review";
import { QUESTOES } from "./suitability";
import { DeliveryRequestStatus, type ReportDeliveryRequest } from "../client/src/components/report-delivery-history";
import { translations } from "../client/src/lib/i18n";
import { AssignmentManagementPage } from "../client/src/pages/investment-assignments";

const documentDate = "2026-10-02T12:00:00Z";

describe("assignment management presentation with synthetic session-scoped caches", () => {
  const actor = "synthetic-administrator";
  const professional = {
    reviewerId: "synthetic-owner-consultant", credentialReference: "Credencial exclusivamente sintética",
    verifiedAt: documentDate, validUntil: "2027-10-02T12:00:00Z", revokedAt: null, eligible: true,
  };
  const assignment = {
    reviewerId: professional.reviewerId, clientId: "synthetic-assigned-client", grantId: "synthetic-grant",
    grantedBy: actor, reason: "Vínculo sintético com motivo obrigatório.", grantedAt: documentDate, revokedAt: null,
  };
  function renderAssignments(access: boolean, data: unknown, userId = actor, error?: Error) {
    const client = new QueryClient({ defaultOptions: { queries: {
      retry: false, staleTime: Infinity, refetchOnMount: false, retryOnMount: false,
    } } });
    client.setQueryData(["/api/investments/review-access", actor], { assignments: [], canManageAssignments: access });
    client.setQueryData(["/api/investments/assignment-management", actor], data);
    if (error) {
      client.getQueryCache().find({ queryKey: ["/api/investments/assignment-management", actor] })!.setState({
        status: "error", error, fetchStatus: "idle",
      });
    }
    return renderToStaticMarkup(createElement(QueryClientProvider, { client },
      createElement(AssignmentManagementPage, { userId })));
  }
  it("shows reason fields, qualification, revoke action and the non-restoration warning only to administrators", () => {
    const html = renderAssignments(true, { professional, assignments: [assignment] });
    for (const text of ["Atribuições de clientes", "Qualificação apta", "Motivo da atribuição",
      "Revogar vínculo", "Histórico de atribuições", "nunca restaura aprovações anteriores", assignment.clientId, professional.credentialReference]) {
      assert.ok(html.includes(text), text);
    }
    assert.ok(html.includes('minLength="10"'));
    assert.ok(html.includes('maxLength="4000"'));
    assert.ok(html.includes('pattern="[A-Za-z0-9_-]+"'));
    assert.ok(!html.includes("Confirmar revogação")); // Only after explicit interaction.
  });
  it("does not render cached private assignments to a non-administrator or another signed-in account", () => {
    const data = { professional, assignments: [assignment] };
    const denied = renderAssignments(false, data);
    assert.ok(denied.includes("Acesso não autorizado"));
    assert.ok(!denied.includes(assignment.clientId));
    const switched = renderAssignments(true, data, "synthetic-other-account");
    assert.ok(switched.includes("Verificando acesso"));
    assert.ok(!switched.includes(assignment.clientId));
    assert.ok(!switched.includes(professional.credentialReference));
  });
  it("blocks new grants when qualification is missing or expired without removing revocation", () => {
    for (const p of [null, { ...professional, eligible: false }]) {
      const html = renderAssignments(true, { professional: p, assignments: [assignment] });
      assert.match(html, /<button[^>]*disabled=""[^>]*>Conceder atribuição<\/button>/);
      assert.ok(html.includes("Revogar vínculo"));
    }
  });
  it("shows revoked and empty states, and hides stale data if the server denies a read", () => {
    const revoked = renderAssignments(true, { professional, assignments: [{ ...assignment, revokedAt: documentDate }] });
    assert.ok(revoked.includes("Revogada"));
    assert.ok(!revoked.includes("Revogar vínculo"));
    const empty = renderAssignments(true, { professional: null, assignments: [] });
    assert.ok(empty.includes("Nenhuma atribuição registrada"));
    assert.ok(empty.includes("Nenhum consultor verificado"));
    const unavailable = renderAssignments(true, { professional, assignments: [assignment] }, actor, new Error("503: unavailable"));
    assert.ok(unavailable.includes("Serviço temporariamente indisponível"));
    assert.ok(!unavailable.includes(assignment.clientId));
    const forbidden = renderAssignments(true, { professional, assignments: [assignment] }, actor, new Error("403: denied"));
    assert.ok(forbidden.includes("Acesso não autorizado"));
    assert.ok(!forbidden.includes(assignment.clientId));
  });
});
const deliveryFixture: ReportDeliveryRequest = {
  id: "synthetic-delivery", ticker: "BBDC3", channel: "email", status: "sent",
  requestedAt: documentDate, updatedAt: documentDate, sentAt: documentDate,
  deliveredAt: null, confirmationOverdueAt: documentDate, confirmationPending: true,
  errorCode: null, errorMessage: null,
};

describe("delivery confirmation history presentation", () => {
  for (const language of ["pt", "en", "es"] as const) {
    const dictionary = translations[language];
    const t = (key: string, params?: Record<string, string>) => {
      let text: string = dictionary[key as keyof typeof dictionary] ?? key;
      for (const [name, value] of Object.entries(params ?? {})) text = text.replace(`{{${name}}}`, value);
      return text;
    };
    const renderDelivery = (override: Partial<ReportDeliveryRequest>) => renderToStaticMarkup(createElement(DeliveryRequestStatus, {
      request: { ...deliveryFixture, ...override }, locale: language, t,
    }));
    it(`${language}: distinguishes provider acceptance, overdue confirmation and final outcomes`, () => {
      const overdue = renderDelivery({});
      assert.ok(overdue.includes(t("deliveryConfirmationOverdue")));
      assert.ok(overdue.includes(t("deliveryStatus_sent")));
      assert.ok(overdue.includes(t("deliveryStatusDescription_sent")));
      assert.ok(!overdue.includes("<button"));
      for (const status of ["pending", "processing", "awaiting_provider", "sent", "delivered", "failed"] as const) {
        const html = renderDelivery({ status, confirmationPending: status !== "sent" });
        assert.ok(!html.includes(t("deliveryConfirmationOverdue")), status);
        assert.ok(html.includes(t(`deliveryStatus_${status}`)));
        assert.ok(html.includes(t(`deliveryStatusDescription_${status}`).replaceAll("'", "&#x27;")));
        assert.ok(!html.includes("<button"));
      }
      for (const status of ["delivered", "failed"] as const) {
        const final = renderDelivery({ status, confirmationPending: false });
        const historyKey = status === "delivered" ? "deliveryOverdueResolvedDelivered" : "deliveryOverdueResolvedFailed";
        assert.ok(final.includes(t(historyKey).split("{{date}}")[0]));
        assert.ok(!final.includes(t("deliveryConfirmationOverdue")));
      }
      const whatsapp = renderDelivery({ channel: "whatsapp", confirmationPending: false });
      assert.ok(whatsapp.includes(t("whatsappChannel")));
      assert.ok(!whatsapp.includes("{{date}}"));
    });
  }
});
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
    const userId = "synthetic-consultant";
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, refetchOnMount: false, retryOnMount: false, queryFn: async () => { throw new Error("No network in UI test"); } } } });
    client.setQueryData(["/api/investments/review-access", userId], { assignments: [{ clientId: "synthetic-client" }] });
    client.setQueryData(["/api/investments/review-pending", userId], { total: 0, items: [] });
    client.setQueryData(["/api/investments/review-clients", userId, "synthetic-client", "reports"], {
      questionnaire: QUESTOES,
      reports: [{ ...quality, id: "synthetic-report", ticker: "BBDC3", companyName: "Empresa sintética",
        summary: "Conteúdo de teste para revisão.", reportVersion: "synthetic-report-version",
        profileVersion: "synthetic-profile-version", reviews: [],
        profile: { perfil: "AGRESSIVO", respostas: Object.fromEntries(QUESTOES.map(q => [q.id, 4])),
          dataAvaliacao: documentDate, dataProximaReavaliacao: "2027-10-02T12:00:00Z" },
      }],
    });
    const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(InvestmentReviewPage, { userId })));
    for (const text of ["Revisão profissional", "Conteúdo de teste para revisão.", "synthetic-report-version",
      "synthetic-profile-version", "Justificativa profissional", "Recomendação escrita pelo consultor",
      "Registrar aprovação", "Rejeitar", QUESTOES[0].pergunta, QUESTOES[0].opcoes[4], "Histórico de auditoria"])
      assert.ok(html.includes(text), text);
    client.clear();
  });
  it("users without assigned clients never receive review decision controls", () => {
    const userId = "synthetic-consultant";
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, refetchOnMount: false } } });
    client.setQueryData(["/api/investments/review-access", userId], { assignments: [] });
    const html = renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(InvestmentReviewPage, { userId })));
    assert.ok(html.includes("Nenhuma revisão atribuída"));
    assert.ok(!html.includes("Registrar aprovação"));
    client.clear();
  });
});

describe("pending reviews presentation with synthetic account-scoped caches", () => {
  const actor = "synthetic-consultant";
  const clientId = "synthetic-assigned-client";
  const pendingItem = {
    clientId, reportId: "synthetic-pending-report", ticker: "SYNTH1",
    companyName: "Empresa pendente sintética", generatedAt: documentDate,
    reason: "profile_changed", blockedReasons: ["Perfil sintético precisa ser atualizado."],
  };
  function renderPending(options: {
    userId?: string; items?: unknown[]; noPendingData?: boolean; noAssignments?: boolean;
    pendingError?: boolean; accessError?: boolean; reportsError?: boolean;
  } = {}) {
    const client = new QueryClient({ defaultOptions: { queries: {
      retry: false, staleTime: Infinity, refetchOnMount: false, retryOnMount: false,
      queryFn: async () => { throw new Error("No network in UI test"); },
    } } });
    client.setQueryData(["/api/investments/review-access", actor], {
      assignments: options.noAssignments ? [] : [{ clientId }],
    });
    if (!options.noPendingData)
      client.setQueryData(["/api/investments/review-pending", actor], {
        total: (options.items ?? [pendingItem]).length, items: options.items ?? [pendingItem],
      });
    client.setQueryData(["/api/investments/review-clients", actor, clientId, "reports"], {
      reports: [{ id: "synthetic-private-report", ticker: "SYNTH1",
        companyName: "Conteúdo privado sintético", reportVersion: "version",
        profileVersion: null, profile: null, reviews: [] }], questionnaire: [],
    });
    for (const [key, error] of [
      [["/api/investments/review-pending", actor], options.pendingError],
      [["/api/investments/review-access", actor], options.accessError],
      [["/api/investments/review-clients", actor, clientId, "reports"], options.reportsError],
    ] as const) {
      if (error) client.getQueryCache().find({ queryKey: key })!.setState({
        status: "error", error: new Error("503: synthetic failure"), fetchStatus: "idle",
      });
    }
    const html = renderToStaticMarkup(createElement(QueryClientProvider, { client },
      createElement(InvestmentReviewPage, { userId: options.userId ?? actor })));
    client.clear();
    return html;
  }
  it("shows reasons, independent safety blockers and a direct review action", () => {
    const html = renderPending();
    for (const text of ["Relatórios que precisam de nova análise", pendingItem.companyName, pendingItem.reportId,
      "Perfil", pendingItem.blockedReasons[0], "Analisar relatório"]) assert.ok(html.includes(text), text);
  });
  it("never displays pending information for a client outside current assignments", () => {
    const html = renderPending({ items: [pendingItem, {
      ...pendingItem, clientId: "synthetic-unassigned", companyName: "Empresa proibida sintética",
    }] });
    assert.ok(html.includes(pendingItem.companyName));
    assert.ok(!html.includes("Empresa proibida sintética"));
    assert.ok(!html.includes("synthetic-unassigned"));
  });
  it("distinguishes loading, no work and unavailability without using stale pending data", () => {
    assert.ok(renderPending({ items: [] }).includes("Nenhuma revisão pendente"));
    const loading = renderPending({ noPendingData: true });
    assert.ok(loading.includes("Carregando pendências"));
    assert.ok(!loading.includes("Nenhuma revisão pendente"));
    const failed = renderPending({ pendingError: true });
    assert.ok(failed.includes("Não foi possível"));
    assert.ok(!failed.includes(pendingItem.companyName));
    assert.ok(!failed.includes("Nenhuma revisão pendente"));
  });
  it("hides cached pending and report data after losing access or changing accounts", () => {
    for (const options of [{ noAssignments: true }, { accessError: true }, { userId: "synthetic-other-account" }]) {
      const html = renderPending(options);
      assert.ok(!html.includes(pendingItem.companyName));
      assert.ok(!html.includes("Conteúdo privado sintético"));
      assert.ok(!html.includes("Registrar aprovação"));
    }
    const deniedReports = renderPending({ reportsError: true });
    assert.ok(!deniedReports.includes("Conteúdo privado sintético"));
    assert.ok(!deniedReports.includes("Registrar aprovação"));
  });
});