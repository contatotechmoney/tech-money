/** Local, versioned demonstration. No prices, client holdings, providers or forecasting. */
export const PORTFOLIO_DEMO_VERSION = "portfolio-demo-v1";
export const PORTFOLIO_AGENTS = [
  { id: "bruno", name: "Bruno", initials: "BR", role: "Alocação e Risco-Retorno", description: "Organiza os pesos das classes no exemplo. Não estima retorno, volatilidade ou adequação real." },
  { id: "tereza", name: "Tereza", initials: "TE", role: "Risco de Carteira e concentração", description: "Examina a concentração dos valores fictícios. Não calcula risco de mercado sem séries e hipóteses suficientes." },
  { id: "paulo", name: "Paulo", initials: "PA", role: "Perfil do Investidor e Objetivos", description: "Distingue o perfil fictício da demonstração do perfil real. Não consulta dados de suitability do cliente." },
  { id: "larissa", name: "Larissa", initials: "LA", role: "Liquidez e Rebalanceamento", description: "Explica o papel do caixa no exemplo e os dados necessários para estudar liquidez e rebalanceamento." },
  { id: "sergio", name: "Sérgio", initials: "SE", role: "Tributação e Custos", description: "Aponta as informações ausentes para calcular tributos e custos. Não apresenta estimativas sem base." },
  { id: "denise", name: "Denise", initials: "DE", role: "Moderadora e Síntese", description: "Reúne as observações ilustrativas, métodos e limitações. Não aprova relatórios nem emite recomendação real." },
] as const;

export function portfolioScenario(version = PORTFOLIO_DEMO_VERSION) {
  if (version !== PORTFOLIO_DEMO_VERSION) throw new Error("UNKNOWN_PORTFOLIO_SCENARIO");
  return {
    version, name: "Carteira fictícia de demonstração",
    disclaimer: "Esta composição foi criada para a demonstração e não corresponde à sua carteira cadastrada. Nenhuma posição, perfil ou cotação real é lida ou enviada.",
    profile: "Personagem fictício: objetivo educacional de organização de reservas e horizonte ilustrativo de três anos. Não representa seu perfil.",
    assets: [
      { id: "rf-alfa", name: "Título fictício Alfa", assetClass: "Renda fixa", value: 30_000 },
      { id: "rf-beta", name: "Título fictício Beta", assetClass: "Renda fixa", value: 10_000 },
      { id: "rv-gama", name: "Ação fictícia Gama", assetClass: "Renda variável", value: 25_000 },
      { id: "rv-delta", name: "Fundo fictício Delta", assetClass: "Renda variável", value: 15_000 },
      { id: "caixa", name: "Caixa fictício", assetClass: "Caixa", value: 20_000 },
    ],
  };
}

export function portfolioMetrics(version = PORTFOLIO_DEMO_VERSION) {
  const scenario = portfolioScenario(version);
  const totalValue = scenario.assets.reduce((sum, asset) => sum + asset.value, 0);
  const byClass = Array.from(new Set(scenario.assets.map(asset => asset.assetClass))).map(assetClass => {
    const value = scenario.assets.filter(asset => asset.assetClass === assetClass).reduce((sum, asset) => sum + asset.value, 0);
    return { assetClass, value, weightPercent: value * 100 / totalValue };
  });
  const ordered = [...scenario.assets].sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
  return {
    totalValue, byClass,
    holdings: scenario.assets.map(asset => ({ ...asset, weightPercent: asset.value * 100 / totalValue })),
    largestHolding: { name: ordered[0].name, weightPercent: ordered[0].value * 100 / totalValue },
    topTwoPercent: (ordered[0].value + ordered[1].value) * 100 / totalValue,
    methodology: "Pesos nominais: valor fictício da posição ou da classe ÷ soma dos valores fictícios × 100. Concentração: maior peso individual e soma dos dois maiores pesos. Não há preços de mercado, previsão de retorno, volatilidade, correlação, VaR ou otimização.",
  };
}

export type PortfolioStudyRow = {
  id: string; user_id: string; request_key: string;
  scenario_version: string; created_at: Date | string;
};

export function presentPortfolioStudy(row: PortfolioStudyRow, now = Date.now()) {
  const scenario = portfolioScenario(row.scenario_version);
  const metrics = portfolioMetrics(row.scenario_version);
  const age = Math.max(0, now - new Date(row.created_at).getTime());
  const completedAgents = Math.min(6, Math.floor(age / 2000));
  const status = completedAgents === 6 ? "completed" : age < 1000 ? "queued" : "running";
  const percent = (value: number) => `${value.toFixed(0)}%`;
  const rf = metrics.byClass.find(group => group.assetClass === "Renda fixa")!;
  const rv = metrics.byClass.find(group => group.assetClass === "Renda variável")!;
  const cash = metrics.byClass.find(group => group.assetClass === "Caixa")!;
  const synthesis = `SIMULAÇÃO — Síntese ilustrativa da Denise. A carteira fictícia soma R$ 100.000: ${percent(rf.weightPercent)} em renda fixa, ${percent(rv.weightPercent)} em renda variável e ${percent(cash.weightPercent)} em caixa. A maior posição representa ${percent(metrics.largestHolding.weightPercent)} e as duas maiores ${percent(metrics.topTwoPercent)}. Os números são apenas proporções dos valores definidos no exemplo. Não há dados suficientes para estimar risco-retorno, tributação ou custos. Não houve consulta à carteira ou ao perfil real, pesquisa de mercado, avaliação de IA, aprovação profissional ou indicação de compra/venda. Tokens: 0. Créditos debitados: 0.`;
  const outputs = [
    `Distribuição nominal fictícia: renda fixa ${percent(rf.weightPercent)}, renda variável ${percent(rv.weightPercent)}, caixa ${percent(cash.weightPercent)}. Sem séries de retornos, não se calcula risco-retorno.`,
    `Concentração nominal: ${metrics.largestHolding.name} tem ${percent(metrics.largestHolding.weightPercent)}; duas maiores posições somam ${percent(metrics.topTwoPercent)}. Isso não equivale a risco financeiro medido.`,
    `${scenario.profile} Não se acessou o perfil do cliente; não foi feita avaliação de adequação.`,
    `O caixa do exemplo corresponde a ${percent(cash.weightPercent)}. Faltam regras de resgate, vencimentos e metas para avaliar liquidez ou propor rebalanceamento. Nenhuma ordem é gerada.`,
    "Não há datas de aquisição, alíquotas ou tarifas no cenário. Tributos e custos não foram calculados, nem estimados como se fossem reais.",
    synthesis,
  ];
  return {
    id: row.id, createdAt: new Date(row.created_at).toISOString(),
    mode: "simulation" as const, committee: "carteira" as const,
    scenarioVersion: row.scenario_version, status, completedAgents,
    scenario, metrics,
    agents: PORTFOLIO_AGENTS.map((agent, index) => ({
      ...agent,
      status: index < completedAgents ? "completed" as const : index === completedAgents ? "running" as const : "waiting" as const,
      output: index < completedAgents ? outputs[index] : null,
    })),
    synthesis: status === "completed" ? synthesis : null,
    progressMethod: "Progresso ilustrativo por tempo: uma etapa a cada 2 segundos. Não é execução de IA.",
    tokensUsed: 0 as const, creditsDebited: 0 as const,
    professionalReview: "not_applicable" as const, recommendation: "blocked" as const,
  };
}

export type PortfolioDemoStudy = ReturnType<typeof presentPortfolioStudy>;
