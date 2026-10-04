import { Pool } from "pg";

export type Perfil = "CONSERVADOR" | "MODERADO" | "AGRESSIVO";

export const QUESTOES = [
  {
    id: "horizonte",
    pergunta: "Por quanto tempo pretende manter este investimento?",
    opcoes: ["Até 1 ano", "1 a 3 anos", "3 a 5 anos", "5 a 10 anos", "Mais de 10 anos"],
  },
  {
    id: "tolerancia_perda",
    pergunta: "Se sua carteira caísse 20% em um mês, o que faria?",
    opcoes: ["Venderia tudo", "Venderia parte", "Manteria", "Compraria mais", "Não me preocupo"],
  },
  {
    id: "objetivo",
    pergunta: "Qual o principal objetivo?",
    opcoes: ["Preservar capital", "Renda", "Crescimento moderado", "Crescimento expressivo", "Máximo retorno"],
  },
  {
    id: "comprometimento",
    pergunta: "Quanto do patrimônio em renda variável?",
    opcoes: ["Menos de 10%", "10% a 25%", "25% a 50%", "50% a 75%", "Mais de 75%"],
  },
  {
    id: "experiencia",
    pergunta: "Seu conhecimento em mercado de capitais?",
    opcoes: ["Nenhum", "Básico", "Intermediário", "Avançado", "Profissional"],
  },
  {
    id: "renda_estabilidade",
    pergunta: "Sua renda depende deste investimento?",
    opcoes: ["Totalmente", "Em grande parte", "Parcialmente", "Pouco", "Não"],
  },
] as const;

export const NIVEL_PERFIL: Record<Perfil, number> = {
  CONSERVADOR: 1,
  MODERADO: 2,
  AGRESSIVO: 3,
};

export interface SuitabilityProfile {
  id: string;
  userId: string;
  perfil: Perfil;
  pontuacaoMedia: number;
  respostas?: Record<string, number>;
  dataAvaliacao: string;
  dataProximaReavaliacao: string;
}

export interface ConformidadeResult {
  ok: boolean;
  perfil?: Perfil;
  perfilExigido?: Perfil;
  risco?: number | null;
  reportId?: string | null;
  riscoIndisponivel?: boolean;
  incompativel?: boolean;
  termoCienciaAssinado?: boolean;
  motivo?: string;
}

const REAVALIACAO_MESES = 24;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export function respostasSaoValidas(respostas: Record<string, unknown>): respostas is Record<string, number> {
  const questionIds = new Set<string>(QUESTOES.map((questao) => questao.id));
  const keys = Object.keys(respostas);

  return keys.length === QUESTOES.length
    && keys.every((key) => questionIds.has(key))
    && QUESTOES.every((questao) => {
      const value = respostas[questao.id];
      return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 4;
    });
}

export function classificarPerfil(respostas: Record<string, number>): Perfil {
  const media = pontuacaoMedia(respostas);
  if (media < 2.5) return "CONSERVADOR";
  if (media < 3.8) return "MODERADO";
  return "AGRESSIVO";
}

export function perfilExigidoPara(risco: number): Perfil {
  if (risco <= 6) return "CONSERVADOR";
  if (risco <= 8) return "MODERADO";
  return "AGRESSIVO";
}

export async function salvarPerfil(
  userId: string,
  respostas: Record<string, number>,
): Promise<SuitabilityProfile> {
  if (!respostasSaoValidas(respostas)) {
    throw new Error("INVALID_SUITABILITY_ANSWERS");
  }

  const perfil = classificarPerfil(respostas);
  const proximaReavaliacao = new Date();
  proximaReavaliacao.setMonth(proximaReavaliacao.getMonth() + REAVALIACAO_MESES);
  const { rows } = await pool.query<SuitabilityProfileRow>(
    `INSERT INTO suitability_profiles
       (id, user_id, perfil, pontuacao_media, respostas, data_proxima_reavaliacao)
     VALUES (gen_random_uuid(), $1, $2, $3, $4::jsonb, $5)
     RETURNING id, user_id AS "userId", perfil, pontuacao_media AS "pontuacaoMedia",
       data_avaliacao AS "dataAvaliacao", data_proxima_reavaliacao AS "dataProximaReavaliacao"`,
    [userId, perfil, pontuacaoMedia(respostas), JSON.stringify(respostas), proximaReavaliacao],
  );

  return toProfile(rows[0]);
}

export async function perfilVigente(userId: string): Promise<SuitabilityProfile | null> {
  const { rows } = await pool.query<SuitabilityProfileRow>(
    `SELECT id, user_id AS "userId", perfil, respostas, pontuacao_media AS "pontuacaoMedia",
       data_avaliacao AS "dataAvaliacao", data_proxima_reavaliacao AS "dataProximaReavaliacao"
     FROM suitability_profiles
     WHERE user_id = $1
     ORDER BY data_avaliacao DESC
     LIMIT 1`,
    [userId],
  );

  return rows[0] ? toProfile(rows[0]) : null;
}

