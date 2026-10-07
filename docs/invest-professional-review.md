# Revisão profissional do Invest

Honorários pagos pelo cliente, sem comissão de produtos.

## Quem pode revisar

Uma sessão autenticada do Clerk **não** concede acesso profissional ou administrativo. Nenhuma conta é promovida pelo nome, e-mail, ordem de cadastro, propriedade do projeto, vínculo anterior ou metadados enviados pelo navegador.

O módulo tem **um único consultor: o proprietário**, identificado explicitamente pelo ID Clerk no cadastro protegido `investment_review_professional`. Não há cadastro de equipe. Sua habilitação deve ter referência verificável, operador responsável pela verificação, data não futura e prazo vigente, sem revogação. Além disso, somente uma atribuição explícita e ativa para cada cliente permite consultar relatórios e questionário desse cliente e registrar decisões. A autorização não dá acesso à carteira, transações, credenciais ou contratos. Autoaprovação é proibida.

## Quem pode administrar atribuições

Somente IDs Clerk cadastrados explicitamente em `investment_assignment_administrators`, sem revogação, podem administrar. Ser consultor não basta; ser administrador não concede acesso aos relatórios nem poder de aprovação. O proprietário só terá acesso administrativo se houver uma concessão administrativa explícita. O cadastro inicial de administradores e a verificação/renovação da habilitação permanecem com o operador confiável já autorizado a administrar o banco; **não há endpoint para promover administradores, trocar o consultor ou validar sua própria habilitação**.

A migração `0013_investment_assignment_management` cria esses cadastros **vazios**, sem inferir IDs nem converter atribuições antigas em habilitação. Assim, até a ativação explícita, acessos profissionais existentes também ficam bloqueados. Os registros e decisões antigos são preservados, sem fabricação de histórico retroativo.

Após esse cadastro inicial, a rotina de conceder/revogar vínculos deixa de exigir acesso ao banco:

- `/investments/assignments`: navegação somente para administradores autorizados. ID conhecido do cliente digitado manualmente, sem diretório de clientes ou consulta a seus dados financeiros.
- `GET /api/investments/assignment-management`: consultor responsável, situação da habilitação e metadados dos vínculos, inclusive revogados.
- `POST /api/investments/assignment-management/grant` e `/revoke`: somente `{clientId, reason, expectedGrantId}`; motivo obrigatório entre 10 e 4.000 caracteres. `expectedGrantId: null` apenas para vínculo inexistente; revogação e nova concessão usam a geração lida no estado atual. Identidade administrativa vem exclusivamente da sessão. A interface exige confirmação explícita da revogação.
- `GET /api/investments/assignment-management/clients/:clientId/history`: últimos 200 eventos daquele cliente, somente para administradores. Não há endpoint para editar ou apagar a auditoria. Todo evento guarda responsável, cliente, consultor, ação, motivo, geração e datas, além da referência/validade da habilitação disponível naquele momento.
- A concessão exige consultor habilitado e rejeita autoatribuição. A revogação continua possível se a habilitação estiver ausente, vencida ou revogada, inclusive para vínculos legados.
- Concessão/revogação e auditoria são uma transação única: falha ao gravar auditoria desfaz a alteração. Solicitações concorrentes e formulários antigos são rejeitados com conflito, sem duplicar ações bem-sucedidas; a interface permite atualizar o estado antes de repetir.

Um administrador deve confirmar a identidade Clerk e a relação de atendimento do cliente antes da concessão. Não basta um apelido ou e-mail. O sistema não consulta o diretório de autenticação para verificar a identidade digitada: a conferência operacional do ID é obrigatória, e o servidor só permite revisar documentos do cliente vinculado.

Revogar marca `revoked_at`. Nova concessão renova automaticamente `granted_at` e `grant_id`: decisões anteriores não voltam a valer. Revisões em andamento ficam vinculadas à geração consultada e são rejeitadas se uma revogação/nova concessão ocorreu antes da gravação. Não excluir autorizações referenciadas por histórico. A ausência de habilitação vigente bloqueia também a exibição/entrega de recomendações antes aprovadas.

### Ativação pelo operador confiável (não executada em desenvolvimento)

