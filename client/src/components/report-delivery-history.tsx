import { REPORT_DELIVERY_MONITORING_ENABLED } from "@shared/simulation-policy";
import { DeliveryMonitoringSuspendedNotice } from "./report-delivery-simulation-notice";
import * as React from "react";
import { useAuth } from "@clerk/react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, History, RefreshCw } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";

export type DeliveryRequestStatusCode =
  | "pending"
  | "processing"
  | "awaiting_provider"
  | "sent"
  | "delivered"
  | "failed";

export type ReportDeliveryRequest = {
  id: string;
  ticker: string;
  channel: string;
  status: DeliveryRequestStatusCode;
  errorCode: string | null;
  errorMessage: string | null;
  requestedAt: string;
  updatedAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  confirmationOverdueAt: string | null;
  confirmationPending: boolean;
};

type DeliveryHistoryResponse = { requests: ReportDeliveryRequest[] };

export function ReportDeliveryHistory({ ticker }: { ticker: string }) {
  const { t, language } = useLanguage();
  const { isLoaded, userId } = useAuth();
  const query = useQuery<DeliveryHistoryResponse>({
    queryKey: ["/api/investments/report-deliveries", ticker, userId ?? "signed-out"],
    queryFn: async () => {
      const response = await apiRequest(
        "GET",
        `/api/investments/report-deliveries?ticker=${encodeURIComponent(ticker)}`,
      );
      return await response.json() as DeliveryHistoryResponse;
    },
    enabled: REPORT_DELIVERY_MONITORING_ENABLED && isLoaded && !!userId && !!ticker,
    refetchInterval: REPORT_DELIVERY_MONITORING_ENABLED ? 5_000 : false,
    refetchOnWindowFocus: REPORT_DELIVERY_MONITORING_ENABLED,
    staleTime: 0,
  });

  const locale = language === "pt" ? "pt-BR" : language === "es" ? "es-ES" : "en-US";
  const requests = query.data?.requests ?? [];
  const canRefresh = REPORT_DELIVERY_MONITORING_ENABLED && isLoaded && !!userId;

  if (!REPORT_DELIVERY_MONITORING_ENABLED) return <DeliveryMonitoringSuspendedNotice />;

  return (
    <section className="border-t pt-4" aria-labelledby="delivery-history-title">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 id="delivery-history-title" className="flex items-center gap-2 text-sm font-semibold">
          <History className="h-4 w-4 text-muted-foreground" />
          {t("deliveryHistoryTitle")}
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void query.refetch()}
          disabled={!canRefresh || query.isFetching}
          aria-label={t("deliveryHistoryRefresh")}
        >
          <RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
          <span className="sr-only">{t("deliveryHistoryRefresh")}</span>
        </Button>
      </div>

      {query.isLoading ? (
        <div className="space-y-2" role="status" aria-label={t("deliveryHistoryLoading")}>
          <div className="h-16 animate-pulse rounded-md bg-muted/50" />
          <div className="h-16 animate-pulse rounded-md bg-muted/50" />
        </div>
      ) : null}
      {!query.isLoading && query.isError && (
        <div role="alert" className="rounded-md border border-destructive/25 bg-destructive/5 p-3">
          <p className="text-sm text-destructive">{t("deliveryHistoryError")}</p>
          <Button className="mt-2" type="button" variant="outline" size="sm" onClick={() => void query.refetch()} disabled={!canRefresh || query.isFetching}>
            {t("deliveryHistoryRetry")}
          </Button>
        </div>
      )}
      {!query.isLoading && requests.length === 0 && !query.isError ? (
        <p className="rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground">
          {t("deliveryHistoryEmpty")}
        </p>
      ) : null}
      {!query.isLoading && requests.length > 0 && (
        <div className="space-y-2" aria-live="polite">
          {requests.map((request) => (
            <DeliveryRequestStatus
              key={request.id}
              request={request}
              locale={locale}
              t={t}
            />
          ))}
        </div>
      )}
      {query.isError && query.data && (
        <p className="mt-2 text-xs text-muted-foreground">{t("deliveryHistoryShowingCached")}</p>
      )}
    </section>
  );
}

type DeliveryTranslator = (key: string, params?: Record<string, string>) => string;

export function DeliveryRequestStatus({
  request,
  locale,
  t,
}: {
  request: ReportDeliveryRequest;
  locale: string;
  t: DeliveryTranslator;
}) {
  const formatDate = (value: string | null | undefined) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? null
      : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
  };
  const requestedDate = formatDate(request.requestedAt);
  const sentDate = formatDate(request.sentAt);
  const deliveredDate = formatDate(request.deliveredAt);
  const overdueDate = formatDate(request.confirmationOverdueAt);
  const activeOverdueWarning = request.status === "sent" && request.confirmationPending === true;
  const historicalOverdue = !!request.confirmationOverdueAt
    && (request.status === "delivered" || request.status === "failed");

  return (
    <article className="rounded-md border bg-background/60 px-3 py-3 transition-colors duration-200 hover:bg-muted/20">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-medium">{t(`deliveryStatus_${request.status}`)}</p>
        <span className="text-xs text-muted-foreground">{t(channelTranslationKey(request.channel))}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t(`deliveryStatusDescription_${request.status}`)}</p>
      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {requestedDate && <div className="flex gap-1"><dt>{t("deliveryRequestedAt")}</dt><dd>{requestedDate}</dd></div>}
        {sentDate && <div className="flex gap-1"><dt>{t("deliverySentAt")}</dt><dd>{sentDate}</dd></div>}
        {deliveredDate && <div className="flex gap-1"><dt>{t("deliveryDeliveredAt")}</dt><dd>{deliveredDate}</dd></div>}
      </dl>
      {activeOverdueWarning && (
        <div role="status" className="mt-3 flex gap-2 rounded-md border border-amber-300/70 bg-amber-50/70 px-3 py-2 text-xs leading-5 text-amber-950">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {t("deliveryConfirmationOverdue")}
            {overdueDate && <> {t("deliveryOverdueSince", { date: overdueDate })}</>}
          </p>
        </div>
      )}
      {historicalOverdue && (
        <p className="mt-3 rounded-md bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
          {t(
            request.status === "delivered"
              ? "deliveryOverdueResolvedDelivered"
              : "deliveryOverdueResolvedFailed",
            { date: overdueDate ?? "" },
          )}
        </p>
      )}
      {(request.errorMessage || request.errorCode) && request.status === "failed" && (
        <p className="mt-2 text-xs text-destructive">
          {request.errorMessage || request.errorCode}
        </p>
      )}
    </article>
  );
}

function channelTranslationKey(channel: string) {
  if (channel.toLowerCase() === "email") return "emailChannel";
  if (channel.toLowerCase() === "whatsapp") return "whatsappChannel";
  return "deliveryOtherChannel";
}