export async function assinarTermo(
  userId: string,
  ticker: string,
  reportId: string,
  risco: number,
  perfilExigido: Perfil,
  tipo: "inadequacao",
  divergencia: string,
): Promise<{ id: string }> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO suitability_terms (id, user_id, ticker, tipo, report_id, risco, perfil_exigido, divergencia)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [userId, ticker, tipo, reportId, risco, perfilExigido, divergencia],
  );
  return rows[0];
}

export async function validarConformidade(
  userId: string,
  ticker: string,
  risco: number | null,
  reportId: string | null = null,
): Promise<ConformidadeResult> {
  const perfil = await perfilVigente(userId);
  if (!perfil) {
    return { ok: false, motivo: "Sem perfil de suitability avaliado (Art. 6º, II da Resolução CVM 30)." };
  }
  if (!Object.hasOwn(NIVEL_PERFIL, perfil.perfil)
      || !Number.isFinite(perfil.pontuacaoMedia) || perfil.pontuacaoMedia < 1 || perfil.pontuacaoMedia > 5
      || !Number.isFinite(Date.parse(perfil.dataAvaliacao))
      || !Number.isFinite(Date.parse(perfil.dataProximaReavaliacao))) {
    return { ok: false, motivo: "Perfil insuficiente ou dados de avaliação inválidos; atualize o questionário." };
  }

  if (new Date(perfil.dataProximaReavaliacao) < new Date()) {
    return {
      ok: false,
      perfil: perfil.perfil,
      motivo: "Perfil desatualizado — reavaliação vencida (Art. 6º, III da Resolução CVM 30).",
    };
  }

  if (risco === null || !Number.isFinite(risco) || risco < 0 || risco > 10) {
    return {
      ok: false,
      perfil: perfil.perfil,
      risco: null,
      reportId,
      riscoIndisponivel: true,
      motivo: "A análise de risco do ativo ainda não está disponível. Gere um novo relatório antes de avaliar a adequação.",
    };
  }

  const perfilExigido = perfilExigidoPara(risco);
  if (NIVEL_PERFIL[perfil.perfil] < NIVEL_PERFIL[perfilExigido]) {
    const termoCienciaAssinado = await temTermoCiencia(
      userId,
      ticker,
      perfil.dataAvaliacao,
      risco,
      perfilExigido,
      reportId,
    );
    return {
      ok: false,
      perfil: perfil.perfil,
      perfilExigido,
      risco,
      reportId,
      incompativel: true,
      termoCienciaAssinado,
      motivo: `Ativo ${ticker} tem risco ${risco}/10 e exige perfil ${perfilExigido}; cliente é ${perfil.perfil} (Art. 6º, I da Resolução CVM 30).`,
    };
  }

  return { ok: true, perfil: perfil.perfil, perfilExigido, risco, reportId };
}

export async function closeSuitability(): Promise<void> {
  await pool.end();
}

type SuitabilityProfileRow = Omit<SuitabilityProfile, "pontuacaoMedia" | "dataAvaliacao" | "dataProximaReavaliacao"> & {
  pontuacaoMedia: string | number;
  dataAvaliacao: Date | string;
  dataProximaReavaliacao: Date | string;
};

function pontuacaoMedia(respostas: Record<string, number>): number {
  return QUESTOES.reduce((total, questao) => total + respostas[questao.id] + 1, 0) / QUESTOES.length;
}

function toProfile(row: SuitabilityProfileRow): SuitabilityProfile {
  return {
    ...row,
    pontuacaoMedia: Number(row.pontuacaoMedia),
    dataAvaliacao: new Date(row.dataAvaliacao).toISOString(),
    dataProximaReavaliacao: new Date(row.dataProximaReavaliacao).toISOString(),
  };
}

async function temTermoCiencia(
  userId: string,
  ticker: string,
  dataAvaliacao: string,
  risco: number,
  perfilExigido: Perfil,
  reportId: string | null,
): Promise<boolean> {
  if (!reportId) return false;

  const { rows } = await pool.query(
    `SELECT 1
     FROM suitability_terms
     WHERE user_id = $1
       AND ticker = $2
       AND tipo = 'inadequacao'
       AND assinado_em >= $3
       AND risco = $4
       AND perfil_exigido = $5
       AND report_id = $6
     LIMIT 1`,
    [userId, ticker, dataAvaliacao, risco, perfilExigido, reportId],
  );
  return rows.length > 0;
}