1. Obter autorização explícita para aplicar as migrações no ambiente correto. Não usar dados/contas reais para validar desenvolvimento.
2. Confirmar por fonte independente o ID Clerk do proprietário, sua habilitação profissional e o prazo de nova verificação. Registrar os dados reais somente no ambiente autorizado. Não preencher com valores presumidos.
3. Cadastrar explicitamente cada administrador aprovado, com operador responsável e motivo. O mesmo proprietário pode ser administrador, mas precisa desse cadastro separado.
4. Conferir com conta de teste autorizada que não administradores recebem 403, que o consultor sem atribuição não consulta relatórios, e que a auditoria acompanha cada ação.
5. Somente então usar a tela operacional para atribuições. Para retirar um administrador, preencher seu `revoked_at`; para suspender o consultor, preencher `revoked_at` no cadastro profissional. O servidor consulta os cadastros a cada operação e impede concessões/revisões depois da suspensão.

Modelo parametrizado para o operador (placeholders, **não** executar sem a aprovação e as identidades conferidas):

```sql
INSERT INTO investment_review_professional
  (reviewer_id, credential_reference, verified_by, verified_at, valid_until)
VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz);
-- $1: ID Clerk confirmado do proprietário; $2: referência da verificação
-- $3: operador confiável; $4: data efetiva da verificação; $5: validade aprovada.

INSERT INTO investment_assignment_administrators (user_id, provisioned_by, reason)
VALUES ($1, $2, $3);
-- ID administrativo aprovado, operador responsável e motivo.
```

Renovar a habilitação exige nova verificação e atualização pelo operador confiável; não é uma ação oferecida ao administrador de vínculos. Não substituir a identidade do consultor para contornar revogações.

## Fluxo

- A navegação “Revisão profissional” aparece somente quando há clientes atribuídos. A autorização é conferida novamente pelo servidor em cada consulta ou decisão.
- O consultor consulta análise, fontes, risco, datas, respostas do questionário e histórico; registra aprovação ou rejeição, justificativa e, para aprovar, recomendação escrita pelo próprio consultor.
- Identidade vem da sessão, nunca do formulário. Cada decisão guarda cliente, relatório, hash do conteúdo, hash do perfil, data e motivo.
- As decisões são imutáveis; correções, rejeições posteriores e novas aprovações são novos registros. A decisão mais recente vale apenas para a versão e autorização correspondentes.
- O cliente vê a recomendação individualizada somente quando todos os controles atuais e a revisão aprovam. Perfil ou relatório alterado, revogação, data vencida ou nova tentativa de análise invalidam sua liberação.
- Perfil suficiente exige respostas completas e coerentes, pontuação/classificação consistentes, avaliação não futura, prazo vigente e risco compatível. Termo de ciência nunca substitui adequação.
- Análise completa exige nove agentes, nenhum faltante, consenso e risco válidos, cotação/variação finitas, fonte identificada e datas verificáveis. Documento e dados de mercado têm validade de seis horas; fundamentos não podem ser futuros ou ter mais de 366 dias. Esse limite é uma regra conservadora do aplicativo, não declaração de prazo regulatório.
- Risco acima de 8,5 ou veto da análise impede aprovação e entrega. Documentos históricos ou de qualidade não verificável são sempre informativos.
- A fila vincula a solicitação à decisão profissional específica. Antes do provedor, o trabalhador relê documento, perfil, decisão e autorização; filas antigas sem revisão ou com decisão substituída falham sem enviar.

## Desenvolvimento e ativação

Não houve publicação, migração do banco existente, consulta a clientes reais ou concessão real. Aplicar as migrações revisadas e provisionar os cadastros iniciais é uma etapa operacional posterior, com permissão explícita. Até isso ocorrer, falhas de consulta mantêm o fluxo fechado, sem liberação silenciosa.

O trabalhador automático de entregas roda somente em produção. A prévia não consulta filas nem chama provedores em segundo plano.

Execute `npm run test:quality` para testes sem banco e `npm run validate:synthetic` para validar compilação, regressões e persistência em PostgreSQL temporário. O segundo comando cria seu próprio banco em `/tmp`, sem listener TCP, remove credenciais de provedores do processo filho e elimina apenas esse banco ao terminar. Não usa o banco da aplicação. `npm run test:review-db` recusa execução fora desse ambiente isolado.