import type { KeyObject } from "node:crypto";
import { PortfolioPilot, type PilotDependencies, type PilotMarket } from "./portfolio-pilot";
import { createNousPilotAdapter, type VerifiedTokenCounter } from "./portfolio-pilot-nous";
import { createPilotExecutor } from "./portfolio-pilot-executor";
import { verifyPilotMarket } from "./portfolio-pilot-market";

/** Only trusted server dependencies. No request values configure provider, sources,
 * counters or arming. Defaults deliberately cannot execute or read customer positions.
 */
export async function preparePrivatePilot(options: Pick<PilotDependencies, "ownerId" | "positions" | "ledger"> & {
  credential: () => string | undefined; armed: boolean;
  tokenCounter?: VerifiedTokenCounter;
  marketObservation?: (owner: string) => Promise<unknown>;
  trustedSources?: ReadonlyMap<string, { url: string; publicKey: KeyObject }>;
  now?: () => number;
  transport?: (url: string, init: RequestInit) => Promise<Response>;
}) {
  const now = options.now ?? Date.now;
  const adapter = createNousPilotAdapter(options);
  const sources = options.trustedSources ?? new Map();
  const credentialAvailable = !!options.credential()?.trim();
  if (options.ownerId && credentialAvailable) await adapter.catalogue();
  let market: PilotMarket | null = null;
  const ready = !!options.ownerId && credentialAvailable && !!options.tokenCounter &&
    !!options.marketObservation && sources.size > 0;
  return new PortfolioPilot({
    ownerId: options.ownerId, positions: options.positions, ledger: options.ledger, now,
    models: adapter.models, market: () => market, requireModelSelection: true,
    executorReady: ready,
    extraBlockers: [
      ...(!credentialAvailable ? ["NOUS_CREDENTIAL_UNAVAILABLE"] : []),
      ...(!options.tokenCounter ? ["TOKENIZER_UNVERIFIED"] : []),
      ...(!options.marketObservation || !sources.size ? ["MARKET_SOURCE_NOT_CONNECTED"] : []),
    ],
    beforeAdmission: async actor => {
      if (!options.ownerId || actor !== options.ownerId) throw new Error("PILOT_CLOSED");
      await adapter.catalogue();
      if (options.marketObservation && sources.size) {
        const positions = await options.positions(actor);
        market = verifyPilotMarket(await options.marketObservation(actor),
          { actor, positions, now: now(), trustedSources: sources });
      }
    },
    // Merely implementing a real transport never arms it.
    execute: ready && options.armed ? createPilotExecutor(adapter.provider) : undefined,
  });
}
