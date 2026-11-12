import { COMITE_RV } from "@shared/personas";

export type ReportAgent = (typeof COMITE_RV)[number];

export const reportSources = {
  demonstrativo: {
    title: "Demonstrativo trimestral", detail: "Período de referência", date: "30/09/2026", iso: "2026-09-30",
    excerpt: "O resultado operacional do trimestre avançou em relação ao período comparável. O resumo não separa efeitos recorrentes de itens pontuais.",
  },
  comunicado: {
    title: "Comunicado de resultados", detail: "Data do documento", date: "20/10/2026", iso: "2026-10-20",
    excerpt: "A administração menciona melhora na operação e exposição a um grupo restrito de clientes. Não informa a parcela da receita nem detalha itens não recorrentes.",
  },
  cotacoes: {
    title: "Série de cotações", detail: "Última data de referência", date: "23/10/2026", iso: "2026-10-23",
    excerpt: "A amostra fictícia contém poucos pregões. Não há histórico suficiente para avaliar tendência ou volatilidade.",
  },
} as const;
export type ReportSourceId = keyof typeof reportSources;

type SynthesisPoint = {
  title: string;
  text: string;
  sources: readonly ReportSourceId[];
};

export type ReportSynthesis = Record<"agreement" | "divergence" | "review", SynthesisPoint>;

type Opinion = {
  finding: string;
  evidence: string;
  sources: readonly ReportSourceId[];
  review: string;
  topic?: "melhora-operacional" | "concentracao";
};

export const reportOpinions: Record<ReportAgent, Opinion> = {
  carlos: {
    finding: "O resultado operacional melhorou. Eu investigaria primeiro a hipótese de um ganho recorrente.",
    evidence: "O demonstrativo compara o trimestre com o período equivalente e registra avanço no resultado operacional. Ele não separa os efeitos regulares dos pontuais.",
    sources: ["demonstrativo"], review: "Conferir as notas explicativas e separar o efeito dos itens não recorrentes.", topic: "melhora-operacional",
  },
  helena: {
    finding: "Não há evidência suficiente para avaliar a posição competitiva.",
    evidence: "O exemplo não inclui dados comparáveis de concorrentes.",
    sources: [], review: "Localizar fontes datadas sobre participação de mercado, concorrência e retenção de clientes.",
  },
  marcos: {
    finding: "A concentração de clientes é um alerta. A exposição ainda não foi medida.",
    evidence: "O comunicado cita dependência de um grupo restrito de clientes, sem informar o percentual de receita.",
    sources: ["comunicado"], review: "Confirmar nas notas explicativas a participação dos maiores clientes na receita.", topic: "concentracao",
  },
  fernanda: {
    finding: "Não há base suficiente para calcular uma faixa de valor justo.",
    evidence: "O demonstrativo mostra o resultado do período, mas não traz as projeções e premissas necessárias para uma avaliação.",
    sources: ["demonstrativo"], review: "Validar projeções, taxa de desconto e cenários antes de estimar valor justo.",
  },
  rodrigo: {
    finding: "A amostra não sustenta uma leitura de tendência.",
    evidence: "A série de exemplo cobre poucos pregões e não permite avaliar como o preço se comportou em períodos mais longos.",
    sources: ["cotacoes"], review: "Obter histórico mais longo e conferir ajustes por eventos corporativos.",
  },
  juliana: {
    finding: "A empresa comunicou melhora operacional. Eu deixaria a origem em aberto até conferir os efeitos pontuais.",
    evidence: "O comunicado registra a melhora, mas não detalha o impacto dos itens não recorrentes.",
    sources: ["comunicado"], review: "Comparar o comunicado com as notas explicativas e verificar a origem da melhora.", topic: "melhora-operacional",
  },
  andre: {
    finding: "Não foi possível separar os efeitos do setor dos efeitos próprios da empresa.",
    evidence: "Não foram incluídos indicadores do setor ou do cenário macroeconômico.",
    sources: [], review: "Reunir indicadores setoriais e macroeconômicos do mesmo período.",
  },
  marina: {
    finding: "A avaliação da governança permanece em aberto.",
    evidence: "O exemplo não contém documentos sobre estrutura de controle e partes relacionadas.",
    sources: [], review: "Conferir divulgações atualizadas de estrutura de controle e transações com partes relacionadas.",
  },
  otavio: {
    finding: "O material não permite concluir sobre exposição regulatória ou litígios.",
    evidence: "Não há documentos sobre processos ou exposição regulatória nesta amostra.",
    sources: [], review: "Consultar divulgações de contingências e atos regulatórios aplicáveis.",
  },
  rafael: {
    finding: "Há melhora operacional a investigar e um alerta de concentração ainda sem medida.",
    evidence: "O demonstrativo indica avanço operacional. O comunicado acrescenta o alerta sobre concentração, mas não quantifica a exposição.",
    sources: ["demonstrativo", "comunicado"], review: "Cruzar os dois documentos, confirmar os números nas notas e submeter a síntese à revisão profissional.",
  },
};

