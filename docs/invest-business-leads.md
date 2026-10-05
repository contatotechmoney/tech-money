# Cadastro empresarial e leads do Invest

O cadastro completo do Invest salva nome, e-mail primário verificado pelo Clerk, identificador da conta, origem `invest`, data original da conta e data da captura no **mesmo projeto Supabase do Coop**. A inscrição em conteúdos é facultativa, desmarcada por padrão e registrada separadamente.

## Limites de acesso e origem dos dados

- `/api/leads/profile` exige sessão Clerk real. O servidor busca a identidade no Clerk; nunca aceita e-mail, origem, data ou usuário informados pelo navegador.
- A etapa de conclusão pede o nome. Até ser concluída e gravada, o módulo Invest e suas APIs permanecem bloqueados.
- O e-mail primário deve ser verificado e possuir domínio próprio aceito pelo filtro. Provedores pessoais comuns e temporários conhecidos são recusados também no servidor, inclusive quando alguém contorna a tela ou entra por um provedor social.
- O filtro de domínios NÃO comprova vínculo empregatício ou existência da empresa e NÃO é uma lista completa de todos os provedores temporários do mundo. Pode ser atualizado em `shared/business-email.ts`.
- A tela preliminar de e-mail impede o fluxo normal com um provedor bloqueado, mas NÃO impede a criação de uma identidade diretamente no Clerk. Para recusar a criação da conta também no provedor, configurar a blocklist e bloqueio de descartáveis no Clerk. A blocklist exige plano pago em produção segundo a documentação atual; nenhuma contratação foi efetuada. O bloqueio de **uso do Invest** independe desse plano.
- Contas existentes com e-mail pessoal também não acessam o Invest por essa regra. Trocar o e-mail empresarial e verificá-lo no Clerk é necessário; não há exceção anônima.
- Nenhuma chamada a LLM, mudança de preço, concessão de saldo ou execução Hermes é adicionada por esta integração.

## Banco e segurança

Aplicar `sql/supabase_portal_leads.sql` no projeto Supabase do Coop (`kizyvhvbptllpqjaxldx`). A migração é transacional e idempotente; cria `techmoney_portal_leads` e RPCs acessíveis somente ao backend (`service_role`). Não concede permissões de leitura ou escrita a visitantes ou usuários autenticados do portal.

A tabela legada `leads` do Coop é preservada: inserir um contato Invest ali acionaria as regras de teste/assinatura do Coop. A visão administrativa `techmoney_leads_consolidados` reúne as origens por e-mail, sem servir como autorização de acesso. E-mail único e identificador Clerk único impedem duplicação. Não é permitido religar um e-mail a outra identidade por esta RPC; divergências precisam ser reconciliadas por um administrador.

A captura repetida atualiza nome/consentimento sem alterar o primeiro cadastro. A autorização para conteúdos possui data e versão (`invest-insights-v1`); a revogação retira esses campos. Este código não inscreve automaticamente o contato na newsletter institucional e não envia campanhas.

## Ativação — pendente

`INVEST_BUSINESS_LEADS_ENABLED` deve permanecer ausente/false enquanto a conexão não estiver configurada. A nova tela de pré-validação empresarial está no rascunho; a captura e o gate de uso do Invest só entram em vigor com o flag literalmente `true`. Uma vez ativado, falha no banco não libera acesso. O status desativado não retorna dados pessoais.

1. Aplicar e verificar a migração no Supabase real. A validação já executada usa PostgreSQL isolado em memória, sem dados reais.
2. Adicionar apenas no **Secrets do servidor Replit**:
   - `SUPABASE_LEADS_URL=https://kizyvhvbptllpqjaxldx.supabase.co`
   - `SUPABASE_LEADS_SERVER_KEY`: chave secreta `sb_secret_…` ou JWT legado `service_role` do mesmo projeto. Não usar `anon`, `sb_publishable`, variável `VITE_…`, arquivo versionado ou mensagem no chat. Uma chave de servidor tem permissões amplas; é preferível adicionar uma chave identificada para este servidor e manter acesso aos Secrets restrito.
3. Adicionar `INVEST_BUSINESS_LEADS_ENABLED=true` no servidor somente após verificar a conexão e completar a ativação. Configurar os controles de cadastro no Clerk quando disponíveis, sem adquirir plano pago automaticamente.
4. Configurar o Database Webhook Supabase **somente INSERT** em `public.techmoney_portal_leads`, apontando para o endpoint privado existente `/api/telegram-webhook` do Worker, com o cabeçalho privado já utilizado. O Worker deve receber primeiro a extensão que reconhece esta tabela. Não copiar o segredo para o navegador nem incluir valores em arquivos.
5. Integrar as mudanças ao código atual do Replit, preservar o proxy Clerk e publicar em deployment com servidor. O rascunho de conciliação PR #2 ainda não está publicado: não substituir o aplicativo por uma versão antiga de `main`.
6. Testar uma conta empresarial real autorizada: concluir nome sem opt-in, verificar um registro no Supabase e, após a configuração do webhook, a notificação Telegram. Repetir o acesso e confirmar que não houve novo registro/notificação. Nenhum teste de análise paga é necessário.

**Não publicar o gate antes de configurar o banco**: falhas de armazenamento respondem 503 e bloqueiam o módulo com opção de tentar novamente, em vez de informar sucesso falso.

## Validação executada

- 16 testes de API/identidade/domínios: sem sessão, e-mail pessoal/temporário, e-mail não verificado, tentativa de trocar identidade pelo payload, isolamento de usuários, repetição, opt-in explícito, indisponibilidade do banco e credenciais novas/legadas do Supabase.
- PostgreSQL isolado: migração reaplicada, gravação repetida/concorrente, conflito de e-mail, preservação do primeiro cadastro, data/versão do consentimento, consolidação Coop+Invest e negação de permissões a `anon`/`authenticated`.
- TypeScript dos novos componentes e serviço: passou. Build e teste visual da prévia dos novos componentes: passou.
- Não foi executado cadastro no Supabase real, integração de Telegram, teste de restrição na produção Clerk ou publicação desta alteração.

Fontes técnicas: [Clerk — restrições](https://clerk.com/docs/guides/secure/restricting-access), [Supabase — API keys](https://supabase.com/docs/guides/getting-started/api-keys).
