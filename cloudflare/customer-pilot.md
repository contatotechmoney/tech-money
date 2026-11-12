# Piloto do Invest por convite

O piloto serve uma demonstração autenticada em um Worker separado. O convidado entra com código por e-mail e experimenta a pesquisa, os relatórios, o comitê, a carteira fictícia e o saldo demonstrativo. Os dados de teste da sessão são descartados ao sair ou recarregar. O Worker do piloto responde com acesso negado para APIs da conta do proprietário, dados de carteira, custos internos, pagamentos e execução real.

## Publicar o piloto com Cloudflare Access

1. Execute `npm run build:cloudflare-client` e publique com `wrangler deploy --config wrangler.customer-pilot.json`. Esse Worker só vincula os arquivos estáticos da demonstração. O endereço definitivo do Invest usa outro Worker.
2. Em **Workers & Pages → techmoney-invest-customer-pilot → Access**, proteja todo o tráfego desse Worker. Crie uma política dedicada que permita somente o e-mail do convidado e ofereça código de uso único por e-mail.
3. Nas variáveis do Worker, configure `INVEST_CUSTOMER_PILOT_ACCESS_ISSUER` com a origem HTTPS da equipe do Access e `INVEST_CUSTOMER_PILOT_ACCESS_AUDIENCE` com o valor de audiência da aplicação. Configure `INVEST_CUSTOMER_PILOT_ACCESS_EMAIL` como segredo. O Worker valida assinatura, emissor, audiência e e-mail em cada solicitação. Sem esses parâmetros, responde com erro de configuração.
4. Em uma janela sem sessão, confirme o redirecionamento ao login e a recusa de identidade fora da política. Com o convidado autenticado, confira a jornada fictícia e o encerramento da sessão. As rotas de pagamento, análise real e dados do proprietário devem responder com acesso negado mesmo após o login.

## Alternativa com autenticação Supabase isolada

1. Use um projeto Supabase dedicado à autenticação do piloto, separado do projeto que guarda os dados do Invest. Desabilite o cadastro público e provisione apenas os usuários convidados em **Authentication → Users**.
2. Configure o [e-mail de acesso com código](https://supabase.com/docs/guides/auth/auth-email-passwordless) com `{{ .Token }}` e o código de seis dígitos. Confirme o remetente e a entrega com um endereço de teste autorizado.
3. Configure um Worker separado em `workers.dev` com `INVEST_PORTAL_MODE=customer-pilot`, `INVEST_CUSTOMER_PILOT_ORIGIN` igual à origem HTTPS do Worker, `INVEST_CUSTOMER_PILOT_SUPABASE_URL`, `INVEST_CUSTOMER_PILOT_SUPABASE_PUBLISHABLE_KEY` e `INVEST_CUSTOMER_PILOT_EMAILS` com os endereços convidados separados por vírgula. Use apenas a chave publicável. O piloto usa o mesmo build do Invest e dispensa conexões com o banco de produção e chaves de pagamento ou de IA.
4. Configure o [limitador do Worker](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) em `INVEST_CUSTOMER_PILOT_RATE` com namespace dedicado e, inicialmente, 6 tentativas por 60 segundos. Guarde um segredo aleatório de pelo menos 32 caracteres em `INVEST_CUSTOMER_PILOT_RATE_KEY`. O limitador usa chaves derivadas do e-mail e da origem da requisição.
5. Verifique a entrega do código, o acesso de um convidado, a recusa de um endereço sem convite e a saída. Confira com uma sessão de convidado que as APIs de produção retornam acesso negado e que somente extratos fictícios são oferecidos. Remova um endereço da lista para verificar a revogação após a atualização da configuração.

A etapa local usa respostas de autenticação simuladas. O envio real de e-mail e a configuração de um Worker hospedado fazem parte da homologação seguinte.
