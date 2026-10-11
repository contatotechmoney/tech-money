# Ação de vínculo exclusivo — preparada, não publicada

## Escopo

A tela existente `/investments/portfolio/pilot/confirm-account` ganha uma
confirmação separada do diagnóstico. Não há migração, novo segredo, alteração de
DNS, troca de credenciais, modelo escolhido ou habilitação de inferência.
A referência privada de produção e seu valor não fazem parte desta revisão.

Consultar a conta não cria vínculo. Somente após conferir oficialmente sessão,
e-mail principal e correspondência da conta, o proprietário pode marcar o
consentimento e selecionar **Confirmar vínculo exclusivo**. Esse consentimento
não aprova orçamento, análise, compartilhamento de carteira ou gasto.

## Verificação no servidor

- A identidade vem do Clerk autenticado, nunca de nome, e-mail fornecido,
  primeira conta, parâmetro de URL ou campo do navegador.
- O servidor compara o sujeito autenticado à referência privada previamente
  configurada pelo operador, somente em produção.
- O POST exige JSON estrito `{confirmExclusiveOwner:true}`, origem HTTPS
  igual ao Host e, quando presente, Fetch Metadata `same-origin`.
- Sessão ativa, sujeito e e-mail principal verificado são reconferidos no serviço
  oficial na solicitação de gravação. O procedimento transacional os reconfere
  antes de acessar o banco. Consultas oficiais têm tempo limitado, sem repetir
  automaticamente chamadas.
- As respostas não incluem identificadores, e-mails, hashes, cookies ou chaves.
  Erros internos do provedor/banco são ocultados, mas falhas permanecem explícitas.

## Persistência

GET `/api/investments/portfolio-pilot/account-binding` apenas lê o estado da
conta correspondente, após os mesmos controles oficiais.

POST no mesmo caminho usa as tabelas e restrições já existentes. Preserva
singleton, ambiente, método oficial, histórico e revogação. Não substitui outra
conta e não reativa vínculo revogado.

Uma transação com bloqueio consultivo e de linha protege múltiplas instâncias.
Cliques concorrentes também são recusados durante a verificação oficial.
Repetir a confirmação com a mesma identidade/sessão não duplica eventos nem
incrementa novamente a revisão da conta. A ausência da auditoria durável impede
sucesso e não é reparada silenciosamente.

## Validação executada

`npm run validate:synthetic`: **410 testes aprovados**, zero falhas/ignorados:
70 básicos, 48 de banco descartável, 101 de qualidade, 144 de Invest/piloto
e 47 de acesso. Inclui typecheck.

Foram acrescentados 22 testes: 16 de API, três de apresentação e três de banco;
uma asserção adicional verifica idempotência do vínculo já coberto anteriormente.
Incluem origem externa, consentimento ausente, campos adicionais, outra conta,
produção versus desenvolvimento, sessão revogada/divergente, e-mail não
verificado ou secundário, timeout, concorrência, reabertura e auditoria ausente.

O percurso HTTP → serviços Clerk falsos → transação PostgreSQL descartável →
leitura posterior foi exercitado, inclusive recusa após revogação.
Identidades e dados são inteiramente sintéticos; serviços e sessões reais não
foram usados. Nenhuma chamada de inferência, envio ou cobrança é habilitada.

`npm run build` aprovado; permanece o aviso de tamanho de bundle preexistente.
Prévia móvel carregou sem erro de aplicação, mas sem autenticação real e com o
seletor inicial de idioma. Os estados autenticados foram conferidos por
renderização SSR e testes HTTP sintéticos, não por sessão real no navegador.

## Antes de usar em produção

Esta implementação ainda requer revisão e publicação oficial. Essa publicação
também deve carregar a referência de produção já configurada, sem copiá-la para
GitHub ou desenvolvimento. Não copiar dados de desenvolvimento sobre produção.
Depois, o proprietário usa a tela autenticada e confirma somente o vínculo.

O código mantém `REAL_PORTFOLIO_PILOT_ENABLED=false`, independentemente do
vínculo. Nenhuma execução automática é iniciada. Modelo, tarifa autenticada,
tokenizer, mercado verificado e executor permanecem sujeitos à validação
própria. Cada análise futura continua exigindo orçamento específico, aprovação,
reserva prévia e revalidação; o vínculo não substitui essas condições.
