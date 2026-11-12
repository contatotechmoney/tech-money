import { fairValueRangeCents, valuationScenariosFor } from "./invest-report-valuation";
import { investorProfiles } from "./invest-report-votes";

export type EntryProfile = (typeof investorProfiles)[number];

const entryProfiles = {
  Conservador: {
    discount: [25, 35],
    rationale: "Maior margem de segurança para quem prioriza estabilidade diante de incertezas no lucro e na receita.",
  },
  Moderado: {
    discount: [15, 25],
    rationale: "Margem intermediária, condicionada a evidências de que parte da melhora pode se sustentar.",
  },
  Arrojado: {
    discount: [5, 15],
    rationale: "Margem menor para quem tolera mais oscilação, após testar a tese em cenários adversos.",
  },
} as const satisfies Record<EntryProfile, {
  discount: readonly [minimum: number, maximum: number];
  rationale: string;
}>;

export function entryPriceBandsFor(ticker: string) {
  const base = valuationScenariosFor(ticker).find(scenario => scenario.name === "Base");
  if (!base) return;

  const [baseFloor] = fairValueRangeCents(base);
  const bands = investorProfiles.map(profile => {
    const { discount: [minimum, maximum], rationale } = entryProfiles[profile];
    return {
      profile, minimum, maximum, rationale,
      low: Math.round(baseFloor * (100 - maximum) / 100),
      high: Math.round(baseFloor * (100 - minimum) / 100),
    };
  });
  return { baseFloor, bands };
}
