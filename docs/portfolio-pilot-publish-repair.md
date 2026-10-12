# Correção da migração oficial do piloto

## Causa e correção

O diff oficial anterior transformava a condição abreviada `CHECK (singleton)`
em `CHECK (CHECK (singleton))`. O PostgreSQL descartável reproduziu o erro de
sintaxe `42601` com os statements originais, sem reescrever seu conteúdo.

O esquema agora usa `singleton = true`. A chave primária booleana continua
limitando a tabela a um único registro e o CHECK continua rejeitando `false`.
`NULL` continua proibido. Ambiente, evidência e método oficial não mudaram.

A migração histórica `0017` foi preservada. A nova `0018` substitui somente a
restrição equivalente, atomicamente, em desenvolvimento. Não altera registros,
identidades, autorizações, configurações ou flags. Não há DDL em startup/build
nem executor de migração direcionado à produção.

O comando CLI terminou sem erro, mas a conferência física ainda mostrou a
condição antiga no banco consultado pelo serviço de publicação. Por isso, a
mesma migração revisada foi aplicada através do serviço oficial SQL, explicitamente
no ambiente **development**. A definição física passou a `CHECK ((singleton = true))`.
Um exit code de sucesso não foi tratado como comprovação de aplicação.

## Diff oficial exato

`docs/evidence/portfolio-pilot-publish-diff.json` contém os statements originais
inválidos e os quatro statements corrigidos, exatamente como retornados pelo
serviço oficial `explainSchemaDiff`. O conteúdo capturado foi comparado byte a
byte com a resposta do serviço, sem corrigir manualmente o SQL produzido.

SHA-256 de `JSON.stringify(statementsToExecute)`:
`a63c288b769300e31cb1568072c88c7f25f2f4b1cf9fd9f90321f5eff12d3068`.

A captura corrigida foi executada literalmente, na ordem capturada, no `public`
de um banco vazio de um cluster PostgreSQL descartável, sem substituir schema,
referências, nomes ou statements:

1. Criar `portfolio_pilot_audit`.
2. Criar `portfolio_pilot_accounts`.
3. Criar `portfolio_pilot_owner_bindings`.
4. Acrescentar a FK de auditoria para a conta.

O gerador pode variar a ordem dos três CREATE independentes; a FK é posterior
às tabelas. A captura não contém DROP, TRUNCATE, INSERT, UPDATE, DELETE ou COPY
como operações de migração. `ON DELETE/UPDATE no action` é a política da FK,
não uma operação de exclusão/atualização. Todas as listas de remoção estão vazias,
sem perda estrutural ou incompatibilidade sinalizada.

## Validação realizada

`npm run validate:synthetic`: **388 aprovados**, zero falhas/ignorados
(70 base + 45 banco + 101 qualidade + 125 Invest/piloto + 47 acesso).
`npm run build`: aprovado, mantendo somente o aviso anterior de bundle grande.

Os 16 novos testes comprovam captura/checksums, falha original, SQL corrigido,
singleton false/NULL/duplicado inclusive após revogação, ambiente inválido,
evidência curta/longa/ausente, método não oficial, defaults, FK, revisão e índice
negativos, unicidade de auditoria, bloqueio global e preservação integral de
conta/auditoria/vínculo sintéticos ao aplicar a nova migração ao esquema antigo.

O teste recusa qualquer conexão que não seja o cluster privado, sem TCP, criado
pelo wrapper sintético. Não copia dados de desenvolvimento/produção e não usa
identidades, carteiras, provedores ou credenciais reais.

## Retomada oficial

A produção foi consultada somente por leitura durante o reparo. As três tabelas
continuam ausentes. Não houve nova publicação nem alterações em produção.

Retomar a publicação oficial autorizada após revisar este diff: somente adicionar
as três tabelas e a FK. **Não selecionar opção de copiar/sobrescrever dados de
desenvolvimento sobre produção**. Se aparecer qualquer remoção, cópia de dados
ou alteração adicional, interromper e revisar o novo plano antes de continuar.

A tabela de vínculo nasce vazia, sem concessão automática. A comprovação oficial,
e-mail principal verificado e vínculo exclusivo ainda são etapas separadas.
`REAL_PORTFOLIO_PILOT_ENABLED` continua `false`; cada futura análise exige orçamento
específico aprovado, reserva prévia e todos os pré-requisitos do executor.
Não houve inferência, tokens pagos, envio de carteira, mensagens ou movimentação
de créditos. Tarifas, tokenizer e mercado reais não foram habilitados neste reparo.
