# Integração Hermes — piloto informativo

Esta versão prepara a solicitação de análises, escolha de modelos autorizados, acompanhamento e histórico privado. Não integra automaticamente os 22 agentes, não confirma que as etapas do comitê executaram, não valida fatos e não aprova recomendações.

## Estado

O Hermes do Marlon está no notebook. Nenhum serviço remoto ou credencial foi configurado nesta implementação. A integração permanece desativada por padrão. Nenhuma análise real foi solicitada.

## Antes de habilitar

1. Copiar para um ambiente de teste na nuvem o código do comitê e os arquivos de configuração não secretos necessários. Centralizar caminhos absolutos, fixar dependências e usar um banco de teste separado. Não copiar bancos de clientes, a memória pessoal, sessões nem a pasta completa do Hermes.
2. Instalar uma versão fixada do Hermes que suporte Runs API, idempotência e seleção de provedor por solicitação. Conferir `/v1/capabilities`. Não habilitar um perfil pessoal genérico com acesso ao terminal, arquivos pessoais ou envio de mensagens. Configurar um perfil dedicado com ferramentas e diretórios limitados; o prompt não é uma barreira de segurança.
3. Hospedar a API atrás de HTTPS e autenticação. A URL deve apontar para a raiz da API, sem `/v1`, credenciais ou token na URL. Não expor a API do notebook diretamente.
4. Aplicar apenas a nova migração em banco de teste e verificar isolamento/limites com execuções reais. Revisar o histórico de migrações antes de usar o runner, pois há migrações anteriores que alteram dados.
5. Configurar os secrets pelo painel do servidor. Nunca incluir chaves no navegador ou Git.
6. Comparar uma análise de BBDC3 com a execução atual: agentes, fontes, revisão cruzada, refutação, verificação e datas. Só ampliar tickers/modelos após testes.

## Configuração do servidor

- `HERMES_ANALYSIS_ENABLED`: somente `true` habilita a conexão.
- `HERMES_API_URL`: raiz HTTPS da API dedicada.
- `HERMES_API_KEY`: segredo de autenticação server-to-server.
- `HERMES_ALLOWED_USER_IDS`: IDs Clerk das contas aprovadas para o piloto, separados por vírgulas. Não é um sistema de assinatura.
- `HERMES_MODELS_JSON`: lista de `{ "id": "standard", "label": "Modelo aprovado", "provider": "provedor", "model": "id-do-modelo", "credits": 2, "maxCostMicroUsd": 1000000 }`. O cliente só escolhe o `id` da lista.
- `HERMES_GLOBAL_DAILY_BUDGET_MICRO_USD`: reserva global conservadora de orçamento técnico em micros de dólar (1.000.000 = US$ 1). Obrigatória e positiva. O custo máximo de cada modelo deve caber nesse orçamento. Esses valores são técnicos, não preços comerciais.
- `HERMES_ALLOWED_TICKERS`: universo validado no piloto, inicialmente `BBDC3,BBAS3`. Não confirma existência ou cobertura de qualquer ticker arbitrário.
- `HERMES_GLOBAL_DAILY_LIMIT`: limite global em 24 horas, padrão 10.
- `HERMES_GLOBAL_CONCURRENT`: máximo global de execuções em andamento, padrão 2.
- `HERMES_DAILY_LIMIT`: limite de solicitações por conta em janela de 24 horas, padrão 3, máximo 100.

## Comportamento

- A solicitação só nasce após POST autenticado. GET de opções não inicia análise.
- Uma execução ativa por usuário e limite diário são reservados em transação com trava global de reserva para impedir que solicitações concorrentes ultrapassem os limites.
- Histórico e consulta verificam o dono antes de acessar o Hermes. IDs remotos e chaves não chegam ao navegador.
- Retentativa incerta mantém a mesma chave de idempotência. Após 23 horas, bloqueia a retentativa e exige conferência operacional no Hermes: as chaves remotas têm retenção documentada de 24 horas.
- Falhas de consulta não são apresentadas como falha definitiva da execução.
- Texto concluído é exibido como não revisado; não é promovido para `investment_reports` nem passa nos bloqueios de recomendação. HTML remoto é texto, sem execução.
- Registra o modelo/provedor efetivamente retornado, inclusive fallback. A ausência desse metadado permanece desconhecida.
- Solicitações sem confirmação podem bloquear novas análises daquela conta até reconciliação operacional. Não há cancelamento remoto, correção administrativa ou worker de reconciliação implementado nesta fase.
- Sessões/memória do Hermes e isolamento das ferramentas devem ser validados no serviço dedicado. O isolamento do histórico no portal não comprova isolamento interno do Hermes.

