# Comitê de Carteira Completa — revisão de simulação

Revisão de 10/10/2026, preparada no mesmo projeto `contatotechmoney/tech-money`
e no PR #3, branch `review/invest-finance-simulation-20261007`.
Não publicar ou mesclar automaticamente.

## Entrega

- Terceiro cartão na Central dos Comitês, com identidade de três barras
  TECH MONEY INVESTIMENTOS, seis perfis funcionais e identificação explícita
  de personas de IA, não profissionais humanos.
- Bruno: Alocação e Risco-Retorno; Tereza: Risco de Carteira e concentração;
  Paulo: Perfil do Investidor e Objetivos; Larissa: Liquidez e Rebalanceamento;
  Sérgio: Tributação e Custos; Denise: Moderadora e Síntese.
- Os novos agentes não têm diplomas, certificações, registros ou experiência
  profissional fictícios. Renda variável continua com dez personas, renda fixa
  com seis. Carteira é um terceiro grupo explícito, nunca o complemento de RV.
- Em Minha Carteira, “Analisar minha carteira” com identificação “Simulação”
  abre `/investments/portfolio/simulation`, protegida pelo acesso Invest
  existente. O clique não inicia o estudo.
- A demonstração consulta somente seus próprios endpoints de cenário,
  criação e histórico. Não reutiliza a consulta, posições, preços, perfil
  ou transações da carteira cadastrada.
- Composição inventada de R$ 100 mil: títulos fictícios Alfa/Beta de R$ 30/10
  mil, ação fictícia Gama de R$ 25 mil, fundo fictício Delta de R$ 15 mil e
  caixa fictício de R$ 20 mil. Classes: RF 40%, RV 40%, caixa 20%. Maior posição
  30%, duas maiores 55%, calculados como valor nominal / total × 100.
- Não há preços de mercado, retorno estimado, volatilidade, correlações,
  VaR, adequação do perfil real, impostos ou tarifas calculados sem dados.
  São identificadas metodologia e limitações; Denise não aprova nem recomenda.
- Cada etapa ilustrativa avança por dois segundos de tempo decorrido,
  calculados a partir do registro persistido. Não há worker nem execução IA.
  Resultado e síntese determinísticos, reabríveis pelo próprio usuário.

## Persistência e autorização

`portfolio_simulation_studies` é uma tabela independente e aditiva, com
identificador, proprietário autenticado, chave de idempotência, versão de
cenário e data. Não guarda posições, perfis ou recomendações reais.

Listagem/detalhe filtram pelo proprietário no SQL parametrizado; a identidade
não vem do corpo. A criação aceita estritamente `{requestKey: UUID}` e
rejeita posições, modelo, perfil, proprietário e créditos enviados pelo cliente.
Respostas privadas não são armazenadas em cache; consultas da interface
incluem o usuário na chave. Troca de usuário remonta o componente.
Detalhe de outra conta retorna 404; acesso anônimo 401; ausência/falha de
persistência retorna 503, nunca histórico vazio fictício.

Limites locais: uma demonstração em progresso, até trinta criações em 24 horas;
as últimas trinta aparecem na lista, sem apagar registros anteriores.
A mesma chave é idempotente dentro da mesma conta e independente entre contas.
Não existe endpoint de aprovação, execução real, envio ou exclusão.

O cenário é versionado para que resultados históricos não mudem quando uma
nova composição demonstrativa for introduzida. Novas versões deverão preservar
a interpretação das versões anteriores.

## Banco: desenvolvimento versus produção

- Aplicada **somente em desenvolvimento**, pela operação oficial de SQL,
  a migração aditiva `migrations/0016_portfolio_simulation.sql`, em transação.
- Conferência: cinco colunas, três índices incluindo a chave primária, uma
  restrição de cenário. Nenhuma posição ou dado de cliente foi consultado
  ou inserido para validar a nova tabela.
- Produção não foi alterada nesta tarefa. A conclusão anterior de **21/21
  controles de governança prontos**, confirmada pelo revisor, permanece
  registrada; não repetimos sua atualização.
- A conferência oficial `explainSchemaDiff()` mostrou exatamente três
  operações: criar a tabela nova e seus dois índices. Sem perda estrutural,
  sem incompatibilidade e sem avisos. Não houve diffs adicionais.
