type StudyRow = { id: string; user_id: string; request_key: string; ticker: string; created_at: Date | string };

/** Progress is a deterministic local demonstration, not background inference or market research. */
export function publicSimulation(row: StudyRow, now = Date.now()) {
  const age = Math.max(0, now - new Date(row.created_at).getTime());
  const status = age < 2000 ? "queued" : age < 8000 ? "running" : "completed";
  return {
    id: row.id, ticker: row.ticker, createdAt: new Date(row.created_at).toISOString(),
    mode: "simulation" as const, status,
    stage: status === "queued" ? "Preparando demonstração"
      : status === "running" ? "Montando o exemplo local" : "Estudo simulado concluído",
    output: status === "completed"
      ? `SIMULAÇÃO — DADOS FICTÍCIOS\nEstudo demonstrativo de ${row.ticker}.\n\n1. Organizar cotações e fundamentos seria o primeiro passo de um estudo real. Nenhum dado de mercado foi consultado aqui.\n2. Comparar riscos e cenários seria a etapa seguinte. Nenhuma avaliação de IA foi executada.\n3. Conferir fontes, datas e limites exigiria trabalho profissional. Isso não ocorreu nesta demonstração.\n\nEste exemplo usa um roteiro fixo, não mede o valor da ação e não indica compra ou venda. Não tem revisão profissional, não libera recomendação e não pode ser enviado como relatório aprovado. Tokens utilizados: 0. Créditos reais debitados: 0.`
      : null,
    tokensUsed: 0 as const, creditsDebited: 0 as const,
    professionalReview: "not_applicable" as const, recommendation: "blocked" as const,
  };
}

