export type ValuationScenario = {
  name: "Pessimista" | "Base" | "Otimista";
  projectedEarningsPerShareCents: number;
  multiples: readonly [minimum: number, maximum: number];
  assumption: string;
};

const exampleScenarios: readonly ValuationScenario[] = [
  {
    name: "Pessimista",
    projectedEarningsPerShareCents: 130,
    multiples: [6, 7],
    assumption: "Os ganhos pontuais se dissipam. A dependência de poucos clientes pesa no lucro e no múltiplo assumido.",
  },
  {
    name: "Base",
    projectedEarningsPerShareCents: 165,
    multiples: [7, 8],
    assumption: "Parte da melhora operacional se repete. A participação dos maiores clientes na receita permanece estável.",
  },
  {
    name: "Otimista",
    projectedEarningsPerShareCents: 200,
    multiples: [8, 9],
    assumption: "A melhora se confirma em períodos comparáveis e a receita fica menos concentrada.",
  },
];

const horizonScenarios: readonly ValuationScenario[] = [
  {
    name: "Pessimista",
    projectedEarningsPerShareCents: 180,
    multiples: [6, 7],
    assumption: "A composição favorável das vendas se desfaz. Menor volume vendido pressiona a margem e o lucro.",
  },
  {
    name: "Base",
    projectedEarningsPerShareCents: 230,
    multiples: [7, 8],
    assumption: "Parte do ganho de margem se sustenta e o volume permanece estável. A contribuição da redução de perdas segue em revisão.",
  },
  {
    name: "Otimista",
    projectedEarningsPerShareCents: 275,
    multiples: [8, 9],
    assumption: "A redução de perdas se confirma como principal fator de melhora e a distribuição fica menos concentrada.",
  },
];

export function valuationScenariosFor(ticker: string) {
  return ticker === "HORIZ3" ? horizonScenarios : exampleScenarios;
}

export function fairValueRangeCents({ projectedEarningsPerShareCents, multiples }: ValuationScenario) {
  const [minimum, maximum] = multiples;
  return [
    Math.round(projectedEarningsPerShareCents * minimum),
    Math.round(projectedEarningsPerShareCents * maximum),
  ] as const;
}
