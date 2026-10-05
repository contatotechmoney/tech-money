# Simulação no módulo autenticado

O painel da área de agentes oferece “Testar com saldo fictício” somente quando a API confirma a autorização da conta. Reutiliza requireAuth/Clerk do portal e as rotas de análise existentes. Não remove login nem ativa Hermes/Nous.

Ativação exclusiva em desenvolvimento: NODE_ENV=development, COMMITTEE_AUTH_SIMULATION=offline-only e COMMITTEE_SIMULATION_USERS contendo até dez IDs Clerk autorizados, separados por vírgulas. Sem esses três requisitos, a simulação fica indisponível. NODE_ENV=production sempre a bloqueia. Não usar a identidade enviada pelo navegador como autenticação. IDs da lista devem ser obtidos da sessão verificada ou do painel Clerk pelo operador; nenhuma chave de LLM é necessária.

Cada identidade autenticada seleciona uma sessão independente com saldo fictício inicial de 20 créditos. A sessão usa carteira descartável em memória e Python offline; nenhum saldo PostgreSQL real é alterado. Não há endpoint de concessão nem de reinício na interface autenticada. Reiniciar o servidor descarta os testes. Só existe cenário de sucesso nesta etapa; falhas permanecem na demonstração local de operador.

Endpoints sob /api/investments/simulation: status, diagnostics e api/investments/{analysis-options,credits,analyses,analyses/:id}. Caminhos são permitidos explicitamente. Conta ausente recebe 401; não autorizada, 403; trabalho de outra conta, 404. Corpo contendo identidade é rejeitado pelo esquema estrito. Cache do painel simulado usa namespace próprio e não substitui consultas da carteira real.

Validação: sete testes em npm run test:committee-local, incluindo dois novos para configuração e separação entre contas, com middleware de autenticação substituído por fixture no teste. O teste não valida uma sessão Clerk real. A integração de login em navegador ainda precisa ser exercitada em uma instância de desenvolvimento com Clerk configurado e conta de teste autorizada. Nenhum ambiente foi habilitado automaticamente, e a integração com LLM permanece desligada.
