import { consultationOffers } from "../shared/invest-consultation-offers.ts";
import { combinedPreviewCreditCost, initialPreviewPrepaidCredits, previewCreditRates } from "../shared/invest-preview-credit-policy.ts";

export const pilotCreditsPath = "/api/migration/customer-pilot/credits";
const tickerPattern = /^[A-Z0-9]{1,12}$/;
const eventIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const recent = `SELECT event_json, recorded_at, prepaid_after, monthly_after
  FROM pilot_credit_events WHERE account_key = ? ORDER BY sequence DESC LIMIT 50`;

// Both the balance check and the resulting balance are calculated inside the insert.
// A repeat of the same event ID cannot create a second debit or grant.
const append = `INSERT INTO pilot_credit_events (account_key, event_id, event_json, prepaid_after, monthly_after)
  SELECT ?1, ?2, ?3, prepaid + ?4 - max(0, ?6 - monthly), coalesce(?5, monthly - min(monthly, ?6))
  FROM (
    SELECT coalesce(latest.prepaid_after, ?7) AS prepaid, coalesce(latest.monthly_after, 0) AS monthly
    FROM (SELECT 1) LEFT JOIN (
      SELECT prepaid_after, monthly_after FROM pilot_credit_events WHERE account_key = ?1 ORDER BY sequence DESC LIMIT 1
    ) latest ON 1
  )
  WHERE ?6 <= prepaid + monthly AND prepaid + ?4 <= 1000000
  ON CONFLICT (account_key, event_id) DO NOTHING`;

function usageDetails(usage) {
  const { kind, ticker, minutes, units } = usage ?? {};
  switch (kind) {
    case "analysis":
      if (typeof ticker === "string" && tickerPattern.test(ticker)) {
        return [{ kind, ticker }, previewCreditRates.analysis, `Análise de ${ticker}`];
      }
      break;
    case "voice":
      if (["EXEMP3", "HORIZ3"].includes(ticker) && [5, 10, 15, 30].includes(minutes)) {
        return [{ kind, minutes, ticker }, minutes * previewCreditRates.voiceMinute, `Conversa de ${minutes} min · ${ticker}`];
      }
      break;
    case "monitor":
      return [{ kind }, previewCreditRates.monitorCompanyMonth, "Acompanhamento de BBSE3 por 30 dias"];
    case "combined": {
      const cost = combinedPreviewCreditCost(units);
      if (cost) return [{ kind, units: cost.units }, cost.credits, "Uso combinado de recursos"];
      break;
    }
  }
  return null;
}

function creditEvent(input) {
  const id = input?.id;
  if (typeof id !== "string" || !eventIdPattern.test(id)) return null;
  if (input.type === "load") {
    const offer = consultationOffers.find(item => item.id === input.offerId);
    return offer ? { id, type: "load", offer } : null;
  }
  if (input.type !== "spend") return null;
  const details = usageDetails(input.usage);
  if (!details) return null;
  const [usage, credits, label] = details;
  return { id, type: "spend", usage, credits, label };
}

async function readEvent(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("Content-Type") ?? "")) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let value = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 2048) {
        await reader.cancel();
        return null;
      }
      value += decoder.decode(chunk.value, { stream: true });
    }
    return creditEvent(JSON.parse(value + decoder.decode()));
  } catch {
    return null;
  }
}

async function accountKey(issuer, subject) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([issuer, subject])));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function wallet(rows, notice = "") {
  return {
    prepaid: rows[0]?.prepaid_after ?? initialPreviewPrepaidCredits,
    monthly: rows[0]?.monthly_after ?? 0,
    entries: rows.slice().reverse().map(row => ({ ...JSON.parse(row.event_json), recordedAt: row.recorded_at })),
    notice,
  };
}

export async function pilotCredits(request, { database, origin, issuer, subject }, reply) {
  if (request.method !== "GET" && request.method !== "POST") return reply({ error: "METHOD_NOT_ALLOWED" }, 405);
  if (request.method === "POST" && request.headers.get("Origin") !== origin) {
    return reply({ error: "ORIGIN_NOT_ALLOWED" }, 403);
  }
  if (!database) return reply({ error: "CREDITS_UNAVAILABLE" }, 503);
  try {
    const account = await accountKey(issuer, subject);
    const history = database.prepare(recent).bind(account);
    if (request.method === "GET") return reply({ wallet: wallet((await history.all()).results) });

    const event = await readEvent(request);
    if (!event) return reply({ error: "INVALID_CREDIT_EVENT" }, 400);
    const encoded = JSON.stringify(event);
    const isPrepaid = event.type === "load" && event.offer.id === "avulso";
    const prepaid = isPrepaid ? event.offer.sampleCredits : 0;
    const monthly = event.type === "load" && !isPrepaid ? event.offer.sampleCredits : null;
    const spent = event.type === "spend" ? event.credits : 0;
    const receipt = database.prepare("SELECT event_json FROM pilot_credit_events WHERE account_key = ? AND event_id = ?")
      .bind(account, event.id);
    const [, recorded, saved] = await database.batch([
      database.prepare(append).bind(account, event.id, encoded, prepaid, monthly, spent, initialPreviewPrepaidCredits),
      receipt,
      history,
    ]);
    const row = recorded.results[0];
    if (!row || row.event_json !== encoded) {
      const error = row ? "CREDIT_EVENT_CONFLICT" : spent ? "INSUFFICIENT_CREDITS" : "CREDIT_BALANCE_LIMIT";
      return reply({ error, wallet: wallet(saved.results) }, 409);
    }
    const notice = spent ? `${spent} créditos usados na simulação.`
      : isPrepaid ? `${prepaid} créditos avulsos de teste adicionados.`
        : `Franquia mensal de teste atualizada para ${monthly} créditos.`;
    return reply({ wallet: wallet(saved.results, notice) });
  } catch {
    return reply({ error: "CREDITS_UNAVAILABLE" }, 503);
  }
}