- Após aprovação final, a publicação pelo fluxo oficial deverá aplicar
  somente esse acréscimo. Não há migração de produção na inicialização,
  build de deploy ou script personalizado. Não selecionar substituição
  de dados. Os controles existentes de revisão/auditoria não são recriados.

## Retratos e fontes

Inspecionados os arquivos locais e as árvores acessíveis de
`contatotechmoney/tech-money` e `contatotechmoney/b3`.
O b3 disponibiliza somente os dezesseis retratos de renda variável/renda fixa
em `assets/personas`; os seis novos retratos não estão disponíveis nessas fontes.
Utilizadas iniciais BR, TE, PA, LA, SE e DE, declaradas provisórias.
Pendência: receber os retratos originais ou um endereço institucional acessível
que efetivamente os contenha. Não gerar novas pessoas nem substituir os
dezesseis retratos existentes.

O material institucional e o motor de carteira do b3 não foram copiados como
executor: a demonstração tem cálculos locais próprios e nenhuma integração
com LLM, Hermes, preços externos ou cadastro/carteira real.

## Evidências executadas

- `npm run validate:synthetic`: **300 testes aprovados, zero falhas**:
  70 base, 23 banco descartável, 101 qualidade, 59 simulação/revisão,
  47 acesso/leads. Banco temporário isolado e credenciais reais removidas.
- `npm run check`: aprovado.
- `npm run build`: aprovado. Aviso já conhecido de tamanho dos chunks, não
  uma falha de compilação.
- `scripts/tests/portfolio-simulation-browser.test.mjs`: nove etapas
  aprovadas em Chromium; acesso fictício por código, botão, cenário, início
  explícito, seis agentes, conclusão, reabertura após reload/logout/login,
  outra conta sem acesso, vazio versus erro, três cartões e doze aberturas
  de perfis (seis por tema/viewport), grupos RV/RF preservados.
- Desktop 1280px e móvel 375px; temas claro/escuro e movimento reduzido.
  O fundo escuro foi conferido pelo estilo computado, não apenas pela
  preferência do navegador. Sem overflow horizontal da página.
- A conta fictícia A fez uma leitura da carteira vazia **antes** do botão,
  interceptada pelo fixture; nenhuma nova leitura dessa carteira durante
  a demonstração. O servidor sintético não consulta banco real.
- Contadores finais do navegador: chamadas externas/provedores 0, banco
  real 0, rotinas legadas 0, tokens 0, mudanças de créditos reais 0,
  criação de contas reais 0. Worker de entrega em produção: desabilitado.
- Tentativas de fontes opcionais Google foram abortadas pelo navegador de
  teste; não ocorreram conexões de envio, análise ou cotação.
- `scripts/tests/simulation-browser.test.mjs`: regressão do estudo
  anterior aprovada; nenhuma ativação das rotinas suspensas.
- Snapshot público da Central no preview aprovado; workflow na porta 5000,
  sem erros de inicialização. A interface autenticada foi verificada no
  navegador de teste isolado, não com contas reais.
- Safari nativo não executado: permanece a limitação de bibliotecas WebKit
  do ambiente, já documentada na revisão de identidade. Não alegar aprovação
  nativa no Safari.

## Arquivos principais

- Modelo/cálculos: `shared/portfolio-simulation.ts`.
- Catálogo: `shared/personas.ts`.
- Endpoints/repositório: `server/portfolio-simulation.ts`, `server/routes.ts`.
- Schema/migração: `shared/schema.ts`, `migrations/0016_portfolio_simulation.sql`,
  journal existente com entrada incremental.
- Interface: `client/src/pages/portfolio-simulation.tsx`,
  `client/src/pages/investment-portfolio.tsx`, `client/src/App.tsx`,
  `client/public/comites/central_comites.html`.
- Verificações: novos testes de API/PostgreSQL/navegador, fixture sintético
  e ajuste da auditoria para preservar integralmente os dados de RV/RF.

Finance, site institucional, Clerk, captura Supabase, DNS, segredos,
permissões profissionais, envios, cobrança e bloqueios de motores pagos
não foram modificados. Nenhuma tarefa anterior foi aplicada.
