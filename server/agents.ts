import type { CvmFundamentals } from "./cvm";
import type { AnalysisQuality } from "../shared/report-quality";

/**
 * Motor multiagente — 9 agentes especializados + Moderador.
 *
 * Orquestra análises paralelas via LLM usando a API compatível com Chat Completions.
 *
 * Configuração via variáveis de ambiente:
 *   LLM_API_KEY   (opcional; quando definida, tem prioridade)
 *   OPENAI_API_KEY (usada quando LLM_API_KEY não estiver definida)
 *   LLM_API_BASE  (opcional; padrão: https://api.openai.com/v1)
 *   LLM_MODEL     (opcional; padrão: gpt-4o-mini)
 *
 * Sem nenhuma chave LLM, informa análise indisponível, sem fabricar pareceres ou notas.
 */

const DEFAULT_BASE = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";

export interface AgentResult {
  role: string;
  nome: string;
  nota: number | null; // Missing/invalid analysis must never be imputed.
  scoreAvailable: boolean;
  veredito: string;
  raciocinio: string;
}

export interface CommitteeVerdict {
  signal: string;
  summary: string;
  strengths: string[];
  risks: string[];
  outlook: string;
  riskScore: number | null;
  precoJusto?: string;
  downside?: string;
  agents: AgentResult[];
  source: string;
  analysisQuality: AnalysisQuality;
}

interface Persona {
  role: string;
  nome: string;
  prompt: (ctx: AgentContext) => string;
}

interface AgentContext {
  ticker: string;
  companyName: string;
  quote: { price: number; changePercent: number; updatedAt?: string; history?: Array<{ date: string; close: number }> };
  fundamentos: CvmFundamentals;
}

const fmtBi = (v: number) => (Math.abs(v) >= 1e9 ? `${(v / 1e9).toFixed(1)} bi` : `${(v / 1e6).toFixed(1)} mi`);

function fundamentosResumo(f: CvmFundamentals): string {
  return [
    `Receita líquida ${fmtBi(f.receitaLiquida)}`,
    `Lucro líquido ${fmtBi(f.lucroLiquido)}`,
    `EBIT ${fmtBi(f.ebit)}`,
    `Ativo total ${fmtBi(f.ativoTotal)}`,
    `Patrimônio líquido ${fmtBi(f.patrimonioLiquido)}`,
    `Período ${f.periodoReferencia}`,
    `Fonte ${f.fonte}`,
  ].join("; ");
}

const personas: Persona[] = [
  {
    role: "CFO Fundamentalista",
    nome: "Carlos",
    prompt: (c) => `Você é Carlos, CFO Fundamentalista — a voz dos números. Analise ${c.ticker} (${c.companyName}).
Fundamentos oficiais CVM: ${fundamentosResumo(c.fundamentos)}. Cotação atual R$ ${c.quote.price.toFixed(2)}.
Foque margens, qualidade do lucro, alavancagem (ativo/PL), sustentabilidade do resultado.
Dê nota 0-10 para saúde fundamentalista e liste os principais riscos operacionais.
Responda em PT-BR, estruturado, com 3-5 linhas. Termine com "Nota: X/10".`,
  },
  {
    role: "Moat & Estratégia",
    nome: "Helena",
    prompt: (c) => `Você é Helena, Moat & Estratégia — sentinela do fosso. Analise ${c.ticker} (${c.companyName}).
Avalie vantagem competitiva, barreiras de entrada, poder de precificação e resiliência do modelo de negócio.
Dê nota 0-10 para a força do moat. Responda em PT-BR, 3-5 linhas. Termine com "Nota: X/10".`,
  },
  {
    role: "Risk Officer",
    nome: "Marcos",
    prompt: (c) => `Você é Marcos, Risk Officer — capitão cautela. Analise ${c.ticker} (${c.companyName}).
Faça o caso pessimista. Liste riscos de mercado, crédito, liquidez, setoriais e macro.
Estime o downside em % e classifique o risco de 0-10 (acima de 8,5 = peso de veto).
Responda em PT-BR, 3-5 linhas. Termine com "Risco: X/10 | Downside: Y%".`,
  },
  {
    role: "Yield & Valuation",
    nome: "Fernanda",
    prompt: (c) => `Você é Fernanda, Yield & Valuation — a calculadora. Analise ${c.ticker} (${c.companyName}).
Fundamentos CVM: ${fundamentosResumo(c.fundamentos)}. Cotação R$ ${c.quote.price.toFixed(2)}.
Estime faixa de preço justo por múltiplos (P/L, P/VP) e projete o retorno potencial.
Dê nota 0-10 para a atratividade de valuation. Responda em PT-BR, 3-5 linhas. Termine com "Nota: X/10 | Justo: R$ A-B".`,
  },
  {
    role: "Grafista / Análise Técnica",
    nome: "Rodrigo",
    prompt: (c) => {
      const hist = c.quote.history || [];
      const serie = hist.slice(-30).map((h) => h.close.toFixed(2)).join(", ");
      return `Você é Rodrigo, Grafista — o chartista. Analise ${c.ticker} (${c.companyName}).
Cotação R$ ${c.quote.price.toFixed(2)}, variação ${c.quote.changePercent.toFixed(2)}%.
Últimos 30 fechamentos: ${serie || "n/d"}.
Avalie tendência, suporte/resistência e momento. Dê nota 0-10 para a oportunidade técnica de entrada.
Responda em PT-BR, 3-5 linhas. Termine com "Nota: X/10".`;
    },
  },
  {
    role: "Leitor de Releases",
    nome: "Juliana",
    prompt: (c) => `Você é Juliana, Leitora de Releases — a intérprete. Analise ${c.ticker} (${c.companyName}).
Considere o período de referência ${c.fundamentos.periodoReferencia} (balanço recebido em ${c.fundamentos.dataRecebimento}).
Interprete o resultado mais recente e o que ele sinaliza para frente. Dê nota 0-10 para a qualidade da comunicação/guidance.
Responda em PT-BR, 3-5 linhas. Termine com "Nota: X/10".`,
  },
  {
    role: "Macro/Micro",
    nome: "André",
    prompt: (c) => `Você é André, Macro/Micro — o estrategista. Analise ${c.ticker} (${c.companyName}).
Contextualize com juros (Selic), inflação, atividade e o setor da empresa.
Avalie ventos macro favoráveis/contrários. Dê nota 0-10 para o cenário macro.
Responda em PT-BR, 3-5 linhas. Termine com "Nota: X/10".`,
  },
  {
    role: "Gestão & Governança",
    nome: "Marina",
    prompt: (c) => `Você é Marina, Gestão & Governança — auditora de gestão. Analise ${c.ticker} (${c.companyName}).
Avalie alocação de capital, governança e execução (com base no resultado e na estrutura).
Dê nota 0-10 para a qualidade de gestão. Responda em PT-BR, 3-5 linhas. Termine com "Nota: X/10".`,
  },
  {
    role: "Analista Político-Jurídico",
    nome: "Otávio",
    prompt: (c) => `Você é Otávio, Analista Político-Jurídico. Analise ${c.ticker} (${c.companyName}).
Avalie risco regulatório, insegurança jurídica e interferência política no setor.
Dê nota 0-10 para o risco político-jurídico (quanto MAIOR a nota, MAIOR o risco).
Responda em PT-BR, 3-5 linhas. Termine com "Risco: X/10".`,
  },
];

