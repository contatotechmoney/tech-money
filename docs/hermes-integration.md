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
- `HERMES_MODELS_JSON`: lista de `{ "id": "standard", "label": "Modelo aprovado", "provider": "provedor", "model": "id-do-modelo" }`. O cliente só escolhe o `id` da lista.
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

A rota legada de atualização manual do comitê de nove perspectivas ainda não está integrada a esta quota Hermes. O carregamento automático foi removido dos GETs de relatórios, mas os POSTs legados precisam receber quotas/créditos antes de acesso comercial. Não considerar o teto Hermes uma proteção global de todos os provedores do aplicativo.

## Próximas fases comerciais

Contrato estruturado de resultados (contribuições e fontes por agente), progresso por etapa, reconciliação/cancelamento, orçamento em tokens/custo por execução e limite global, assinatura e créditos reais, revisão pelo consultor e testes com múltiplos clientes. Também conferir licenças e direitos de uso dos dados financeiros. O piloto não está pronto para acesso comercial público.

## Testes sem custo

`npm run test:quality` remove as variáveis de DB e LLM, inclusive a ativação do Hermes. Testes utilizam armazenamento sintético e HTTP local. `npx tsc --noEmit --incremental false` e `npm run build` não executam migrações.
