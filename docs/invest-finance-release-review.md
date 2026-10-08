# Revisão de Invest / Finance — sem publicação

## Atualização final desta fase

Esta seção substitui conclusões anteriores sobre monitoramento passivo:
**envios reais e monitoramento automático de entregas estão suspensos**.
Não há inicialização do worker, timers, reconciliação, limpeza de eventos ou
polling/foco do histórico de entregas. Os registros e endpoints manuais
existentes foram preservados; não foi feita migração adicional.

A origem exclusiva no portal antigo não foi comprovada. A suspensão atende
à decisão explícita do proprietário, não a uma atribuição não verificada.
Ver [origem](invest-delivery-monitoring-origin.md) e
[conclusão/evidências](invest-simulation-phase-completion.md).

Validação atual: **282 testes passaram**, typecheck/build passaram e fluxo
completo do estudo fictício passou no navegador com dois usuários sintéticos,
retomada pelo histórico e nenhuma chamada externa, de banco ou de fila legada.
Banco 21/21 permanece confirmação do proprietário/revisor já registrada:
nenhuma atualização repetida. Não há autorização para publicar ou mesclar.

## Histórico da revisão anterior

## Limites desta atualização

Identidade visual reutilizada da tela de acesso em Invest, Finance e seleção de
áreas. Sem alterações no site institucional, DNS, segredos, permissões de contas
ou tarefas pendentes. Estudos simulados são fictícios, autenticados e isolados;
não geram tokens, débitos reais, envios ou recomendações aprovadas.

## Banco

A migração de desenvolvimento `0015_investment_governance_controls.sql` contém as
duas funções e os três gatilhos canônicos. A conferência somente leitura
`sql/investment-release-readiness.sql` exige 21 controles presentes e válidos.
O servidor também recusa autorização com funções alteradas ou eventos incorretos.

O diff gerenciado continua omitindo essas rotinas. Versionar a migração não é
evidência de que o Publish a executará. Confirmar um caminho suportado de transporte
e todos os controles físicos antes de publicar; não inserir DDL em build/startup,
não executar scripts próprios contra produção e não selecionar sobrescrita de dados.

O proprietário executou a atualização no console oficial; o revisor confirmou
produção por consulta somente leitura: **21/21**, incluindo hashes das funções e
gatilhos. A confirmação fornecida está em
`docs/evidence/invest-production-readiness.json`. O agente não repetiu a atualização.
Não alterar banco, segredos, DNS ou permissões. O procedimento humano anterior é
histórico e não deve ser reaplicado. A versão atual precisa apenas da revisão
final da proposta e autorização explícita antes de publicação.

## Bloqueio incondicional de envios nesta fase

Envios reais de relatórios ficam bloqueados mesmo com aprovação profissional e
provedor configurado. A API autenticada recusa pedidos antes de consultar ou
enfileirar; o processamento retorna antes de reclamar solicitações pendentes.
As funções de envio também recusam execução antes de acessar provedores.
Pedidos antigos não são marcados artificialmente como enviados ou falhos.
Leitura dos relatórios, histórico e confirmação passiva de envios anteriores
permanecem separados do bloqueio. Captura de leads permanece intacta.

Checkout, concessão/crédito/débito real, liquidação Stripe e motores pagos
permanecem bloqueados. Consulta ao saldo real também não acessa o ledger nesta
fase. O código remoto legado é preservado, não ativado.

## Sincronização GitHub

Origem: `https://github.com/contatotechmoney/tech-money.git`.
O histórico local e `main` do GitHub divergiram depois da origem comum. A proposta
deve usar uma branch nova baseada no último `main` remoto e comparação de três vias,
nunca force-push nem substituição integral da árvore remota.

As versões locais de autenticação são uma evolução dos redirects remotos: mantêm
destinos explícitos, acrescentam validação de codificação/domínio e preservam Clerk,
MFA/CAPTCHA e captura Supabase. Não restaurar a tela antiga de senha.

Na proposta reconciliada, preservar módulos remotos de personas, créditos e
cobrança. O comitê antigo deve permanecer preservado, mas bloqueado antes de
provedores ou débitos; não restaurar sua criação de esquema na inicialização.
Não incorporar o PR antigo de consolidação/créditos que ainda está pendente.

Validar separadamente a árvore exata da proposta, além da cópia local. Não afirmar
que a atualização está publicada ou que os históricos estão sincronizados apenas
porque uma proposta foi aberta. Registrar no PR quaisquer divergências restantes.
