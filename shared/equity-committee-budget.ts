import { COMITE_RV, CVS } from "./personas";

export const EQUITY_SCOPE = "equity-one-ticker-v1";
export const EQUITY_REAL_ENABLED = false;
export const EQUITY_MODELS = ["deepseek/deepseek-v4.1-flash", "deepseek/deepseek-v4.1-flash:US"] as const;
export const EQUITY_AGENT_LIMITS = COMITE_RV.map(id => ({
  id, name: CVS[id].nome, role: CVS[id].papel,
  inputTokens: id === "rafael" ? 12_000 : 7_000,
  outputTokens: id === "rafael" ? 1_000 : 400,
}));

export type EquityTariff = {
  modelId: string;
  priceVersion: string;
  inputUsdMicrosPerMillion: number;
  outputUsdMicrosPerMillion: number;
  verifiedAt: number;
  validUntil: number;
  accountPricingVerified: boolean;
};

export type EquityBrlReference = {
  referenceDate: string;
  brlPerUsdMicros: number;
  maxBrlCents: number;
};

export function equityBrlCents(usdMicros: number, brlPerUsdMicros: number) {
  const denominator = BigInt(10_000_000_000);
  return Number((BigInt(usdMicros) * BigInt(brlPerUsdMicros) + denominator - BigInt(1)) / denominator);
}

export function equityCostMicros(input: number, output: number, tariff: EquityTariff): number {
  const values = [input, output, tariff.inputUsdMicrosPerMillion, tariff.outputUsdMicrosPerMillion];
  if (values.some(x => !Number.isSafeInteger(x) || x < 0 || x > 1e12)) throw Error("INVALID_USAGE_OR_RATE");
  const rounded = (BigInt(input) * BigInt(tariff.inputUsdMicrosPerMillion) +
    BigInt(output) * BigInt(tariff.outputUsdMicrosPerMillion) + BigInt(999_999)) / BigInt(1_000_000);
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) throw Error("INVALID_COST");
  return Number(rounded);
}

export function equityBudget(ticker: string, tariff: EquityTariff, now = Date.now()) {
  if (!/^[A-Z0-9]{1,12}$/.test(ticker)) throw Error("INVALID_TICKER");
  if (!(EQUITY_MODELS as readonly string[]).includes(tariff.modelId) ||
      !/^[a-f0-9]{64}$/.test(tariff.priceVersion) ||
      !Number.isSafeInteger(tariff.verifiedAt) || !Number.isSafeInteger(tariff.validUntil) ||
      tariff.verifiedAt > now || tariff.validUntil <= now) throw Error("PRICE_UNAVAILABLE");
  const agents = EQUITY_AGENT_LIMITS.map(agent => ({
    ...agent, maxUsdMicros: equityCostMicros(agent.inputTokens, agent.outputTokens, tariff),
  }));
  const maxUsdMicros = agents.reduce((sum, agent) => sum + agent.maxUsdMicros, 0);
  return { scope: EQUITY_SCOPE, ticker, tariff, agents, maxUsdMicros, currency: "USD" as const,
    maxCalls: agents.length, retries: 0 as const, approvalAvailable: false as const,
    realAnalysisEnabled: EQUITY_REAL_ENABLED, executable: false as const };
}

export type EquityBudget = ReturnType<typeof equityBudget>;
