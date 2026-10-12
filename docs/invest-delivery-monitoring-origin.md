# Origem do monitoramento e suspensão nesta fase

## O que foi comprovado

Inspeção do histórico Git local e do código, sem consultar registros de clientes:

- `604b0bc`, 2026-09-13: introdução da fila de entrega e acompanhamento de status
  neste repositório (`server/report-delivery.ts` e migrações de processamento).
- `8936e82`, 2026-10-03: adição de `reconcileUnconfirmedReportDeliveries`,
  consulta de confirmações vencidas e chamada dentro do worker.
- `1a3e334`, 2026-10-06: persistência/reconciliação de confirmações antecipadas.
- Antes desta correção, `server/index.ts` iniciava o worker quando
  `NODE_ENV === "production"`, sem verificar domínio ou um portal específico.
- As consultas apontadas nos erros eram feitas por
  `flagUnconfirmedReportDeliveries` e `pruneReportDeliveryProviderEvents`, sobre
  `confirmation_overdue_at` e `report_delivery_provider_events`.

Essas referências são evidências do histórico local; não demonstram uma
vinculação exclusiva dos registros a um domínio ou portal antigo. O módulo está
neste servidor de Invest. Não foi encontrado um identificador de portal que
comprove a hipótese do proprietário. **Origem exata do portal permanece incerta.**

## Decisão explícita do proprietário

O monitoramento de entregas anteriores é dispensável nesta fase de simulação.
A suspensão é deliberada, independentemente de comprovar ou não o portal de origem:

- A inicialização em produção não chama o worker.
- Uma chamada direta ao worker não cria timer nem executa trabalho inicial.
- A reconciliação retorna antes de consultar armazenamento.
- Não há claim de filas, limpeza de eventos ou alertas automáticos.
- O componente de histórico de entregas não inicia consulta, polling ou
  atualização ao focar a janela; apresenta aviso de suspensão, não uma lista
  artificialmente vazia.
- Endpoints manuais existentes e validação de webhooks não são inicializadores
  de jobs; a autorização e os registros foram preservados.

Não foram apagados registros, aplicada migração, alterado banco, DNS, secrets ou
permissões. As definições de armazenamento permanecem para uma eventual fase
futura explicitamente autorizada. Aprovação profissional, ambiente de produção
ou provedor configurado não reativam essas rotinas nesta versão.

Os erros de monitoramento pertencem à versão ainda publicada. Esta correção
impede os caminhos automáticos após sua publicação autorizada; não afirma que
a versão pública foi modificada nesta etapa.
