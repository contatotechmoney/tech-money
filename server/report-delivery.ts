import {
  storage,
  type ClaimedReportDelivery,
  type InvestmentReport,
  type ReportDeliveryChannel,
  type ReportDeliveryStatus,
} from "./storage";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { canDeliverPersonalizedRecommendation } from "./report-policy";
import { reviewedReport } from "./professional-review";
import type { ReportPresentation } from "../shared/report-quality";

class ProviderUnavailableError extends Error {
  code = "PROVIDER_NOT_CONFIGURED";
}

class DeliveryProviderError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function processReportDeliveryRequests(options: {
  limit?: number;
  id?: string;
} = {}): Promise<void> {
  const requests = await storage.claimReportDeliveryRequests(options.limit ?? 10, options.id);
  await Promise.all(requests.map(processClaimedRequest));
}

// Missing confirmation is not proof of failure. Record an alert, never resend or fabricate a final status.
export const REPORT_DELIVERY_CONFIRMATION_TIMEOUT_MS = 24 * 60 * 60 * 1000;

export async function reconcileUnconfirmedReportDeliveries(): Promise<number> {
  const requests = await storage.flagUnconfirmedReportDeliveries(
    new Date(Date.now() - REPORT_DELIVERY_CONFIRMATION_TIMEOUT_MS),
    100,
  );
  for (const request of requests) {
    // Exclude recipient, user and report content from operational logs.
    console.warn("[report-delivery] confirmation overdue", {
      requestId: request.id,
      channel: request.channel,
      sentAt: request.sentAt,
      confirmationOverdueAt: request.confirmationOverdueAt,
    });
  }
  return requests.length;
}

export function startReportDeliveryWorker(): () => void {
  const run = () => {
    // Monitoring prior sends remains active even while new recommendations are blocked.
    reconcileUnconfirmedReportDeliveries().catch((error) => {
      console.error("[report-delivery] confirmation monitor failed", error);
    });
    processReportDeliveryRequests().catch((error) => {
      console.error("[report-delivery] worker failed", error);
    });
  };
  run();
  const timer = setInterval(run, 30_000);
  timer.unref();
  return () => clearInterval(timer);
}

export type ProviderWebhookResult = {
  recognized: boolean;
  matched: boolean;
  updatedStatus?: ReportDeliveryStatus;
};

