/** Explicit, supplied data only. No network, notebook files, SQLite or hidden benchmarks. */
export type EnginePosition = {
  ticker: string; quantity: number; assetClass?: string;
  settlementDays?: number; sector?: string;
};
export type PricePoint = { date: string; close: number };
export type EngineMarket = {
  source: string; asOf: string; prices: Record<string, number>;
  histories: Record<string, PricePoint[]>; benchmark?: PricePoint[];
  macro?: { source: string; asOf: string; facts: string[] };
};
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const covariance = (a: number[], b: number[]) =>
  a.reduce((sum, v, i) => sum + (v - mean(a)) * (b[i] - mean(b)), 0) / (a.length - 1);
const quantile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  return sorted[Math.floor(index)] + (sorted[Math.ceil(index)] - sorted[Math.floor(index)]) * (index % 1);
};
const dated = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d));
export function portfolioDossier(positions: EnginePosition[], market: EngineMarket) {
  if (!positions.length || new Set(positions.map(p => p.ticker)).size !== positions.length ||
      positions.some(p => !Number.isFinite(p.quantity) || p.quantity <= 0))
    throw new Error("QUANTITY_REQUIRED");
  if (!market.source || !dated(market.asOf) ||
      positions.some(p => !Number.isFinite(market.prices[p.ticker]) || market.prices[p.ticker] <= 0))
    throw new Error("MARKET_DATA_UNVERIFIED");
  const total = positions.reduce((sum, p) => sum + p.quantity * market.prices[p.ticker], 0);
  if (!Number.isFinite(total) || total <= 0) throw new Error("MARKET_DATA_UNVERIFIED");
  const weights = Object.fromEntries(positions.map(p => [p.ticker, p.quantity * market.prices[p.ticker] / total]));
  const classes: Record<string, number> = {}, liquidity: Record<string, number> = {};
  for (const p of positions) {
    const cls = p.assetClass?.trim() || "Não classificado";
    classes[cls] = (classes[cls] ?? 0) + weights[p.ticker];
    const settlement = Number.isSafeInteger(p.settlementDays) && p.settlementDays! >= 0
      ? `D+${p.settlementDays}` : "Não informado";
    liquidity[settlement] = (liquidity[settlement] ?? 0) + weights[p.ticker];
  }
  const valid = (h: PricePoint[] | undefined) => !!h && h.length >= 61 &&
    h.every((p, i) => dated(p.date) && p.date <= market.asOf && Number.isFinite(p.close) &&
      p.close > 0 && (!i || p.date > h[i - 1].date));
  const covered = positions.filter(p => valid(market.histories[p.ticker])).map(p => p.ticker);
  const missing = positions.filter(p => !covered.includes(p.ticker)).map(p => p.ticker);
  const coverage = covered.reduce((sum, t) => sum + weights[t], 0);
  const maps = covered.map(t => new Map(market.histories[t].map(p => [p.date, p.close])));
  const dates = maps.length ? Array.from(maps[0].keys()).filter(d => maps.every(m => m.has(d))).sort() : [];
  const complete = !missing.length && dates.length >= 61;
  let risk: null | {
    observations: number; annualVolatility: number; maxDrawdown: number;
    historicalVaR95Daily: number; historicalVaR95Monthly: number | null;
    correlations: Record<string, Record<string, number | null>>; beta: number | null;
  } = null;
  if (complete) {
    const returns = covered.map((t, i) => dates.slice(1).map((d, j) => maps[i].get(d)! / maps[i].get(dates[j])! - 1));
    // Use original full-portfolio weights; never normalize a partially covered basket.
    const portfolio = dates.slice(1).map((_, j) => covered.reduce((s, t, i) => s + weights[t] * returns[i][j], 0));
    let curve = 1, peak = 1, drawdown = 0;
    for (const r of portfolio) { curve *= 1 + r; peak = Math.max(peak, curve); drawdown = Math.min(drawdown, curve / peak - 1); }
    const correlations: Record<string, Record<string, number | null>> = {};
    covered.forEach((a, i) => {
      correlations[a] = {};
      covered.forEach((b, j) => {
        const denominator = Math.sqrt(covariance(returns[i], returns[i]) * covariance(returns[j], returns[j]));
        correlations[a][b] = denominator > 0 ? covariance(returns[i], returns[j]) / denominator : null;
      });
    });
    const monthly = portfolio.slice(20).map((_, i) => portfolio.slice(i, i + 21).reduce((v, r) => v * (1 + r), 1) - 1);
    let beta: number | null = null;
    if (valid(market.benchmark)) {
      const benchmark = new Map(market.benchmark!.map(p => [p.date, p.close]));
      const paired = dates.slice(1).flatMap((d, i) => benchmark.has(d) && benchmark.has(dates[i])
        ? [{ p: portfolio[i], b: benchmark.get(d)! / benchmark.get(dates[i])! - 1 }] : []);
      const b = paired.map(x => x.b), p = paired.map(x => x.p);
      if (paired.length >= 60 && covariance(b, b) > 0) beta = covariance(p, b) / covariance(b, b);
    }
    risk = { observations: portfolio.length, annualVolatility: Math.sqrt(covariance(portfolio, portfolio) * 252),
      maxDrawdown: drawdown, historicalVaR95Daily: quantile(portfolio, .05),
      historicalVaR95Monthly: monthly.length >= 60 ? quantile(monthly, .05) : null, correlations, beta };
  }
  const macro = market.macro?.source && dated(market.macro.asOf) && market.macro.asOf <= market.asOf
    ? market.macro : null;
  return {
    source: market.source, asOf: market.asOf, totalValue: total, weights, classes, liquidity,
    scope: "Somente posições selecionadas e aprovadas; não representa automaticamente toda a carteira cadastrada.",
    concentrationHHI: Object.values(weights).reduce((s, w) => s + w * w, 0),
    top3Weight: Object.values(weights).sort((a, b) => b - a).slice(0, 3).reduce((s, w) => s + w, 0),
    historyCoverage: { weight: coverage, covered, missing, commonObservations: Math.max(0, dates.length - 1) },
    risk, macro, scenarios: [],
    limitations: [
      ...(!complete ? ["Dados insuficientes para risco da carteira completa; ativos ausentes não foram redistribuídos."] : []),
      ...(risk?.beta == null ? ["Beta indisponível sem benchmark fornecido, alinhado e suficiente."] : []),
      ...(!macro ? ["Contexto macro não fornecido com data e fonte verificáveis; nenhuma taxa ou cenário atual presumido."] : []),
      ...(classes["Não classificado"] ? ["Composição contém classe não informada; não se presume 100% renda variável."] : []),
    ],
    methodology: "Valores = quantidade × preço fornecido. Pesos do conjunto integral. Risco só com cobertura integral e ≥60 retornos comuns, sem preenchimento de lacunas. Volatilidade amostral × √252; drawdown composto; quantil histórico interpolado de 5%; janela mensal composta de 21 observações e ≥60 janelas. Beta por covariância/variância de benchmark explícito. D+0 separado de D+1.",
    professionalReviewRequired: true as const, recommendationApproved: false as const,
  };
}
