# Cadastro e leads de pessoas físicas do Invest

O cadastro completo do Invest salva nome, e-mail primário verificado pelo Clerk, identificador da conta, origem `invest`, data original da conta e data da captura no **mesmo projeto Supabase do Coop**. A inscrição em conteúdos é facultativa, desmarcada por padrão e registrada separadamente.

## Identidade e acesso

O Invest atende principalmente pessoas físicas. E-mails pessoais e profissionais são aceitos. Não configurar blocklist empresarial no Clerk. O nome técnico shared/business-email.ts permanece por compatibilidade, mas exige apenas endereço válido e verificação pelo Clerk.

O servidor obtém a identidade do Clerk, exige e-mail primário verificado e cadastro concluído. Nome e consentimento são os únicos dados fornecidos pelo navegador; usuário, e-mail e datas vêm do servidor. Nenhuma chamada a LLM ou concessão de créditos é adicionada.

## Banco e segurança

Aplicar `sql/supabase_portal_leads.sql` no projeto Supabase do Coop (`kizyvhvbptllpqjaxldx`). A migração é transacional e idempotente; cria `techmoney_portal_leads` e RPCs acessíveis somente ao backend (`service_role`). Não concede permissões de leitura ou escrita a visitantes ou usuários autenticados do portal.

A tabela legada `leads` do Coop é preservada: inserir um contato Invest ali acionaria as regras de teste/assinatura do Coop. A visão administrativa `techmoney_leads_consolidados` reúne as origens por e-mail, sem servir como autorização de acesso. E-mail único e identificador Clerk único impedem duplicação. Não é permitido religar um e-mail a outra identidade por esta RPC; divergências precisam ser reconciliadas por um administrador.

A captura repetida atualiza nome/consentimento sem alterar o primeiro cadastro. A autorização para conteúdos possui data e versão (`invest-insights-v1`); a revogação retira esses campos. Este código não inscreve automaticamente o contato na newsletter institucional e não envia campanhas.

## Ativação — pendente

`INVEST_BUSINESS_LEADS_ENABLED` deve permanecer ausente/false enquanto a conexão não estiver configurada. A nova tela de cadastro está no rascunho; a captura e o gate de uso do Invest só entram em vigor com o flag literalmente `true`. Uma vez ativado, falha no banco não libera acesso. O status desativado não retorna dados pessoais.

1. Aplicar e verificar a migração no Supabase real. A validação já executada usa PostgreSQL isolado em memória, sem dados reais.
2. Adicionar apenas no **Secrets do servidor Replit**:
   - `SUPABASE_LEADS_URL=https://kizyvhvbptllpqjaxldx.supabase.co`
   - `SUPABASE_LEADS_SERVER_KEY`: chave secreta `sb_secret_…` ou JWT legado `service_role` do mesmo projeto. Não usar `anon`, `sb_publishable`, variável `VITE_…`, arquivo versionado ou mensagem no chat. Uma chave de servidor tem permissões amplas; é preferível adicionar uma chave identificada para este servidor e manter acesso aos Secrets restrito.
3. Adicionar `INVEST_BUSINESS_LEADS_ENABLED=true` no servidor somente após verificar a conexão e completar a ativação. Não bloquear provedores pessoais no Clerk.
4. Configurar o Database Webhook Supabase **somente INSERT** em `public.techmoney_portal_leads`, apontando para o endpoint privado existente `/api/telegram-webhook` do Worker, com o cabeçalho privado já utilizado. O Worker deve receber primeiro a extensão que reconhece esta tabela. Não copiar o segredo para o navegador nem incluir valores em arquivos.
5. Integrar as mudanças ao código atual do Replit, preservar o proxy Clerk e publicar em deployment com servidor. O rascunho de conciliação PR #2 ainda não está publicado: não substituir o aplicativo por uma versão antiga de `main`.
6. Testar uma conta real autorizada: concluir nome sem opt-in, verificar um registro no Supabase e, após a configuração do webhook, a notificação Telegram. Repetir o acesso e confirmar que não houve novo registro/notificação. Nenhum teste de análise paga é necessário.

**Não publicar o gate antes de configurar o banco**: falhas de armazenamento respondem 503 e bloqueiam o módulo com opção de tentar novamente, em vez de informar sucesso falso.

## Validação executada

- 17 testes de API/identidade/domínios: sem sessão, e-mail pessoal aceito, e-mail não verificado, tentativa de trocar identidade pelo payload, isolamento de usuários, repetição, opt-in explícito, indisponibilidade do banco e credenciais novas/legadas do Supabase.
- PostgreSQL isolado: migração reaplicada, gravação repetida/concorrente, conflito de e-mail, preservação do primeiro cadastro, data/versão do consentimento, consolidação Coop+Invest e negação de permissões a `anon`/`authenticated`.
- TypeScript dos novos componentes e serviço: passou. Build e teste visual da prévia dos novos componentes: passou.
- Não foi executado cadastro no Supabase real, integração de Telegram, teste de restrição na produção Clerk ou publicação desta alteração.

Fontes técnicas: [Clerk — restrições](https://clerk.com/docs/guides/secure/restricting-access), [Supabase — API keys](https://supabase.com/docs/guides/getting-started/api-keys).
