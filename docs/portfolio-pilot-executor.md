# Piloto de Carteira Completa — servidor, persistência e executor

Atualização posterior: [Avanço técnico e pré-execução, ainda fechado](portfolio-pilot-runtime-preflight.md).
Este documento preserva as evidências da preparação anterior.

## Estado operacional

Esta revisão avança a preparação anterior: adaptador PostgreSQL conectado em
desenvolvimento, três tabelas aditivas e executor independente dos seis agentes
implementados. Nenhuma conta foi liberada e nenhuma análise real foi iniciada.
Não existe worker automático do piloto. Todos os testes usam dados sintéticos.

O executor é uma adaptação local das metodologias inspecionadas no código
`contatotechmoney/b3`, não uma conexão ao Hermes/notebook. Fontes inspecionadas:
`comite_db/motor_carteira.py`, `comite_db/montar_comite_carteira.py` e
`comite_db/gerar_relatorio_carteira.py`. Não foram lidos arquivos de posições,
SQLite, saídas pessoais ou credenciais. O código b3 não foi executado ou alterado.
Nenhum caminho local ou template pessoal foi transportado para o portal.

## Identidade: único passo necessário do proprietário

A identidade não pode ser inferida do nome ou da conta GitHub. O vínculo continua
fechado. O mecanismo operacional verifica: Clerk `requireAuth`, subject exato
revisado, ambiente development/production correto, evidência independente de
titularidade e consulta oficial `clerkClient.users.getUser`, com e-mail primário
verificado. Nenhuma API permite ao navegador conceder o vínculo.

**Ação necessária:** no painel oficial **Auth**, selecione **Production**, abra
sua própria conta e confirme nesta conversa seu **User ID**. Não envie senha,
chave, cookie ou token. Atestar o ID não executa análises nem publica.

Após essa confirmação, a vinculação deve ser revisada contra a identidade Clerk
oficial no ambiente correspondente. Development e Production são distintos:
confirmar um ID de desenvolvimento não concede acesso em produção.
Para registrar evidência autenticada no ambiente onde esta revisão estiver
instalada, GET `/api/investments/portfolio-pilot/identity` consulta somente a
própria conta e grava prova em auditoria, sem liberar acesso. O binding só é
aceito se houver essa prova oficial correspondente; sua ausência permanece
um bloqueio. O ID pode ser confirmado agora sem implantar mudanças em produção.

## Nous: identificadores e preços públicos confirmados

Fonte oficial consultada em 2026-10-10:
https://inference-api.nousresearch.com/v1/models

| ID exato | Entrada USD / 1M tokens | Saída USD / 1M tokens | Cache read USD / 1M |
|---|---:|---:|---:|
| `deepseek/deepseek-v4.1-flash` | 0,106 | 0,513 | 0,004 |
| `deepseek/deepseek-v4.1-flash:US` | 0,363 | 1,089 | 0,0115 |

São opções diferentes; nenhuma foi escolhida automaticamente. A conversão usa
os valores decimais completos da API, não os arredondamentos da página pública.
A modalidade `:batch` não foi incluída no executor síncrono. O modelo configurado
no Hermes principal, `deepseek/deepseek-v4-flash`, NÃO é V4.1. Não foi alterado.
`z-ai/glm-5.2` também não foi alterado ou escolhido.

A API pública foi consultada sem credenciais e sem inferência. Ela não comprova
descontos, modalidade de cobrança ou disponibilidade da conta Nous do proprietário.
**Lacuna exata:** validar catálogo/tarifa efetivos autenticados da conta e um
adaptador Nous com uso autoritativo, limites de saída e cancelamento verificáveis.
As chaves específicas Nous não existem nos secrets de desenvolvimento consultados;
nenhum segredo foi solicitado, alterado ou presumido a partir de LLM_API_KEY.
Catálogo público sempre marca `accountPricingVerified=false`, impedindo orçamento
executável. Consulta de metadados no runtime só ocorre sob demanda do proprietário
independentemente vinculado — nunca em startup/worker ou para contas alheias.

