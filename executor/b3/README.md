# Orçamento técnico compartilhado — núcleo offline

`budget.py` é a primeira peça do executor dedicado, não um serviço Hermes ativo. Não contém adaptador LLM, coleta de dados ou API pública e não está conectado à carteira do portal. Nenhum comando deste diretório chama modelos ou bancos de clientes.

## O que está implementado

- SQLite persistente, transações `BEGIN IMMEDIATE` e conexões independentes por operação.
- Política imutável por execução: provedor, modelo, versão de preços, teto de custo/tokens/chamadas, concorrência e prazo.
- Reserva prévia conservadora do custo máximo de entrada + saída. Preços são inteiros em micros de dólar por milhão de tokens; não há preço real embutido nem desconto presumido de cache.
- Idempotência por job/chamada e impressão digital do conteúdo/opções; divergências são rejeitadas.
- Apenas um dispatcher pode reivindicar a mesma chamada. Reservar novamente não autoriza reenviar.
- Consumo confirmado libera somente a diferença entre reserva e usage real. Raciocínio cobrado precisa estar incluído no total de saída do adaptador.
- Timeout ou usage ausente conserva a reserva máxima e impede novas chamadas da análise. Outras chamadas já enviadas podem terminar e continuam reservadas.
- Recuperação operacional após reinício marca envios em andamento como incertos, sem refund ou reenvio automático.
- Uso acima do limite declarado pelo provedor registra o consumo observado e interrompe chamadas subsequentes. Isso detecta uma violação, não desfaz a cobrança já realizada.
- Histórico de eventos protegido contra UPDATE/DELETE. O ledger técnico é distinto do histórico comercial de créditos.

## Contrato obrigatório do adaptador futuro

1. Criar job com ID técnico obtido da solicitação do portal e política validada no servidor. Nenhum endpoint público deve aceitar um job/cliente arbitrário como prova de identidade.
2. Contar toda a entrada com método validado para o modelo, incluindo instruções, ferramentas, contexto e overhead. Hash SHA-256 deve abranger conteúdo e opções de geração; chaves nunca entram no conteúdo armazenado.
3. Chamar `reserve`, depois `claim_dispatch`. Somente um retorno `True` permite I/O. A chamada usa o modelo/provedor fixados na política e envia teto de saída ao provedor; não aceita fallback ou delegação recursiva não contabilizados.
4. Verificar prazo antes de enviar e aplicar timeout/cancelamento no transporte. O prazo do ledger bloqueia novos envios, mas não cancela HTTP ou interrompe uma execução remota já iniciada.
5. Registrar usage autoritativo e integral em `settle`; erro/timeout/usage ausente → `uncertain`. Se o próprio ledger ficar indisponível após o envio, parar o agendamento. Não interpretar ausência de usage como zero.
6. Após takeover exclusivo do worker, `quarantine_inflight` conserva chamadas incertas. Não executar esse procedimento em paralelo com um worker ativo. Uma lease durável e reconciliação com IDs do provedor ainda precisam ser implementadas.

## Limitações de ativação

Este núcleo não oferece teto financeiro global entre jobs (a reserva global existente é do portal), bloqueio de ferramentas externas, autenticação, lease de worker, retentativa remota idempotente, tokenização, rate card verificado ou cancelamento de provedor. Todos os agentes e ferramentas devem ser conectados ao ledger para ele controlar a análise. Não reutilizar a Runs API geral do Hermes supondo que os filhos herdem este orçamento.

SQLite é adequado ao piloto de worker dedicado em uma máquina, com arquivo em disco persistente e privado. Workers em múltiplas máquinas exigem banco central transacional, sem compartilhar SQLite por volume de rede. A aplicação não deve expor o arquivo, IDs ou política interna aos clientes.

`settle` é uma operação de um adaptador confiável ou operador, não um endpoint de cliente. Só pode liberar saldo com dados realmente verificados. Seu registro não confirma qualidade da análise, consenso, suitability ou aprovação profissional.

Não há mecanismo automático para retomar jobs interrompidos. Preços/modelo/teto monetário do piloto continuam indefinidos. Antes de ativar: adaptador único aprovado, teto efetivo no provedor, contagem de tokens verificada, todas as ferramentas contabilizadas ou bloqueadas, reconciliação e revisão do fluxo B3. O Hermes pessoal permanece intacto.

## Testes sem custo

```bash
python3 -m unittest discover -s executor/b3 -p 'test_*.py' -v
```

15 testes em bancos descartáveis: concorrência entre conexões, idempotência, mudança de payload/política, teto conjunto, tokens, chamadas, paralelismo, prazo, estorno da diferença, ausência de usage, restart, overrun e histórico imutável. Preços/modelos sintéticos; nenhuma rede ou chave.


## Nous: identificação e contrato offline de resposta

O usuário confirmou em 4 de outubro de 2026 o provedor `nous` e o nome apresentado `Nous/Deepseek4.1-Flash`. O identificador de API exato e a tarifa da conta não foram confirmados; nenhum preço da API direta DeepSeek foi adotado. A documentação oficial descreve o Nous como gateway faturado pela assinatura e mostra `https://inference-api.nousresearch.com/v1` como base de inferência. Isso não confirma limites financeiros por chave ou o uso comercial do plano contratado. Fonte: https://hermes-agent.nousresearch.com/docs/integrations/nous-portal .

`response_contract.py` valida somente envelopes simulados compatíveis com OpenAI e reconcilia respostas de um adaptador confiável. Não faz HTTP, login, dispatch ou leitura de credenciais. Exige o modelo fixado, usage integral e totais consistentes. Raciocínio informado como decomposição da saída não é somado novamente nem retornado no resultado. Usage/modelo inválido mantém reserva e interrompe o job. Saída truncada ou pedido de ferramenta contabiliza usage, mas não é entregue como estudo completo. Isso não certifica a contabilização Nous: contrato real e todos os custos devem ser verificados antes da ativação.

22 testes offline aprovados, incluindo 7 de validação/reconciliação de resposta. Transporte, OAuth de serviço isolado, tokenizador, identificação de requests, tarifas verificadas, teto no provedor, integração portal e scheduler multiagente continuam pendentes.
