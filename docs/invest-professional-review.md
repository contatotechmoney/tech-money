# Revisão profissional do Invest

Honorários pagos pelo cliente, sem comissão de produtos.

## Quem pode revisar

Uma sessão autenticada do Clerk **não** concede acesso profissional. Não existem papéis administrativos ou profissionais na autenticação atual que possam ser presumidos.

Somente uma identidade Clerk com autorização explícita e ativa para um cliente pode consultar os relatórios e o questionário desse cliente e registrar decisões. A autorização não dá acesso à carteira, transações, credenciais ou contratos. Autoaprovação é proibida.

Um operador confiável, já autorizado a administrar o banco, deve verificar a habilitação profissional e a atribuição do cliente antes de inserir uma autorização em `investment_consultant_authorizations`. Registrar `reviewer_id`, `client_id`, `granted_by`, justificativa e data. Não há endpoint para usuários concederem acesso a si próprios. A migração não cria autorizações nem promove contas existentes. Não se deve executar esse procedimento sobre clientes reais durante desenvolvimento.

Revogar preenchendo `revoked_at`. Se houver nova concessão para o mesmo par, atualizar operador e justificativa e limpar `revoked_at`: o banco renova automaticamente `granted_at`, e decisões anteriores à nova concessão não voltam a valer. Não excluir autorizações referenciadas por histórico.

## Fluxo

- A navegação “Revisão profissional” aparece somente quando há clientes atribuídos. A autorização é conferida novamente pelo servidor em cada consulta ou decisão.
- O consultor consulta análise, fontes, risco, datas, respostas do questionário e histórico; registra aprovação ou rejeição, justificativa e, para aprovar, recomendação escrita pelo próprio consultor.
- Identidade vem da sessão, nunca do formulário. Cada decisão guarda cliente, relatório, hash do conteúdo, hash do perfil, data e motivo.
- As decisões são imutáveis; correções, rejeições posteriores e novas aprovações são novos registros. A decisão mais recente vale apenas para a versão e autorização correspondentes.
- O cliente vê a recomendação individualizada somente quando todos os controles atuais e a revisão aprovam. Perfil ou relatório alterado, revogação, data vencida ou nova tentativa de análise invalidam sua liberação.
- Perfil suficiente exige respostas completas e coerentes, pontuação/classificação consistentes, avaliação não futura, prazo vigente e risco compatível. Termo de ciência nunca substitui adequação.
- Análise completa exige nove agentes, nenhum faltante, consenso e risco válidos, cotação/variação finitas, fonte identificada e datas verificáveis. Documento e dados de mercado têm validade de seis horas; fundamentos não podem ser futuros ou ter mais de 366 dias. Esse limite é uma regra conservadora do aplicativo, não declaração de prazo regulatório.
- Risco acima de 8,5 ou veto da análise impede aprovação e entrega. Documentos históricos ou de qualidade não verificável são sempre informativos.
- A fila vincula a solicitação à decisão profissional específica. Antes do provedor, o trabalhador relê documento, perfil, decisão e autorização; filas antigas sem revisão ou com decisão substituída falham sem enviar.

## Desenvolvimento e ativação

Não houve publicação, migração do banco existente ou concessão a clientes reais. Aplicar as migrações revisadas e provisionar autorizações é uma etapa operacional posterior, com permissão explícita. Até isso ocorrer, falhas de consulta mantêm o fluxo fechado, sem liberação silenciosa.

O trabalhador automático de entregas roda somente em produção. A prévia não consulta filas nem chama provedores em segundo plano.

Execute `npm run test:quality` para testes sem banco e `npm run validate:synthetic` para validar compilação, regressões e persistência em PostgreSQL temporário. O segundo comando cria seu próprio banco em `/tmp`, sem listener TCP, remove credenciais de provedores do processo filho e elimina apenas esse banco ao terminar. Não usa o banco da aplicação. `npm run test:review-db` recusa execução fora desse ambiente isolado.