export type ReportSources = Record<ReportSourceId, { title: string; detail: string; date: string; iso: string; excerpt: string }>;
const horizonSources: ReportSources = {
  demonstrativo: { title: "Demonstrativo industrial", detail: "Período de referência", date: "30/09/2026", iso: "2026-09-30", excerpt: "A margem operacional aumentou após a redução de perdas na produção. O demonstrativo não discrimina o impacto da mudança no mix de produtos." },
  comunicado: { title: "Comunicado da operação industrial", detail: "Data do documento", date: "03/11/2026", iso: "2026-11-03", excerpt: "A administração atribui parte da melhora à eficiência da fábrica e menciona dependência de poucos distribuidores. A parcela da receita não foi informada." },
  cotacoes: { title: "Amostra de cotações industriais", detail: "Última data de referência", date: "05/11/2026", iso: "2026-11-05", excerpt: "A série fictícia contém poucos pregões, sem base suficiente para estabelecer tendência." },
};

export function reportExampleFor(ticker: string): {
  opinions: Record<ReportAgent, Opinion>;
  sources: ReportSources;
  summary: string;
  synthesis: ReportSynthesis;
} {
  if (ticker !== "HORIZ3") return {
    opinions: reportOpinions, sources: reportSources,
    summary: "No exemplo, o resultado operacional melhorou e surgiu um alerta sobre concentração de clientes. Ainda falta confirmar se a melhora é recorrente e medir a concentração.",
    synthesis: {
      agreement: {
        title: "O resultado operacional avançou",
        text: "Carlos e Juliana identificam melhora no trimestre. O demonstrativo registra o avanço e o comunicado da empresa confirma a direção.",
        sources: ["demonstrativo", "comunicado"],
      },
      divergence: {
        title: "A melhora pode se repetir?",
        text: "Carlos investigaria primeiro a hipótese de ganho recorrente. Juliana prefere manter a causa em aberto até separar os efeitos pontuais.",
        sources: ["demonstrativo", "comunicado"],
      },
      review: {
        title: "Confirmar recorrência e concentração",
        text: "Separar os efeitos pontuais nas notas explicativas e medir a parcela da receita dos maiores clientes, como levantou Marcos.",
        sources: ["demonstrativo", "comunicado"],
      },
    },
  };
  return {
    sources: horizonSources,
    summary: "No exemplo, a margem industrial subiu e as perdas de produção caíram. Ainda falta separar o ganho de eficiência do efeito dos produtos vendidos e medir a dependência de distribuidores.",
    synthesis: {
      agreement: {
        title: "A margem industrial melhorou",
        text: "Carlos e Juliana identificam a melhora no período. O demonstrativo registra margem maior e o comunicado aponta ganhos na operação.",
        sources: ["demonstrativo", "comunicado"],
      },
      divergence: {
        title: "Quanto da melhora veio da fábrica?",
        text: "Carlos trata a redução de perdas como a explicação mais provável. Juliana mantém em aberto qual fator pesou mais até comparar os dados de produção e vendas.",
        sources: ["demonstrativo", "comunicado"],
      },
      review: {
        title: "Medir eficiência e risco de distribuição",
        text: "Separar o efeito das perdas de produção e da composição das vendas sobre a margem. Conferir a fatia da receita dos maiores distribuidores e os contratos, como pediu Marcos.",
        sources: ["demonstrativo", "comunicado"],
      },
    },
    opinions: {
      ...reportOpinions,
      carlos: { ...reportOpinions.carlos, finding: "A margem operacional avançou. A redução de perdas é a explicação mais provável, ainda a confirmar.", evidence: "O demonstrativo registra menos perdas e margem maior, sem discriminar o efeito do mix de produtos.", review: "Separar o ganho de eficiência das mudanças no mix de produtos." },
      juliana: { ...reportOpinions.juliana, finding: "A margem avançou. O comunicado cita eficiência, mas ainda não permite identificar o fator que pesou mais.", evidence: "A administração menciona ganhos de eficiência, sem quantificar a contribuição de cada fator.", review: "Conferir a explicação com os indicadores de produção e vendas." },
      marcos: { ...reportOpinions.marcos, finding: "A dependência de poucos distribuidores é um alerta ainda não medido.", evidence: "O comunicado indica concentração na distribuição, sem informar a parcela da receita.", review: "Verificar a exposição da receita aos maiores distribuidores e as condições dos contratos." },
      rafael: { ...reportOpinions.rafael, finding: "A margem melhorou, com ganho de eficiência a confirmar e dependência de distribuidores a medir.", evidence: "O demonstrativo indica melhora da margem; o comunicado menciona eficiência na fábrica e concentração na distribuição.", review: "Separar os fatores que explicam a margem, medir a exposição aos distribuidores e submeter a síntese à revisão profissional." },
    },
  };
}
export type ReportExample = ReturnType<typeof reportExampleFor>;
