# Acesso Finance / Invest

Os caminhos `/`, `/sign-in/*?` e `/sign-up/*?` compartilham o cartão
`AuthAccessShell` e o fluxo `AuthAccessPage`, inspirado no acesso do Coop.
O estilo é local ao cartão; o site institucional não é alterado.

## Destinos

- `invest.techmoney.com.br`: `/investments/agents`.
- `finance.techmoney.com.br`: `/dashboard`.
- Outros hosts: `/areas`.
- Um `redirect` interno válido prevalece sobre o destino do host.
- URLs externas, destinos de autenticação e separadores/controles codificados
  inválidos usam o destino seguro do host.

Não foram criados registros DNS, domínios nem publicações. A preparação do
cartão Finance não comprova que seu domínio esteja operacional.

## Autenticação e cadastro

O formulário identifica os fatores que Clerk oferece para a conta. Só prepara
um código quando existe um fator `email_code` com identificador de e-mail.
Outros métodos, erros, MFA, CAPTCHA/Protect, verificações adicionais e tarefas
de sessão são encaminhados à interface nativa do Clerk. Somente uma resposta
`complete`, sem desafio pendente e com `createdSessionId` permite ativação.
Não foram alteradas configurações de segurança ou métodos do provedor.

As rotas de callback do Clerk, seu proxy e resolução por host são preservados.
Não se usa token Supabase como sessão. O cadastro continua no `BusinessSignUp`
e no componente Clerk `SignUp`; a normalização de e-mail não foi alterada.
O registro posterior continua no `PortalRegistration`, com consentimento
facultativo e `/api/leads/profile` protegido pelo servidor.

A seleção inicial de idioma não cobre o cartão de autenticação; continua
disponível nas páginas do portal.

## Verificação sem provedores

`npm run test:access` executa somente recursos sintéticos de Clerk, renderização
com hooks simulados, redirects e testes de captura com armazenamento/provedores
simulados. Não envia códigos reais, não consulta clientes, não executa análises
e não migra o banco.

Typecheck: `npx tsc --noEmit --incremental false`.
Compilação: `npm run build`.

O fluxo real com e-mail e MFA precisa de teste autorizado separado. Verificar
`email_code` nos métodos configurados do Clerk e preparar DNS/vínculo de domínio
Finance antes de usar esse endereço publicamente. Não habilitar métodos nem
publicar automaticamente.
