import type { ReportAgent, ReportSourceId } from "./invest-report-example";

export const voteLabels = {
  prioritize: "Priorizar a hipótese",
  wait: "Aguardar evidências",
} as const;

export type VotePosition = keyof typeof voteLabels;
type Specialist = Exclude<ReportAgent, "rafael">;
export const investorProfiles = ["Conservador", "Moderado", "Arrojado"] as const;

type DebateArgument = {
  id: string;
  claim: string;
  specialist: Specialist;
  decision: "accepted" | "refuted";
  response: string;
  sources: readonly ReportSourceId[];
  newVote?: VotePosition;
};

type VerdictReview = {
  condition: string;
  evidence: string;
  effect: string;
};

type ProfileReading = {
  takeaway: string;
  rationale: string;
  evidence: string;
};

type ReportVoting = {
  question: string;
  verdictReason: string;
  review: readonly VerdictReview[];
  reviewSources: readonly ReportSourceId[];
  profiles: Record<(typeof investorProfiles)[number], ProfileReading>;
  firstVotes: Record<Specialist, VotePosition>;
  arguments: readonly DebateArgument[];
};

const firstVotes: ReportVoting["firstVotes"] = {
  carlos: "prioritize",
  helena: "prioritize",
  marcos: "wait",
  fernanda: "prioritize",
  rodrigo: "wait",
  juliana: "wait",
  andre: "prioritize",
  marina: "prioritize",
  otavio: "wait",
};

const exampleVoting: ReportVoting = {
  question: "Devemos priorizar a hipótese de que a melhora operacional é recorrente?",
  verdictReason: "Rafael mantém a recorrência em aberto até as notas explicativas separarem os ganhos recorrentes dos efeitos pontuais.",
  review: [
    {
      condition: "Se mais da metade do avanço vier de ganhos recorrentes",
      evidence: "Notas explicativas com a variação do resultado operacional separada entre ganhos recorrentes e itens pontuais. Conferir se o ganho recorrente se sustenta no trimestre seguinte em base comparável.",
      effect: "Rafael passaria a priorizar a hipótese de melhora recorrente se o trimestre seguinte confirmasse a leitura.",
    },
    {
      condition: "Se mais da metade do avanço vier de itens pontuais",
      evidence: "Nas notas explicativas, conferir os valores dos itens pontuais e reconciliá-los com a variação do resultado operacional no demonstrativo.",
      effect: "Rafael deixaria de tratar a recorrência como hipótese principal e revisaria a melhora após retirar esses efeitos.",
    },
  ],
  reviewSources: ["demonstrativo", "comunicado"],
  profiles: {
    Conservador: {
      takeaway: "Aguardar sinais de estabilidade",
      rationale: "A melhora de um trimestre pode ter vindo de efeitos pontuais. Para um perfil que prioriza estabilidade, também importa medir a dependência dos maiores clientes.",
      evidence: "Resultado recorrente em trimestres comparáveis e participação dos maiores clientes na receita.",
    },
    Moderado: {
      takeaway: "Acompanhar a hipótese de recorrência",
      rationale: "A melhora justifica acompanhar a empresa. O próximo resultado ajuda a avaliar se o ganho se sustenta diante do risco de concentração.",
      evidence: "Notas explicativas que separem os efeitos pontuais e confirmem a evolução do resultado recorrente.",
    },
    Arrojado: {
      takeaway: "Testar cenários de lucro",
      rationale: "A maior tolerância a oscilações permite investigar a hipótese sob cenários diferentes, inclusive um em que o ganho desaparece e a receita fica mais concentrada.",
      evidence: "Resultado ajustado por itens pontuais e sensibilidade do lucro à perda de receita dos maiores clientes.",
    },
  },
  firstVotes,
  arguments: [
    {
      id: "efeitos-pontuais",
      claim: "Efeitos pontuais podem explicar parte da melhora.",
      specialist: "helena",
      decision: "accepted",
      response: "Helena acolheu a ressalva de Juliana. O comunicado deixa em aberto o peso dos efeitos pontuais. Ela passou a aguardar essa informação.",
      sources: ["comunicado"],
      newVote: "wait",
    },
    {
      id: "registro-da-melhora",
      claim: "A melhora aparece apenas no comunicado da empresa.",
      specialist: "carlos",
      decision: "refuted",
      response: "Carlos apontou que o demonstrativo trimestral também registra o avanço. Manteve a recorrência como hipótese a investigar.",
      sources: ["demonstrativo"],
    },
  ],
};

