import {QUESTOES} from './suitability-questionnaire';
type Perfil = 'CONSERVADOR'|'MODERADO'|'AGRESSIVO';
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

export function pontuacaoMedia(respostas: Record<string, number>): number {
  return QUESTOES.reduce((total, questao) => total + respostas[questao.id] + 1, 0) / QUESTOES.length;
}

