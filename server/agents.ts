/**
 * Orquestrador dos Comitês Tech Money (renda variável + renda fixa).
 *
 * Usa o construtor de personas portável (`@shared/personas`) para que CADA agente
 * receba o prompt com a formação acadêmica + experiência + lente exclusiva — não
 * um "Você é Nome, papel" genérico (medição de atribuição: 66% sem a persona).
 *
 * Provedor de LLM é AGNÓSTICO e vem de variáveis de ambiente:
 *   LLM_BASE_URL  (default: https://api.openai.com/v1)
 *   LLM_API_KEY   (ou OPENAI_API_KEY)
 *   LLM_MODEL     (default: gpt-4o-mini)
 *
 * Sem chamada de rede na importação; a função só falha se faltar a chave ao executar.
 */
import { buildAgentPrompt, listarAgentes, CVS } from "../shared/personas";

const LLM_BASE_URL = process.env.LLM_BASE_URL || "https://api.openai.com/v1";
const LLM_MODEL = process.env.LLM_MODEL || "gpt-4o-mini";

function apiKey(): string {
  return process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || "";
}

/** Moderador NÃO entra na rodada paralela — só sintetiza o veredito final. */
const MODERADOR: Record<string, string> = { rv: "rafael", rf: "henrique" };

const BATCH_SIZE = 3; // delegate/limites de concorrência: lotes de 3

export type Comite = "rv" | "rf";

export interface AgentVote {
  agente: string;
  nome: string;
  papel: string;
  voto: string;
  numero: string;
  nota: number | null;
  raciocinio: string;
  erro?: string;
}

export interface Consenso {
  n: number;
  media: number | null;
  sigma: number | null;
  concordancia: number;
  rotulo: "unânime" | "coeso" | "dividido" | "polarizado" | "amostra fraca";
  melhor: string | null;
  pior: string | null;
}

async function callLLM(prompt: string): Promise<string> {
  const key = apiKey();
  if (!key) {
    throw new Error(
      "LLM_API_KEY ausente. Defina o segredo no Replit (ou LLM_API_KEY/OPENAI_API_KEY).",
    );
  }
  const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      temperature: 0.4,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LLM ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? "";
}

/** Extrai VOTO / NÚMERO / NOTA / RACIOCÍNIO do texto do agente. */
export function parseResposta(text: string): {
  voto: string;
  numero: string;
  nota: number | null;
  raciocinio: string;
} {
  const grab = (label: string) => {
    const re = new RegExp(`${label}\\s*:\\s*(.+)`, "i");
    const m = text.match(re);
    return m ? m[1].trim() : "";
  };
  const voto = grab("VOTO");
  const numero = grab("N[ÚU]MERO");
  const raciocinio = grab("RACIOC[ÍI]NIO");
  const notaRaw = grab("NOTA");
  const notaMatch = notaRaw.replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  const nota = notaMatch ? parseFloat(notaMatch[0]) : null;
  return { voto, numero, nota, raciocinio };
}

/** Executa UM agente (1 chamada de LLM). */
export async function runAgent(
  codigo: string,
  opts: { ticker: string; dados: string; nome?: string; papel?: string },
): Promise<AgentVote> {
  const prompt = buildAgentPrompt(codigo, {
    ticker: opts.ticker,
    dados: opts.dados,
  });
  const base: AgentVote = {
    agente: codigo,
    nome: opts.nome ?? CVS[codigo]?.nome ?? codigo,
    papel: opts.papel ?? CVS[codigo]?.papel ?? "",
    voto: "",
    numero: "",
    nota: null,
    raciocinio: "",
  };
  try {
    const texto = await callLLM(prompt);
    return { ...base, ...parseResposta(texto) };
  } catch (error) {
    return { ...base, erro: (error as Error).message };
  }
}

/** Mede consenso/divergência sobre as notas (escala de atratividade). */
export function consenso(votos: AgentVote[]): Consenso {
  const notas = votos
    .map((v) => v.nota)
    .filter((n): n is number => typeof n === "number")
    .map((n) => Math.max(0, Math.min(10, n)));
  const n = notas.length;
  if (n < 3) {
    return {
      n,
      media: null,
      sigma: null,
      concordancia: 0,
      rotulo: "amostra fraca",
      melhor: null,
      pior: null,
    };
  }
  const media = notas.reduce((a, b) => a + b, 0) / n;
  const variancia = notas.reduce((a, b) => a + (b - media) ** 2, 0) / (n - 1);
  const sigma = Math.sqrt(variancia);
  const mediana = [...notas].sort((a, b) => a - b)[Math.floor(n / 2)];
  const concordancia =
    notas.filter((v) => Math.abs(v - mediana) <= 1.5).length / n;
  const rotulo: Consenso["rotulo"] =
    sigma <= 0.5
      ? "unânime"
      : sigma <= 1.5
        ? "coeso"
        : sigma <= 2.5
          ? "dividido"
          : "polarizado";
  const ordenado = [...votos]
    .filter((v) => typeof v.nota === "number")
    .sort((a, b) => (a.nota as number) - (b.nota as number));
  return {
    n,
    media: Math.round(media * 100) / 100,
    sigma: Math.round(sigma * 100) / 100,
    concordancia: Math.round(concordancia * 100) / 100,
    rotulo,
    pior: ordenado[0]?.agente ?? null,
    melhor: ordenado[ordenado.length - 1]?.agente ?? null,
  };
}

/** Roda o comitê completo em lotes de 3; o Moderador fica de fora da rodada paralela. */
export async function runAgents(opts: {
  ticker: string;
  dados: string;
  comite?: Comite;
}): Promise<{ comite: Comite; votos: AgentVote[]; consenso: Consenso }> {
  const comite: Comite = opts.comite ?? "rv";
  const moderador = MODERADOR[comite];
  const codigos = listarAgentes(comite).filter((c) => c !== moderador);

  const votos: AgentVote[] = [];
  for (let i = 0; i < codigos.length; i += BATCH_SIZE) {
    const lote = codigos.slice(i, i + BATCH_SIZE);
    const res = await Promise.all(
      lote.map((codigo) => runAgent(codigo, opts)),
    );
    votos.push(...res);
  }
  return { comite, votos, consenso: consenso(votos) };
}