const horizonVoting: ReportVoting = {
  question: "A redução de perdas deve ser a principal hipótese para explicar a alta da margem?",
  verdictReason: "Rafael mantém a causa em aberto até a revisão separar o efeito da redução de perdas do efeito da composição das vendas.",
  review: [
    {
      condition: "Se a redução de perdas for a maior contribuição e explicar mais da metade da alta da margem",
      evidence: "Demonstrativo com a variação da margem decomposta em pontos percentuais e dados de perdas por unidade produzida no mesmo período. Separar o efeito da produção dos efeitos de preço e da composição das vendas.",
      effect: "Rafael passaria a priorizar a redução de perdas como explicação principal da melhora.",
    },
    {
      condition: "Se a composição das vendas for a maior contribuição e explicar mais da metade da alta da margem",
      evidence: "Receita, volume e margem por linha de produto nos dois períodos, conciliados com a variação da margem total.",
      effect: "Rafael passaria a priorizar a composição das vendas como explicação principal e reavaliaria o peso da redução de perdas.",
    },
  ],
  reviewSources: ["demonstrativo", "comunicado"],
  profiles: {
    Conservador: {
      takeaway: "Aguardar sinais de estabilidade",
      rationale: "A origem da melhora da margem ainda está em aberto e a dependência de distribuidores precisa ser medida. Ambos pesam para quem prioriza estabilidade.",
      evidence: "Histórico de margem em períodos comparáveis, fatia da receita por distribuidor e condições dos contratos.",
    },
    Moderado: {
      takeaway: "Acompanhar a evolução da margem",
      rationale: "A alta da margem merece acompanhamento. Separar a contribuição da fábrica da composição das vendas ajuda a avaliar se a melhora pode durar.",
      evidence: "Variação da margem em pontos percentuais, com dados de perdas de produção e vendas por linha de produto.",
    },
    Arrojado: {
      takeaway: "Testar o impacto de cenários adversos",
      rationale: "A maior tolerância a oscilações permite explorar a hipótese de eficiência, inclusive em cenários de reversão da margem ou queda de receita de um distribuidor relevante.",
      evidence: "Sensibilidade da margem a perdas, preços e composição das vendas, além do impacto da perda de um distribuidor.",
    },
  },
  firstVotes,
  arguments: [
    {
      id: "contribuicao-da-fabrica",
      claim: "A contribuição da fábrica para a alta da margem ainda precisa ser medida.",
      specialist: "helena",
      decision: "accepted",
      response: "Helena acolheu a ressalva de Juliana. O comunicado atribui parte da melhora à fábrica sem medir quanto. Ela passou a pedir dados de produção e vendas.",
      sources: ["comunicado"],
      newVote: "wait",
    },
    {
      id: "composicao-das-vendas",
      claim: "A composição das vendas também pode explicar parte da melhora.",
      specialist: "fernanda",
      decision: "accepted",
      response: "Fernanda acolheu a observação de Carlos. O demonstrativo deixa em aberto o efeito dos produtos vendidos. Ela passou a aguardar a separação dos dois efeitos.",
      sources: ["demonstrativo"],
      newVote: "wait",
    },
    {
      id: "tendencia-de-preco",
      claim: "A amostra de cotações já confirma uma tendência de alta.",
      specialist: "rodrigo",
      decision: "refuted",
      response: "Rodrigo apontou que a série cobre poucos pregões para confirmar uma tendência. Manteve o voto por aguardar evidências.",
      sources: ["cotacoes"],
    },
  ],
};

export function reportVotingFor(ticker: string) {
  return ticker === "HORIZ3" ? horizonVoting : exampleVoting;
}