export function isReportDeliveryChannelAvailable(channel: ReportDeliveryChannel): boolean {
  if (channel === "email") return true;
  return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

export async function processResendWebhookEvent(payload: unknown): Promise<ProviderWebhookResult> {
  if (!isRecord(payload) || typeof payload.type !== "string" || !isRecord(payload.data)) {
    return { recognized: false, matched: false };
  }

  const eventStatus = resendEventStatus(payload.type);
  const providerMessageId = typeof payload.data.email_id === "string"
    ? payload.data.email_id
    : null;
  if (!eventStatus || !providerMessageId) return { recognized: false, matched: false };

  const result = await storage.updateReportDeliveryStatusFromProvider({
    channel: "email",
    providerMessageId,
    status: eventStatus.status,
    errorCode: eventStatus.errorCode,
    errorMessage: providerErrorMessage(payload.data),
  });
  return {
    recognized: true,
    matched: result.matched,
    updatedStatus: result.status,
  };
}

export async function processWhatsAppWebhookEvent(payload: unknown): Promise<ProviderWebhookResult[]> {
  const statuses = extractWhatsAppStatuses(payload);
  if (!statuses.length) return [];

  return Promise.all(statuses.map(async (status) => {
    const eventStatus = whatsappStatus(status.status);
    if (!eventStatus) return { recognized: false, matched: false };

    const result = await storage.updateReportDeliveryStatusFromProvider({
      channel: "whatsapp",
      providerMessageId: status.id,
      status: eventStatus.status,
      errorCode: eventStatus.errorCode,
      errorMessage: status.errorMessage,
    });
    return {
      recognized: true,
      matched: result.matched,
      updatedStatus: result.status,
    };
  }));
}

async function processClaimedRequest(request: ClaimedReportDelivery): Promise<void> {
  try {
    // Reload the original owner's current document, profile, decision and authorization
    // immediately before the provider call. Queue admission alone never grants permission.
    const reports = await storage.listReports(request.userId, request.ticker);
    const report = reports.find(r => r.id === request.reportId);
    if (!report || report.id !== reports[0]?.id || report.userId !== request.userId || report.ticker !== request.ticker) {
      throw new DeliveryProviderError("RECOMMENDATION_PENDING", "Versão da recomendação não é atual.");
    }
    const view = await reviewedReport(report);
    if (!canDeliverPersonalizedRecommendation(view) || !request.professionalReviewId
      || request.professionalReviewId !== view.recommendation.review?.id)
      throw new DeliveryProviderError("RECOMMENDATION_PENDING", "Análise, perfil ou revisão profissional não autorizam o envio.");
    const providerMessageId = request.channel === "email"
      ? await sendEmail(request.id, request.contact, view)
      : await sendWhatsApp(request.contact, view);
    await storage.updateReportDeliveryRequest(request.id, {
      status: "sent",
      providerMessageId,
    });
  } catch (error) {
    const unavailable = error instanceof ProviderUnavailableError;
    const known = error instanceof DeliveryProviderError || unavailable;
    await storage.updateReportDeliveryRequest(request.id, {
      status: unavailable ? "awaiting_provider" : "failed",
      errorCode: known ? error.code : "DELIVERY_FAILED",
      errorMessage: known ? error.message : "O provedor não concluiu o envio.",
    });
    if (!unavailable) console.error(`[report-delivery] ${request.id} failed`, error);
  }
}

function resendEventStatus(type: string): {
  status: Extract<ReportDeliveryStatus, "sent" | "delivered" | "failed">;
  errorCode?: string;
} | null {
  if (type === "email.sent") return { status: "sent" };
  if (type === "email.delivered") return { status: "delivered" };
  if (type === "email.bounced") return { status: "failed", errorCode: "EMAIL_BOUNCED" };
  if (type === "email.failed") return { status: "failed", errorCode: "EMAIL_DELIVERY_FAILED" };
  if (type === "email.complained") return { status: "failed", errorCode: "EMAIL_COMPLAINT" };
  return null;
}

function whatsappStatus(status: string): {
  status: Extract<ReportDeliveryStatus, "sent" | "delivered" | "failed">;
  errorCode?: string;
} | null {
  if (status === "sent") return { status: "sent" };
  if (status === "delivered" || status === "read") return { status: "delivered" };
  if (status === "failed") return { status: "failed", errorCode: "WHATSAPP_DELIVERY_FAILED" };
  return null;
}

function extractWhatsAppStatuses(payload: unknown): Array<{
  id: string;
  status: string;
  errorMessage?: string;
}> {
  if (!isRecord(payload) || !Array.isArray(payload.entry)) return [];
  const statuses: Array<{ id: string; status: string; errorMessage?: string }> = [];
  for (const entry of payload.entry) {
    if (!isRecord(entry) || !Array.isArray(entry.changes)) continue;
    for (const change of entry.changes) {
      if (!isRecord(change) || !isRecord(change.value) || !Array.isArray(change.value.statuses)) continue;
      for (const item of change.value.statuses) {
        if (!isRecord(item) || typeof item.id !== "string" || typeof item.status !== "string") continue;
        statuses.push({
          id: item.id,
          status: item.status,
          errorMessage: whatsappErrorMessage(item),
        });
      }
    }
  }
  return statuses;
}

function providerErrorMessage(data: Record<string, unknown>): string | undefined {
  const candidates = [
    data.reason,
    data.message,
    isRecord(data.bounce) ? data.bounce.message : undefined,
    isRecord(data.error) ? data.error.message : undefined,
  ];
  const message = candidates.find((value): value is string => typeof value === "string");
  return message?.slice(0, 500);
}

function whatsappErrorMessage(status: Record<string, unknown>): string | undefined {
  if (!Array.isArray(status.errors)) return undefined;
  const error = status.errors.find(isRecord);
  if (!error) return undefined;
  const message = [error.title, error.message, error.error_data]
    .map((value) => typeof value === "string" ? value : isRecord(value) && typeof value.details === "string" ? value.details : null)
    .find((value): value is string => Boolean(value));
  return message?.slice(0, 500);
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}

async function sendEmail(requestId: string, contact: string, report: InvestmentReport): Promise<string> {
  const from = process.env.DELIVERY_EMAIL_FROM;
  if (!from) throw new ProviderUnavailableError(
    "Defina o remetente DELIVERY_EMAIL_FROM para ativar os e-mails.",
  );

  const connectors = new ReplitConnectors();
  const response = await connectors.proxy("resend", "/emails", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": requestId,
    },
    body: JSON.stringify({
      from,
      to: [contact],
      subject: `Análise Tech Money: ${report.ticker}`,
      html: renderReportHtml(report),
      text: renderReportText(report),
    }),
  });
  const body = await readProviderResponse(response);
  if (!response.ok || typeof body.id !== "string") {
    throw new DeliveryProviderError("EMAIL_PROVIDER_REJECTED", providerMessage(body, response.status));
  }
  return body.id;
}