## Persistência e migração

`migrations/0017_portfolio_pilot.sql`: somente criação de
`portfolio_pilot_accounts`, `portfolio_pilot_audit` e
`portfolio_pilot_owner_bindings`. Não inclui dados de clientes, binding, grants,
UPDATE/DELETE de registros existentes ou substituição do banco.

DDL aplicado **apenas em development** pelo console suportado; três tabelas
confirmadas. O schema Drizzle está alinhado. Não houve alteração em produção,
startup, build de publicação, DNS, permissões ou secrets. Os 21 controles antigos
de revisão/auditoria não foram reexecutados nem modificados.
Na futura publicação, revisar o diff aditivo do Replit; não sobrescrever dados.
O arquivo não é um script para conectar ou migrar produção por fora do Publish.

Transações PostgreSQL usam row lock entre processos, limites de espera,
rollback atômico e trilha separada append-only pelo adaptador. Estado de
orçamentos, aprovação, execução, reservas, consumo conhecido e resultados fica
persistente. Não há fallback em memória. Nenhum trigger adicional é presumido:
a imutabilidade implementada aqui é do adaptador, não promessa de bloquear o DBA.

## Executor e limites

Bruno → Tereza → Paulo → Larissa → Sérgio → Denise, em ordem. O dossiê técnico
é calculado localmente; Denise recebe as saídas dos cinco agentes somente quando
elas foram concluídas. Falha parcial não inventa uma síntese ou recomendação.

Antes de cada despacho: orçamento, aprovação, validade, carteira e tarifa
revalidados; custos/tokens máximos reservados atomicamente. 6 chamadas,
18.000 tokens de entrada/6.000 de saída, 90s, zero retries, até USD 1,00.
Por chamada: limite conservador de entrada por bytes UTF-8 ≤3.000 e até 1.000
tokens de saída; o adaptador futuro também precisará confirmar seu tokenizer.
O limite aprovado pode apenas diminuir o teto do servidor.

Um budget cria no máximo uma execução por conta; repetição retorna recibo/histórico,
não outro despacho. Chamadas têm reserva máxima prévia e uso confirmado separado.
Falha/timeout com resultado incerto retém a reserva ativa e impede novo gasto.
Não libera saldo nem repete chamada presumindo que o provedor não cobrou.
Recuperação administrativa desses resultados exige evidência do provedor e novo
escopo; não existe reconciliação externa automática nesta versão.

## Correções metodológicas

- Quantidades/preços ausentes impedem cálculo: nunca pesos iguais como reais.
- Pesos reais do conjunto selecionado não são renormalizados quando falta histórico.
- Cobertura por peso, ativos ausentes e observações comuns são explícitas. Risco
  agregado só é calculado com cobertura integral e amostra suficiente.
- Beta exige benchmark fornecido e alinhado; nunca busca mercado por conta própria.
- Classes e liquidez vêm dos dados; ausentes ficam “não informado”. D+0 e D+1
  são separados. Nenhuma afirmação automática de carteira 100% RV.
- Contexto macro requer data/fonte; sem contexto válido, não há taxas ou cenários
  “atuais” inventados. Não se transportaram cenários fixos do notebook.
- Metodologia estatística documentada no dossiê; VaR mensal usa retornos compostos,
  janela de 21 observações e pelo menos 60 janelas.

## Limites mantidos

Simulação fictícia separada; autenticação e isolamento existentes preservados.
Resultados do piloto nunca são aprovação profissional. Envios, negociação,
cobrança comercial e movimentação de créditos continuam bloqueados.
Runtime real permanece sem executor/provedor/feed validado. Não basta cadastrar
um ID, instalar uma chave ou aprovar a interface para abrir chamadas.

## Validação

Ver `docs/evidence/portfolio-pilot-executor-validation.json`.
Provedores e identidades falsos nos testes; PostgreSQL descartável separado de
development/production. Nenhuma inferência, cotação ou transmissão de posições
reais foi realizada. A consulta oficial Nous foi somente GET de metadados.
