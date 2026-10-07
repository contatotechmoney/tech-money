# Revisão de Invest / Finance — sem publicação

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
