# Simulação no módulo autenticado

O painel da área de agentes oferece “Testar com saldo fictício” somente quando a API confirma a autorização da conta. Reutiliza requireAuth/Clerk do portal e as rotas de análise existentes. Não remove login nem ativa Hermes/Nous.

Ativação exclusiva em desenvolvimento: NODE_ENV=development, COMMITTEE_AUTH_SIMULATION=offline-only e COMMITTEE_SIMULATION_USERS contendo até dez IDs Clerk autorizados, separados por vírgulas. Sem esses três requisitos, a simulação fica indisponível. NODE_ENV=production sempre a bloqueia. Não usar a identidade enviada pelo navegador como autenticação. IDs da lista devem ser obtidos da sessão verificada ou do painel Clerk pelo operador; nenhuma chave de LLM é necessária.

Cada identidade autenticada seleciona uma sessão independente com saldo fictício inicial de 20 créditos. A sessão usa carteira descartável em memória e Python offline; nenhum saldo PostgreSQL real é alterado. Não há endpoint de concessão nem de reinício na interface autenticada. Reiniciar o servidor descarta os testes. Só existe cenário de sucesso nesta etapa; falhas permanecem na demonstração local de operador.

Endpoints sob /api/investments/simulation: status, diagnostics e api/investments/{analysis-options,credits,analyses,analyses/:id}. Caminhos são permitidos explicitamente. Conta ausente recebe 401; não autorizada, 403; trabalho de outra conta, 404. Corpo contendo identidade é rejeitado pelo esquema estrito. Cache do painel simulado usa namespace próprio e não substitui consultas da carteira real.

Validação: sete testes em npm run test:committee-local, incluindo dois novos para configuração e separação entre contas, com middleware de autenticação substituído por fixture no teste. O teste não valida uma sessão Clerk real. A integração de login em navegador ainda precisa ser exercitada em uma instância de desenvolvimento com Clerk configurado e conta de teste autorizada. Nenhum ambiente foi habilitado automaticamente, e a integração com LLM permanece desligada.

## Login em ambiente isolado

`npm run dev:committee-auth` abre http://127.0.0.1:19624/committee-auth-demo.html. A entrada exige NODE_ENV=development, a opção --offline-fixture e um par de chaves Clerk de desenvolvimento já configurado no ambiente (pk_test_ / sk_test_). Rejeita chaves de produção. Não transporta segredos para o navegador: apenas a chave publicável. No notebook escuta exclusivamente em loopback; no Replit reconhece apenas REPLIT_DEV_DOMAIN com formato *.replit.dev e usa a porta 5001 para a prévia de desenvolvimento, sem trocar o processo principal ou publicar a aplicação. não habilita a integração e não importa as rotas comerciais nem trabalhadores de entrega.

A página usa login Clerk real e a mesma função requireAuth do portal. Após login, /api/auth/session verifica a sessão; se a conta não estiver autorizada, mostra seu próprio identificador para configuração pelo operador. Não existe endpoint para autoautorizar contas. Configure COMMITTEE_AUTH_SIMULATION=offline-only e COMMITTEE_SIMULATION_USERS com o identificador verificado, reinicie o processo e teste confirmação/saldo/histórico. A tela não concede créditos reais nem envia relatórios. O executor usa apenas dados sintéticos, embora o serviço de autenticação necessite rede.

Esta entrada é exclusiva do teste local e não faz parte do build de produção. A configuração das chaves e a confirmação de uma sessão real em navegador permanecem pendentes até o teste de login.
