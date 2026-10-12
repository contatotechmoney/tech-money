import type { PilotProvider } from "./portfolio-pilot-executor";
import type { PilotModel } from "./portfolio-pilot";
import { NOUS_MODEL_CATALOGUE, parseNousCatalogue } from "./portfolio-pilot-models";

const COMPLETIONS = "https://inference-api.nousresearch.com/v1/chat/completions";
export type VerifiedTokenCounter = {
  modelId: string; methodology: string;
  count(request: { messages: { role: "user"; content: string }[] }): number;
};
type Transport = (url: string, init: RequestInit) => Promise<Response>;

export type AccountTariffProof = {
  modelId: string; priceVersion: string; source: string;
  inputUsdMicrosPerMillion: number; outputUsdMicrosPerMillion: number;
  verifiedAt: number; validUntil: number;
};
/** Trusted server evidence, not a browser flag or the mere presence of Authorization. */
export type AccountTariffVerifier = (model: Readonly<PilotModel>) => Promise<AccountTariffProof | null>;

/** Explicit Nous credential only; never falls back to OpenAI/Hermes credentials.
 * Credentials stay in the server closure. No retries, streaming, redirects or logs.
 * An authenticated catalogue alone is NOT proof of account-effective billing.
 */
export function createNousPilotAdapter(options: {
  credential: () => string | undefined;
  tokenCounter?: VerifiedTokenCounter;
  accountTariffVerifier?: AccountTariffVerifier;
  armed: boolean;
  now?: () => number;
  transport?: Transport;
}) {
  const now = options.now ?? Date.now;
  const transport = options.transport ?? fetch;
  let models: PilotModel[] = [];
  let catalogueCredential: string | undefined;
  async function catalogue(signal?: AbortSignal): Promise<PilotModel[]> {
    // Never retain verified prices after a failed refresh.
    models = [];
    catalogueCredential = undefined;
    const credential = options.credential();
    if (!credential?.trim()) throw new Error("NOUS_CREDENTIAL_UNAVAILABLE");
    const response = await transport(NOUS_MODEL_CATALOGUE, {
      method: "GET", redirect: "error",
      headers: { Accept: "application/json", Authorization: `Bearer ${credential}` },
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(5_000)]) : AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error("ACCOUNT_TARIFF_UNVERIFIED");
    const observed = parseNousCatalogue(await response.json(), now());
    const verified: PilotModel[] = [];
    for (const model of observed) {
      const proof = await options.accountTariffVerifier?.(Object.freeze({ ...model }));
      let valid = false;
      if (proof) {
        let secureSource = false;
        try {
          const url = new URL(proof.source);
          secureSource = url.protocol === "https:" && !url.username && !url.password;
        } catch { /* unavailable evidence stays closed */ }
        valid = secureSource && proof.modelId === model.modelId && proof.priceVersion === model.priceVersion &&
          proof.inputUsdMicrosPerMillion === model.inputUsdMicrosPerMillion &&
          proof.outputUsdMicrosPerMillion === model.outputUsdMicrosPerMillion &&
          Number.isFinite(proof.verifiedAt) && proof.verifiedAt <= now() &&
          Number.isFinite(proof.validUntil) && proof.validUntil > now() && proof.verifiedAt <= proof.validUntil;
      }
      verified.push({ ...model, accountPricingVerified: valid,
        ...(valid && proof ? { validUntil: Math.min(model.validUntil, proof.validUntil),
          accountPricingSource: proof.source } : {}) });
    }
    models = verified;
    if (!models.length) throw new Error("ACCOUNT_TARIFF_UNVERIFIED");
    catalogueCredential = credential;
    return models;
  }
  const provider: PilotProvider = {
    async complete(input) {
      // This guard runs before even metadata I/O. Preparing an adapter never arms it.
      if (!options.armed) throw new Error("REAL_EXECUTION_DISABLED");
      if (!options.tokenCounter || options.tokenCounter.modelId !== input.modelId ||
          !options.tokenCounter.methodology.trim())
        throw new Error("TOKENIZER_UNVERIFIED");
      const messages = [{ role: "user" as const, content: input.prompt }];
      const counted = options.tokenCounter.count({ messages });
      if (!Number.isSafeInteger(counted) || counted <= 0 || counted > input.maxInputTokens ||
          !Number.isSafeInteger(input.maxOutputTokens) || input.maxOutputTokens <= 0)
        throw new Error("TOKEN_LIMIT_EXCEEDED");
      const current = (await catalogue(input.signal)).find(model => model.modelId === input.modelId);
      if (!current || current.priceVersion !== input.priceVersion) throw new Error("APPROVAL_INVALIDATED");
      if (current.accountPricingVerified !== true) throw new Error("ACCOUNT_TARIFF_UNVERIFIED");
      const credential = options.credential();
      if (!credential || credential !== catalogueCredential) throw new Error("ACCOUNT_TARIFF_UNVERIFIED");
      input.signal.throwIfAborted();
      const response = await transport(COMPLETIONS, {
        method: "POST", redirect: "error",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${credential}` },
        signal: input.signal,
        body: JSON.stringify({ model: input.modelId, messages, stream: false, max_tokens: input.maxOutputTokens }),
      });
      // Any dispatch error/unknown receipt is deliberately treated as uncertain by the executor.
      if (!response.ok) throw new Error("PROVIDER_RECEIPT_UNCONFIRMED");
      const body = await response.json();
      const inputTokens = body.usage?.prompt_tokens, outputTokens = body.usage?.completion_tokens;
      if (body.model !== input.modelId ||
          ![inputTokens, outputTokens].every(n => Number.isSafeInteger(n) && n >= 0) ||
          inputTokens > input.maxInputTokens || outputTokens > input.maxOutputTokens ||
          body.usage?.total_tokens !== inputTokens + outputTokens)
        throw new Error("PROVIDER_RECEIPT_UNCONFIRMED");
      // Preserve authoritative usage even for malformed/truncated content.
      // The executor records this receipt before rejecting the structured result.
      let result: unknown = null;
      if (body.choices?.length === 1 && body.choices[0].finish_reason === "stop") {
        try { result = JSON.parse(body.choices[0].message.content); } catch { /* invalid output, known usage */ }
      }
      return { modelId: input.modelId, priceVersion: current.priceVersion, inputTokens, outputTokens, result };
    },
  };
  return { catalogue, models: () => models, provider };
}
