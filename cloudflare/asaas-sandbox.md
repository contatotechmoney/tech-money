# Teste de cartão do Invest no Asaas Sandbox

A página **Créditos & Planos** permite simular a recarga avulsa e as assinaturas Essencial e Avançado. A simulação local usa saldo temporário e valores de exemplo. O teste com fatura Asaas usa outro saldo, calculado a partir dos pagamentos confirmados no Sandbox.

## Configuração

1. Use um Worker de testes em `workers.dev`, com acesso restrito pela conta vinculada do Invest, e um banco PostgreSQL de testes. Aplique [asaas-sandbox.sql](../supabase/asaas-sandbox.sql) nesse banco e conecte-o ao Worker pelo Hyperdrive `INVEST_ASAAS_SANDBOX_DATABASE`. Use os papéis `anon`, `authenticated` e `service_role` do Supabase e uma conexão de servidor com permissão para consultar e gravar as tabelas de teste.
2. Configure `INVEST_PORTAL_MODE=billing-sandbox` e `INVEST_MIGRATION_ORIGIN` com a origem HTTPS exata do Worker. As rotas de pagamento exigem esse modo e essa origem.
3. Crie um cliente fictício na sua conta do [Asaas Sandbox](https://docs.asaas.com/docs/faq-sandbox-1). Guarde o ID do cliente em `INVEST_ASAAS_SANDBOX_CUSTOMER` e a chave de teste em `INVEST_ASAAS_SANDBOX_API_KEY` no Worker.
4. Configure o [webhook de teste](https://docs.asaas.com/docs/criar-novo-webhook-pela-aplicacao-web) em `/api/migration/asaas-sandbox/webhook`. Use um token próprio, guardado no Worker como `INVEST_ASAAS_SANDBOX_WEBHOOK_TOKEN`. Selecione os eventos de confirmação, recebimento, estorno, estorno em andamento e contestação de cobrança.
5. Em **Créditos & Planos**, gere a fatura de teste e pague nela com um cartão de teste. Atualize a seção de pagamentos do Invest e confira o saldo e o histórico. Repita o evento de confirmação no Asaas e confira que o saldo fica igual. Teste também o estorno.
6. Para a assinatura, confira a primeira fatura e a renovação. O ensaio é limitado a duas cobranças por assinatura. O mesmo acesso de teste aceita uma única assinatura. Use um ambiente de teste limpo para ensaiar outro plano. Pedidos em conferência podem ser consultados pela referência original na página. Se a API indicar um resultado incerto, confira o pedido no Sandbox antes de uma nova tentativa.

As telas de teste usam franquias e valores ilustrativos. Para a operação comercial, ainda é necessário validar as tarifas e a margem, integrar o saldo persistente ao uso dos recursos e validar a cobrança real, o cancelamento e os efeitos de estorno sobre créditos usados. O reaproveitamento de cartão depende de um token válido para o mesmo cliente no Asaas e da habilitação de tokenização na conta. A cobrança fica hospedada no Asaas. [Documentação de tokenização](https://docs.asaas.com/reference/tokenizacao-de-cartao-de-credito)