async function sendWhatsApp(contact: string, report: InvestmentReport): Promise<string> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) throw new ProviderUnavailableError("WhatsApp Business ainda não está conectado.");

  const response = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: contact.replace(/\D/g, ""),
      type: "text",
      text: { preview_url: false, body: renderReportText(report).slice(0, 4096) },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await readProviderResponse(response);
  const id = Array.isArray(body.messages) && typeof body.messages[0]?.id === "string"
    ? body.messages[0].id
    : null;
  if (!response.ok || !id) {
    throw new DeliveryProviderError("WHATSAPP_PROVIDER_REJECTED", providerMessage(body, response.status));
  }
  return id;
}

export function renderReportText(report: InvestmentReport & Partial<ReportPresentation>): string {
  const review = report.recommendation?.review;
  return [
    `Análise Tech Money — ${report.ticker} · ${report.companyName}`,
    report.signal === "Recomendação aprovada"
      ? "Recomendação individualizada revisada por consultor autorizado. Honorários pagos pelo cliente, sem comissão de produtos."
      : "Informação geral — recomendação individualizada pendente de revisão do consultor.",
    `Documento gerado em: ${report.generatedAt}`,
    `Estado da análise: ${report.analysisStatus ?? report.analysisQuality?.status ?? "qualidade não verificada"}`,
    `Motivo: ${report.analysisReason ?? report.analysisQuality?.reason ?? "Documento anterior sem validação de qualidade."}`,
    ...(review ? [`Consultor responsável: ${review.reviewerId}`, `Revisão: ${review.reviewedAt}`,
      `Versão revisada: ${review.reportVersion}`, `Justificativa: ${review.reason}`] : []),
    `Cotação: R$ ${report.price.toFixed(2)} (${report.changePercent.toFixed(2)}%)`,
    "",
    report.summary,
    "",
    "Pontos fortes:",
    ...report.strengths.map((item) => `• ${item}`),
    "",
    "Riscos:",
    ...report.risks.map((item) => `• ${item}`),
    "",
    `Perspectiva: ${report.outlook}`,
    `Fonte: ${report.source}`,
  ].join("\n");
}

function renderReportHtml(report: InvestmentReport): string {
  const text = escapeHtml(renderReportText(report));
  return `<main style="font-family:Arial,sans-serif;max-width:680px;margin:auto;color:#172033">
    <pre style="white-space:pre-wrap;font:inherit;line-height:1.6">${text}</pre>
  </main>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]!);
}

async function readProviderResponse(response: Response): Promise<Record<string, any>> {
  try {
    return await response.json() as Record<string, any>;
  } catch {
    return {};
  }
}

function providerMessage(body: Record<string, any>, status: number): string {
  const message = body.message || body.error?.message;
  return typeof message === "string" ? message.slice(0, 500) : `Provedor respondeu com status ${status}.`;
}