async function chamarLLM(systemRole: string, prompt: string): Promise<string> {
  const apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
  const base = process.env.LLM_API_BASE || DEFAULT_BASE;
  const model = process.env.LLM_MODEL || DEFAULT_MODEL;

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemRole },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 400,
      ...(base.includes("openrouter.ai")
        ? { reasoning: { enabled: false } }
        : {}),
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new Error(`LLM_HTTP_${res.status}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content?.trim() || "";
}

export function parseNota(texto: string): number | null {
  // A single explicit score is required. Ambiguous or malformed scores are not evidence.
  const campos = Array.from(texto.matchAll(/(?:nota|risco)\s*[:：]\s*([^\n|]*)/gi));
  if (campos.length !== 1) return null;
  const valor = campos[0][1].trim().match(/^(\d+(?:[.,]\d+)?)(?:\s*\/\s*10)?$/);
  if (!valor) return null;
  const nota = Number(valor[1].replace(",", "."));
  return Number.isFinite(nota) && nota >= 0 && nota <= 10 ? nota : null;
}

function fallbackAgente(p: Persona, ctx: AgentContext): AgentResult {
  // Keep absence explicit, even when fundamentals are available.
  return {
    role: p.role,
    nome: p.nome,
    nota: null,
    scoreAvailable: false,
    veredito: "Avaliação indisponível; nenhum parecer ou nota foi emitido.",
    raciocinio: "O agente não forneceu uma avaliação válida.",
  };
}

export async function runCommittee(ctx: AgentContext): Promise<CommitteeVerdict> {
  const hasLLM = Boolean(process.env.LLM_API_KEY || process.env.OPENAI_API_KEY);

  let agents: AgentResult[];
  if (hasLLM) {
    const results = await Promise.all(
      personas.map(async (p) => {
        try {
          let texto = await chamarLLM(p.role, p.prompt(ctx));
          if (!texto) {
            texto = await chamarLLM(p.role, p.prompt(ctx));
          }
          if (!texto) throw new Error("LLM_EMPTY_RESPONSE");
          const nota = parseNota(texto);
          return {
            role: p.role,
            nome: p.nome,
            nota,
            scoreAvailable: nota !== null,
            veredito: texto,
            raciocinio: texto,
          };
        } catch (err) {
          console.error(`[agents] ${p.role}: avaliação indisponível`);
          return fallbackAgente(p, ctx);
        }
      }),
    );
    agents = results;
  } else {
    agents = personas.map((p) => fallbackAgente(p, ctx));
  }

  // Pesos por papel
  const pesos: Record<string, number> = {
    "CFO Fundamentalista": 0.2,
    "Moat & Estratégia": 0.15,
    "Risk Officer": 0.2,
    "Yield & Valuation": 0.2,
    "Grafista / Análise Técnica": 0.1,
    "Leitor de Releases": 0.05,
    "Macro/Micro": 0.05,
    "Gestão & Governança": 0.05,
    "Analista Político-Jurídico": -0.1, // nota alta AQUI é risco (subtrai)
  };

  const validAgents = agents.filter((a) => a.scoreAvailable && a.nota !== null);
  const financialDataValid = Number.isFinite(ctx.quote.price) && ctx.quote.price > 0
    && Boolean(ctx.quote.updatedAt && Number.isFinite(Date.parse(ctx.quote.updatedAt)))
    && Boolean(ctx.fundamentos.periodoReferencia && Number.isFinite(Date.parse(ctx.fundamentos.periodoReferencia)));
  const complete = validAgents.length === personas.length && financialDataValid;
  const status = complete ? "complete" : validAgents.length ? "partial" : "unavailable";
  let notaGeral = 0;
  let pesoTotal = 0;
  for (const a of agents) {
    if (!a.scoreAvailable || a.nota === null) continue;
    const w = pesos[a.role] ?? 0;
    if (a.role === "Analista Político-Jurídico" || a.role === "Risk Officer") {
      // risco político: subtrai da nota (nota alta = risco alto)
      notaGeral += (10 - a.nota) * Math.abs(w);
      pesoTotal += Math.abs(w);
    } else {
      notaGeral += a.nota * w;
      pesoTotal += w;
    }
  }
  const media = complete && pesoTotal ? notaGeral / pesoTotal : null;

  const riskAgent = agents.find((a) => a.role === "Risk Officer");
  const yieldAgent = agents.find((a) => a.role === "Yield & Valuation");
  const downside = riskAgent?.raciocinio.match(/downside\s*[:：]\s*~?\s*([\d.]+)\s*%/i)?.[1];
  // Captura faixas como "R$ 37,30 a R$ 42,00" ou "R$ 37,30 - 42,00".
  const justoMatch = yieldAgent?.raciocinio.match(/justo\s*[:：]\s*R\$\s*([\d.,]+)\s*(?:[-–a]|a\s*R\$)?\s*(?:R\$\s*)?([\d.,]+)?/i);
  const justo = justoMatch
    ? justoMatch[2]
      ? `${justoMatch[1]} - ${justoMatch[2]}`
      : justoMatch[1]
    : undefined;

  const highRisk = Boolean(riskAgent?.scoreAvailable && riskAgent.nota !== null && riskAgent.nota > 8.5);
  // A technical consensus is not a personalized recommendation or professional approval.
  const signal = "Recomendação pendente";

  const f = ctx.fundamentos;
  const margem = f.receitaLiquida ? (f.lucroLiquido / f.receitaLiquida) * 100 : 0;

  const reason = complete
    ? "Os nove agentes forneceram avaliações válidas. Informação geral; revisão profissional pendente."
    : !hasLLM
      ? "O serviço de análise por IA não está configurado; nenhum agente emitiu parecer válido."
      : validAgents.length === personas.length && !financialDataValid
        ? "Os agentes responderam, mas os dados financeiros ou suas datas não foram validados; não há consenso ou recomendação."
        : validAgents.length
        ? `${validAgents.length} de ${personas.length} agentes forneceram avaliações válidas; não há consenso ou recomendação.`
        : "Nenhum agente forneceu uma avaliação válida; o serviço pode estar indisponível ou ter retornado respostas inválidas.";
  const summary = `${reason} Fundamentos CVM (${f.periodoReferencia}): lucro ${fmtBi(f.lucroLiquido)}, receita ${fmtBi(f.receitaLiquida)} (margem ${margem.toFixed(1)}%).`;

  return {
    signal,
    summary,
    strengths: [
      `Fundamentos oficiais CVM (${f.periodoReferencia})`,
      "Dados financeiros informativos; não constituem recomendação individualizada.",
    ],
    risks: [
      riskAgent?.scoreAvailable ? `Risco avaliado: ${riskAgent.nota}/10` : "Classificação de risco indisponível.",
      highRisk ? "Risco elevado: veto de segurança; recomendação não liberada." : "Revisão profissional pendente.",
    ],
    outlook: "Informação geral. Não há recomendação personalizada aprovada; perfil compatível e revisão do consultor são necessários.",
    precoJusto: complete ? justo : undefined,
    riskScore: riskAgent?.scoreAvailable ? riskAgent.nota : null,
    downside: complete ? downside : undefined,
    agents,
    source: validAgents.length ? `CVM + IA (${status === "complete" ? "completa" : "parcial"})` : "CVM (análise de IA indisponível)",
    analysisQuality: {
      version: 1, status, reason,
      availableAgents: validAgents.length,
      expectedAgents: personas.length,
      missingAgents: agents.filter((a) => !a.scoreAvailable).map((a) => a.role),
      consensusScore: media,
      highRisk,
      marketDataAt: ctx.quote.updatedAt ?? "",
      fundamentalsPeriod: f.periodoReferencia || null,
    },
  };
}