## Proteção de custos antes da ativação

Limites de solicitações não são limites de tokens ou dinheiro. Uma única análise multiagente pode fazer muitas chamadas. Antes de habilitar o piloto com provedor real, configurar uma chave exclusiva com orçamento efetivo (não apenas alertas), modelos e fallbacks autorizados e limites finitos para rodadas do orquestrador e dos agentes delegados na versão instalada do Hermes. Medir custo de ponta a ponta incluindo delegações, revisões, pesquisa e ferramentas. Não usar uma chave pessoal sem teto verificável. As configurações de limite do Hermes variam por versão e precisam ser conferidas no servidor; este portal não impõe sozinho um teto monetário por execução.

A rota legada de atualização manual está bloqueada (503), sem chamada aos provedores ou alteração dos documentos. Os botões levam ao painel com reserva de créditos. A reserva financeira não interrompe o motor remoto: a integração continua desativada até validar o teto efetivo de tokens e custo no executor.

## Próximas fases comerciais

Contrato estruturado de resultados (contribuições e fontes por agente), progresso por etapa, reconciliação/cancelamento, orçamento em tokens/custo por execução e limite global, assinatura e créditos reais, revisão pelo consultor e testes com múltiplos clientes. Também conferir licenças e direitos de uso dos dados financeiros. O piloto não está pronto para acesso comercial público.

## Testes sem custo

`npm run test:quality` remove as variáveis de DB e LLM, inclusive a ativação do Hermes. Testes utilizam armazenamento sintético e HTTP local. `npx tsc --noEmit --incremental false` e `npm run build` não executam migrações.

## Carteira de créditos implementada

A migração 0012 adiciona um histórico imutável de concessão, reserva, consumo e estorno. Criação da solicitação e reserva de saldo/orçamento ocorrem na mesma transação, protegida contra concorrência. Repetir a chave da mesma solicitação não reserva novamente. Ausência de confirmação mantém o saldo reservado; falha confirmada devolve uma única vez; conclusão consome, sem aprovar o estudo profissionalmente.

GET autenticado `/api/investments/credits` retorna apenas a carteira da conta. Não existe endpoint público de concessão, compra ou expiração. `grantAnalysisCredits` é uma primitiva restrita ao servidor, idempotente por evento verificado. Antes de habilitar assinaturas, implementar webhook de pagamento validado, vínculo com plano/período e regras comerciais de validade, renovação e reembolso. O saldo da implementação legada não foi migrado: reconciliar eventos verificados antes de conceder saldo na nova carteira.

O orçamento técnico retém a estimativa máxima por execução durante solicitações ativas e por 24h após a última atualização. Falhas também retêm orçamento técnico, pois podem ter gasto tokens; seus créditos comerciais são devolvidos. Essa estimativa só constitui teto real após o executor garantir que nenhuma execução, ferramenta ou fallback ultrapasse o valor reservado.

`npm run validate:synthetic` usa PostgreSQL descartável e testa concorrência, idempotência, estorno, conclusão, isolamento e imutabilidade. Nenhum banco de cliente ou provedor de IA é chamado.

## Núcleo do executor dedicado (offline)

`executor/b3/budget.py` implementa uma reserva técnica persistente compartilhada por chamadas, com testes de concorrência e interrupção. Não está conectado à Runs API, não limita o Hermes pessoal e não habilita execução real. Adaptador de modelo, contagem de tokens, limites do provedor, ferramentas e reconciliação ainda faltam. Detalhes e testes em `executor/b3/README.md`.


## Escolha e aprovação do preço fixo

O painel permite revisar ação, modelo, preço total em créditos e saldo após a reserva, depois confirmar explicitamente. Abrir ou fechar a confirmação não envia a solicitação. A API exige `confirmedCredits` e `priceVersion`; mudança de preço/modelo/provedor/teto/URL entre oferta e envio retorna 409 `PRICE_CHANGED` antes da reserva ou chamada remota. A revisão pública é um hash de condições, não autenticação nem autorização; identidade, allowlist e carteira são conferidas no servidor. Não há cobrança complementar automática.

Esta etapa continua limitada ao estudo informativo já existente, sem catálogo fictício de tipos de análise ou promessas de qualidade/velocidade. O operador define os modelos permitidos e preços fixos; não são preços reais do DeepSeek. O provedor usado no Hermes permanece não identificado. O executor dedicado não foi conectado nem habilitado; margens, preços comerciais e integração LLM continuam pendentes de validação. O retry de submissão incerta conserva a chave original, e o armazenamento rejeita alteração de preço/configuração de uma reserva existente.
