import { createHash } from "node:crypto";
import type { PilotModel } from "./portfolio-pilot";

export const NOUS_MODEL_CATALOGUE = "https://inference-api.nousresearch.com/v1/models";
const ALLOWED_MODELS = new Set(["deepseek/deepseek-v4.1-flash", "deepseek/deepseek-v4.1-flash:US"]);
/** Nous pricing.prompt/completion are USD/token; integer micros per million = ×10^12.
 * Reject precision loss, scientific notation, negative or non-finite rates. */
export function nousRateMicros(value: unknown): number {
  if (typeof value !== "string" || !/^\d+\.\d{1,12}$/.test(value)) throw new Error("MODEL_PRICE_UNCONFIRMED");
  const [whole, fraction] = value.split(".");
  const converted = BigInt(whole) * BigInt("1000000000000") + BigInt(fraction.padEnd(12, "0"));
  if (converted > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("MODEL_PRICE_UNCONFIRMED");
  return Number(converted);
}
export function parseNousCatalogue(payload: unknown, now: number): PilotModel[] {
  const entries = (payload as { data?: unknown[] })?.data;
  if (!Array.isArray(entries)) throw new Error("MODEL_PRICE_UNCONFIRMED");
  const selected = entries.filter((entry: any) => ALLOWED_MODELS.has(entry?.id));
  return selected.map((entry: any) => {
    if (selected.filter((e: any) => e.id === entry.id).length !== 1 ||
        !entry.supported_parameters?.includes("max_tokens") || !entry.canonical_slug)
      throw new Error("MODEL_PRICE_UNCONFIRMED");
    const input = nousRateMicros(entry.pricing?.prompt), output = nousRateMicros(entry.pricing?.completion);
    return {
      key: `nous:${entry.id}`, name: `${entry.name} — ${entry.id}`,
      provider: "Nous", modelId: entry.id, source: NOUS_MODEL_CATALOGUE,
      priceVersion: createHash("sha256").update(JSON.stringify({
        id: entry.id, canonicalSlug: entry.canonical_slug, pricing: entry.pricing, currency: "USD",
      })).digest("hex"),
      inputUsdMicrosPerMillion: input, outputUsdMicrosPerMillion: output,
      verifiedAt: now, validUntil: now + 60_000,
      // Public catalogue is proven; authenticated account billing has NOT been verified.
      accountPricingVerified: false,
    };
  });
}
/** Metadata only, no key and no positions. Called only for the independently bound owner,
 * never by a worker/startup timer. A future paid adapter must verify account-effective pricing. */
export async function fetchPublicNousCatalogue(): Promise<PilotModel[]> {
  const response = await fetch(NOUS_MODEL_CATALOGUE, {
    method: "GET", redirect: "error", headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error("MODEL_PRICE_UNCONFIRMED");
  return parseNousCatalogue(await response.json(), Date.now());
}
