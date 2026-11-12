# Orçamento de renda variável no Invest

A tela privada `/investments/agents/equity-budget` calcula a referência em dólares
para um ativo. A tarifa vem do catálogo público da Nous, sem chave, carteira ou
dossiê. A consulta expira em 60 segundos. A referência arredonda para cima ao
milionésimo de dólar (US$ 0,000001) por chamada e soma os nove especialistas
(7.000 tokens de entrada e 400 de saída cada) e Rafael (12.000 e 1.000). Não há
repetições automáticas. Esses limites são a política proposta do fluxo novo, não
medição de prompts reais nem promessa de faturamento.

O exemplo usa dados e respostas fictícios e não grava no banco de produção.
O motor gera eventos de reserva e resultado por chamada, sem guardar prompts,
pareceres ou chaves na auditoria. Consumo desconhecido é gravado sem custo
inventado; estouro de limite registra o consumo recebido e para a rodada.
A migração 0019 e o adaptador permitem registrar esses eventos em banco;
o teste de integração usa um PostgreSQL local em memória.

Nenhuma rota real, botão de aprovação ou transporte de inferência foi habilitado.
A tabela de auditoria não é requisito da prévia e não é criada pelo Worker.
Para uma execução real futura são necessários o contador validado para o modelo,
tarifa efetiva e prova de aprovação vinculada ao ativo, dossiê, limites e versão
da tarifa, além do armazenamento durável de eventos e da validação do transporte
da Nous. A aprovação de um orçamento não pode ser inferida da consulta.
