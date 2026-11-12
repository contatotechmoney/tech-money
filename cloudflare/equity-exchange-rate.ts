export const BCB_USD_SELL_RATE = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.1/dados/ultimos/1?formato=json";

export type EquityExchangeRate = {
  brlPerUsdMicros: number;
  referenceDate: string;
};

export function parseBcbExchangeRate(data: unknown, now = Date.now()): EquityExchangeRate | null {
  if (!Array.isArray(data) || data.length !== 1) return null;
  const { data: date, valor: value } = data[0] ?? {};
  if (typeof date !== "string" || typeof value !== "string" || !/^\d{1,2}(\.\d{1,6})?$/.test(value)) return null;
  const parts = date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!parts) return null;
  const [, day, month, year] = parts;
  const referenceDate = `${year}-${month}-${day}`;
  const timestamp = Date.parse(referenceDate);
  const dayMs = 86_400_000;
  const today = Math.floor(now / dayMs) * dayMs;
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== referenceDate ||
      timestamp > today || today - timestamp > 10 * dayMs) return null;
  const [whole, fraction = ""] = value.split(".");
  const brlPerUsdMicros = Number(whole) * 1_000_000 + Number(fraction.padEnd(6, "0"));
  return brlPerUsdMicros > 0 ? { brlPerUsdMicros, referenceDate } : null;
}

export async function fetchBcbExchangeRate(fetcher = fetch) {
  try {
    const response = await fetcher(BCB_USD_SELL_RATE, {
      method: "GET", headers: { Accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(3500),
    });
    return response.ok ? parseBcbExchangeRate(await response.json()) : null;
  } catch {
    return null;
  }
}
