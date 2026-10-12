---
name: Delivery monitoring boundaries
description: Safety rationale for monitoring sends whose provider confirmation has not arrived.
---

Uma confirmação ausente exige um alerta, não um reenvio automático nem uma falha presumida. Manter o histórico do alerta mesmo quando a confirmação chega depois.

**Why:** Um webhook perdido não comprova que a mensagem deixou de chegar; reenviar pode duplicar a análise recebida e declarar falha pode contradizer a entrega real.

**How to apply:** Ao ampliar a reconciliação, distinguir falta de confirmação de falha confirmada pelo provedor e manter os estados finais imutáveis.

Monitorar envios anteriores independentemente da autorização para novas recomendações.

**Why:** O bloqueio de segurança da revisão profissional protege novos envios; não deve esconder solicitações já enviadas que precisam de acompanhamento.

**How to apply:** Não colocar o monitoramento de confirmações atrás do bloqueio de novas recomendações nem reabrir a fila de envio para permitir a reconciliação.

Nesta fase de simulação de Invest e Finance, todos os envios reais de relatórios
devem permanecer bloqueados, mesmo com aprovação válida ou provedor configurado,
inclusive em segundo plano. Preservar acesso a relatórios existentes e captura
de leads.

**Why:** O proprietário identificou que uma aprovação válida ainda permitia envio
real por solicitação ou rotina de segundo plano e exigiu o bloqueio nesta fase.

**How to apply:** Não interpretar aprovação profissional ou configuração de
provedor como autorização para reativar entregas durante a simulação. Uma mudança
de fase exige nova instrução explícita; não confundir monitoramento passivo com envio.

Exceção explícita para esta fase: o proprietário considera dispensável o
monitoramento de entregas antigas e pediu a suspensão das rotinas automáticas
e da reconciliação, sem consultas em segundo plano ou remoção dos registros.
A atribuição exclusiva ao portal antigo é uma hipótese, não um fato comprovado.

**Why:** O proprietário pediu verificar a origem antes de afirmar que é do portal
antigo e autorizou a desativação deliberada mesmo se a origem exata permanecer incerta.

**How to apply:** Nesta fase manter suspensos os workers, a reconciliação e o polling
automático de entregas. Preservar registros, leitura de relatórios e leads; não
criar migrações para esses recursos. A regra geral de monitoramento independente
de aprovação volta a valer apenas se uma fase futura autorizar a reativação.

Para confirmações antecipadas, preferir recusar novos eventos quando a retenção estiver cheia a expulsar confirmações já aceitas.

**Why:** Um evento sem vínculo pode ser uma confirmação legítima de um envio ainda em andamento. Expulsá-lo depois de responder sucesso impede o provedor de tentar novamente.

**How to apply:** Manter a admissão e o vínculo sincronizados entre processos. A serialização global foi escolhida para garantir o limite total; se o volume exigir outra estratégia, preservar essa garantia.