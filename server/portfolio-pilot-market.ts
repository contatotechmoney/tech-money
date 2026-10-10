import { createHash, verify, type KeyObject } from "node:crypto";
import type { PilotMarket } from "./portfolio-pilot";
import type { PilotPosition } from "../shared/portfolio-pilot";
import { z } from "zod";

const positive = z.number().finite().positive();
const observation = z.object({
  owner: z.string().min(1),
  positionsVersion: z.string().regex(/^[a-f0-9]{64}$/),
  sourceId: z.string().min(1), source: z.string().url().startsWith("https://"),
  observedAt: z.number().int(), validUntil: z.number().int(),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  prices: z.record(z.string(), positive),
  quoteTimes: z.record(z.string(), z.number().int()),
  histories: z.record(z.string(), z.array(z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), close: positive,
  }).strict()).max(2500)),
  benchmark: z.array(z.object({ date: z.string(), close: positive }).strict()).max(2500).optional(),
  macro: z.object({ facts: z.array(z.string().min(1)).max(20),
    source: z.string().url().startsWith("https://"), asOf: z.string() }).strict().optional(),
}).strict();
export const positionsVersion = (positions: PilotPosition[]) => createHash("sha256")
  .update(JSON.stringify([...positions].sort((a, b) => a.id.localeCompare(b.id)))).digest("hex");

/** Server-owned signed observations only. No HTTP upload endpoint or browser "verified" flag.
 * Trusted keys/sources must be independently installed; the empty default trusts nobody.
 * No quote fetching, notebook files, SQLite or silent reweighting.
 */
export function verifyPilotMarket(input: unknown, options: {
  actor: string; positions: PilotPosition[]; now: number;
  trustedSources: ReadonlyMap<string, { url: string; publicKey: KeyObject }>;
}): PilotMarket {
  const envelope = z.object({ payload: z.string().max(2_000_000), signature: z.string().max(1024) }).strict().parse(input);
  const document = observation.parse(JSON.parse(envelope.payload));
  const source = options.trustedSources.get(document.sourceId);
  if (!source || source.url !== document.source ||
      !verify(null, Buffer.from(envelope.payload), source.publicKey, Buffer.from(envelope.signature, "base64")) ||
      document.owner !== options.actor || document.positionsVersion !== positionsVersion(options.positions) ||
      options.positions.some(position => !Number.isFinite(position.quantity) || position.quantity <= 0))
    throw new Error("MARKET_DATA_UNVERIFIED");
  const now = options.now;
  if (document.observedAt > now || document.observedAt < now - 300_000 ||
      document.validUntil <= now || document.validUntil > document.observedAt + 300_000 ||
      Date.parse(document.asOf) > now || !Number.isFinite(Date.parse(document.asOf)) ||
      options.positions.some(position => {
        const timestamp = document.quoteTimes[position.ticker];
        return !document.prices[position.ticker] || !Number.isSafeInteger(timestamp) ||
          timestamp > now || timestamp < now - 72 * 3_600_000;
      })) throw new Error("MARKET_DATA_UNVERIFIED");
  // Histories may be incomplete: the engine exposes coverage instead of renormalizing.
  for (const history of [...Object.values(document.histories), ...(document.benchmark ? [document.benchmark] : [])]) {
    if (new Set(history.map(point => point.date)).size !== history.length ||
        history.some(point => !Number.isFinite(Date.parse(point.date)) || Date.parse(point.date) > now))
      throw new Error("MARKET_DATA_UNVERIFIED");
  }
  if (document.macro && (!Number.isFinite(Date.parse(document.macro.asOf)) || Date.parse(document.macro.asOf) > now))
    throw new Error("MARKET_DATA_UNVERIFIED");
  const engine = { source: document.source, asOf: document.asOf, prices: document.prices,
    histories: document.histories, benchmark: document.benchmark, macro: document.macro };
  return { verified: true, version: createHash("sha256").update(envelope.payload).digest("hex"),
    verifiedAt: document.observedAt, validUntil: document.validUntil, source: document.source,
    prices: document.prices, engine };
}
