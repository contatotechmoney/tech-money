# Conciliação Replit / GitHub — revisão antes de publicação

Fonte Replit: 18b113e0e0dab5cb677174d0477f025e4849f7c7.
Base GitHub: 0d36d26d88fe69ee60ae9fe8747b89b9d43864f0.

Esta branch reúne a implementação de suitability, política de qualidade dos relatórios, revisão profissional versionada, confirmação de entrega e piloto Hermes desativado. Mantém o destino de investimentos após login/cadastro. O site institucional Cloudflare, DNS e publicação do Replit não são alterados.

## Preservação e divergências

Os arquivos exclusivos do GitHub `server/credits.ts`, `server/billing.ts`, `shared/personas.ts`, `script/build.ts` e os recursos estáticos permanecem. As antigas rotas e a antiga tela de créditos estão preservadas em `docs/legacy-github/` para portabilidade e comparação.

**Bloqueio de merge/publicação:** o Replit substituiu a cobrança integrada do GitHub por uma tela ilustrativa. As rotas de cobrança do GitHub não foram ativadas nesta consolidação. É necessário reconciliar a carteira e a interface antes de comercializar; preservar o código não significa que a cobrança está integrada. O catálogo antigo contém preços e benefícios não aprovados nesta revisão.

O piloto Hermes controla quantidades de solicitações e concorrência, não constitui orçamento monetário ou de tokens. Não habilitar `HERMES_ANALYSIS_ENABLED` para clientes até implementar reserva de créditos, teto financeiro global, limites no motor e reconciliação do consumo. A rota legada de refresh de relatórios também precisa entrar no controle de consumo. Não migrar memórias pessoais ou credenciais do notebook.

A tarefa de aviso visual de confirmação atrasada ainda aguarda revisão no Replit e não faz parte desta fonte. Currículos e retratos dos agentes são personas virtuais, não credenciais humanas.

## Validação

Fonte Replit auditada: 53 testes gerais, 5 de banco de revisão e 72 de qualidade (130 aprovados), TypeScript e build aprovados. Banco PostgreSQL temporário isolado, sem chamadas pagas ou uso do banco de clientes.

A checagem da composição com os arquivos exclusivos do GitHub é registrada no PR. Nenhuma migração de produção, cobrança ou envio de mensagem é executada por esta branch.
