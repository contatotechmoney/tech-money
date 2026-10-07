# Liberação controlada de Invest em simulação

## Atualização concluída — NÃO REPETIR

Em 2026-10-07, o proprietário informou a execução no console oficial, e o revisor
confirmou por consulta somente de leitura **21 controles verificados / 21 prontos**,
incluindo os hashes canônicos das funções e os gatilhos. Essa é a confirmação
fornecida nesta conversa; o agente não reexecutou a atualização nem acessou dados
de clientes. Registro: `docs/evidence/invest-production-readiness.json`.

O procedimento abaixo é registro histórico, não uma instrução para nova execução.
Não reaplicar o plano, não alterar banco, permissões, DNS ou segredos.
O bloqueio anterior de transporte das rotinas está encerrado. A publicação
continua dependente da revisão final da correção de envios nesta conversa.

## Resultado e responsabilidade

O agente não tem acesso de escrita ao banco de produção gerenciado. Não tentar
liberar esse acesso por conexão alternativa, secret, Shell, build ou inicialização.
O Publish aplica o diff de tabelas; o diff conferido não inclui funções/gatilhos.
Versionar a migração de desenvolvimento não altera esse comportamento.

A documentação oficial disponibiliza edição manual pelo proprietário:

- https://docs.replit.com/features/data-and-storage/work-with-your-data
- https://docs.replit.com/features/data-and-storage/development-and-production

Tela exata: **Database → selecionar o banco de produção deste projeto → My Data
→ Edit → SQL runner**. O comando de gravação é o botão **Run**, adjacente ao editor.
Ativar Edit nessa tela não concede atribuição profissional ou administrativa a
nenhuma conta do aplicativo; não preencher as tabelas de habilitação/atribuições.

## Fontes já revisadas — não criar migrador de produção

1. O plano oficial de 15 instruções aditivas está registrado, sem alteração,
   em `docs/evidence/invest-schema-diff.json`, campo `statementsToExecute`.
   São seis tabelas novas, uma coluna nullable, quatro vínculos e quatro índices.
2. As definições de desenvolvimento de duas funções e três gatilhos estão em
   `migrations/0015_investment_governance_controls.sql`.
3. A conferência posterior somente leitura está em
   `sql/investment-release-readiness.sql`: resultado esperado, **21 linhas ready=true**.

O JSON é evidência do plano calculado pelo Replit, não um programa de migração.
Não executar migrations antigas indiscriminadamente: elas podem incluir escopo
de entregas ou outras alterações que não pertencem a esta liberação.

## Procedimento humano e limites

Antes de qualquer gravação, finalizar nesta conversa a revisão do PR e do plano.
**Não clicar Publish nesta etapa.**

Se o proprietário optar pela edição manual documentada, preparar no SQL runner
uma única transação com as instruções do plano oficial na ordem apresentada,
seguidas das definições canônicas já revisadas da migração 0015. Manter os nomes
no schema `public`. Não acrescentar DROP, TRUNCATE, DELETE, UPDATE de registros,
GRANT, ALTER ROLE, INSERT de habilitações, importação ou cópia de dados.

A única ação humana de gravação é **Run dessa transação no banco de produção**,
com o encerramento da transação no mesmo envio. Não separar BEGIN e COMMIT em
execuções/conexões distintas. O agente não gera nem executa um runner próprio.

Se o SQL runner não aceitar a transação completa, não dividir uma atualização
parcial, não trocar de conexão e não improvisar outro caminho. Registrar a
mensagem técnica sem dados/credenciais e interromper para verificar o suporte.
Se algum objeto já existir ou o diff mudar, interromper e recalcular o plano;
nunca apagar um objeto para contornar um erro de criação.

Depois dessa única gravação, o agente verifica os 21 controles pela réplica
somente leitura. Falha em qualquer linha bloqueia aprovação da publicação.
Confirmação em desenvolvimento ou uma execução sem erro não substituem essa
conferência física em produção.

## Revisão final para publicar somente simulação

- A revisão do PR identificou checkout/concessão de créditos acessíveis e ausência
  de reconferência dos controles na gravação de revisão. Corrigir ambos antes da
  aprovação; não apenas confiar em flags de ambiente ou autorização anterior.
- Bloquear checkout, crédito de cadastro e liquidação do webhook Stripe antes de
  validação/provedor/ledger. Preservar o código legado e o histórico, sem ativá-lo.
- Conferir isolamento e idempotência de simulação com PostgreSQL privado
  descartável, inclusive pedidos simultâneos e a mesma chave de usuários diferentes.
- Manter revisão humana e bloqueio de recomendações reais.
- Conferir o diff restante após a edição manual. Não usar “overwrite data”,
  “Set up ... with current development data”, remover/recriar banco ou sincronizar
  registros de desenvolvimento.
- Não mesclar/publish automaticamente; aguardar aprovação final nesta conversa.

**Estado atual:** produção confirmada 21/21 pelo proprietário/revisor; nenhuma
nova intervenção no banco necessária nesta fase. Não mesclar nem publicar
automaticamente. A simulação deve bloquear todo envio real, mesmo aprovado.
