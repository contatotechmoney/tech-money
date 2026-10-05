# Teste completo local, sem LLM

Esta entrada usa o painel React existente, HTTP, as rotas registerHermesRoutes e o executor Python offline de 21 etapas. A carteira é descartável em memória; não substitui nem comprova a carteira PostgreSQL de produção. Login e pagamentos não são testados. A identidade é fixa e sintética, definida no servidor, nunca informada pelo navegador.

Em dois terminais na raiz do projeto, execute `npm run dev:committee-executor` e `npm run dev:committee-demo`. Abra http://127.0.0.1:19622/committee-executor-demo.html. Os dois servidores escutam apenas 127.0.0.1. A API exige cabeçalho de teste e recusa origens diferentes da prévia. Não há CORS liberado. Não publique essas entradas em produção.

O Python recebe ambiente restrito a PATH e PYTHONDONTWRITEBYTECODE. Seu transporte offline bloqueia conexões de rede e valida simulation=true, live_enabled=false, network_calls=0 e portal_wallet_connected=false. Os identificadores e tarifas do DeepSeek/Nous são fictícios nesta entrada. Não é utilizado HermesConfig do ambiente nem o HermesClient real. O servidor normal e as permissões reais permanecem intactos.

- Sucesso: reserva 2 créditos, executa 21 respostas fictícias, consome uma vez.
- Resposta incompleta ou limite interno confirmado: libera a reserva e devolve uma vez.
- Consumo incerto, erro de transporte ou resultado inesperado: mantém reserva e bloqueia nova análise. A interface para de consultar automaticamente quando detecta consumo incerto.
- Solicitação repetida: mesma análise e uma execução Python.
- Oferta desatualizada: recusa antes de executar/reservar.
- Cenário/reinício: cria uma nova sessão descartável com 20 créditos. Sessões antigas não alteram o saldo novo.

`npm run test:committee-local`: tipagem e cinco testes, quatro deles atravessando HTTP e Python reais com dados simulados. Sem banco nem cobrança. Build separado: `npx vite build --config vite.committee-demo.config.ts`.

Limitações: saldo e orçamento da carteira descartável existem apenas em memória, são perdidos ao reiniciar e não são compartilhados entre processos. O orçamento SQLite do executor também é descartável. O teste não valida um modelo, suas tarifas, análise financeira, autenticação, pagamento ou cancelamento em provedor. Próxima etapa comercial exige integração autenticada com o executor hospedado, validação dos preços e limites reais, carteira PostgreSQL, revisão profissional e faturamento.
