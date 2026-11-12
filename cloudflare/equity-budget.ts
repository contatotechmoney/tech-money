import { equityBrlCents, equityBudget, EQUITY_MODELS } from "../shared/equity-committee-budget";
import { fetchBcbExchangeRate } from "./equity-exchange-rate";
import { fetchPublicNousCatalogue } from "../server/portfolio-pilot-models";
import { runMeteredEquityCommittee, type EquityCallEvent } from "../server/equity-committee-meter";

export async function equityBudgetPreview(url: URL) {
  const ticker = url.searchParams.get("ticker") ?? "";
  const modelId = url.searchParams.get("model") ?? "";
  if (!/^[A-Z0-9]{1,12}$/.test(ticker) || !(EQUITY_MODELS as readonly string[]).includes(modelId)) return null;
  const [catalogue, exchangeRate] = await Promise.all([fetchPublicNousCatalogue(), fetchBcbExchangeRate()]);
  const model = catalogue.find(row => row.modelId === modelId);
  if (!model) throw Error("PRICE_UNAVAILABLE");
  const tariff = {
    modelId, priceVersion: model.priceVersion, verifiedAt: model.verifiedAt, validUntil: model.validUntil,
    inputUsdMicrosPerMillion: model.inputUsdMicrosPerMillion, outputUsdMicrosPerMillion: model.outputUsdMicrosPerMillion,
    accountPricingVerified: false,
  };
  const quote = equityBudget(ticker, tariff);
  const events: EquityCallEvent[] = [];
  // The example is computed locally using fictional text. No client dossier, model request or database write.
  const estimate = (prompt: string) => Math.ceil(prompt.length / 3.6);
  await runMeteredEquityCommittee({
    mode: "simulation", owner: "fictional-example", ticker: "DEMO3", dossier: "Dados fictícios usados apenas para demonstrar o registro de consumo.",
    tariff, countPrompt: estimate,
    simulate: async call => ({
      modelId: call.modelId, priceVersion: call.priceVersion, inputTokens: estimate(call.prompt), outputTokens: call.agentId === "rafael" ? 80 : 40,
      text: "Resposta fictícia para testar a medição; nenhum parecer foi emitido.",
    }),
    append: async event => { events.push(event); },
  });
  const example = events.flatMap(event => event.status === "metered" ? [{
    agentId: event.agentId, inputTokens: event.inputTokens, outputTokens: event.outputTokens, costUsdMicros: event.costUsdMicros,
  }] : []);
  const brlReference = exchangeRate
    ? { ...exchangeRate, maxBrlCents: equityBrlCents(quote.maxUsdMicros, exchangeRate.brlPerUsdMicros) }
    : null;
  return { ...quote, brlReference, source: model.source, example, actualTokens: 0, creditsDebited: 0 };
}
