# Comitê de Carteira Completa — piloto de pré-execução

> Registro da preparação inicial. O avanço atual de persistência, executor e
> catálogo oficial está em [portfolio-pilot-executor.md](portfolio-pilot-executor.md).
> As limitações abaixo descrevem o estado anterior, não a implementação atual.

## Estado da preparação inicial

Preparação exclusivamente do proprietário, **fechada no servidor**: ainda não
existe vínculo inequívoco com um identificador autenticado Clerk. Nome de
exibição, primeira conta, dados enviados pelo navegador e permissões de revisão
profissional não constituem esse vínculo. Nenhuma permissão foi concedida.

`/investments/portfolio/pilot` mostra os bloqueios e mantém a demonstração fictícia
separada em `/investments/portfolio/simulation`. A API de status exige autenticação;
as APIs de posições, orçamento, aprovação e execução negam acesso enquanto o
vínculo estiver ausente. Nem posições nem cotações são consultadas nesse estado.
Execução permanece incondicionalmente desabilitada mesmo com orçamento/aprovação.

## Motor e modelos: o que não foi integrado

A inspeção do notebook **relatada pelo usuário** identificou motor Python,
dossiê/relatório, yfinance, arquivos pessoais e SQLite com caminhos locais.
Esta tarefa não abriu nem copiou o notebook, posições pessoais ou credenciais.
Não há executor conectado ao portal, nem conexão validada. Concentração,
correlação, drawdown, VaR e beta desse motor não foram portados nem validados aqui.
Pesos iguais usados no notebook na ausência de quantidades não são posições reais
e não podem ser usados pelo piloto.

Referências de configuração fornecidas pelo usuário, **não opções de preço verificadas**:
- Hermes principal: Nous `deepseek/deepseek-v4-flash`.
- Perfil `consultor-de-investimentos`: Nous `z-ai/glm-5.2`.

Nenhuma configuração foi alterada. O catálogo operacional permanece vazio.
Entradas distintas chamadas DeepSeek V4.1 Flash não serão escolhidas pelo nome:
é necessário confirmar entrada exata, provedor, model ID, versão de tarifa, fonte,
moeda USD, taxas de entrada/saída e prazo de validade. Não há tarifa presumida,
conversão BRL/USD presumida ou chamada à Nous nesta preparação.

## Contrato implementado

Quando houver vínculo explícito e revisão posterior:
1. Leitura de snapshot da própria conta, filtrada no servidor, **sem utilizar**
   `/api/investments/portfolio` (que atualmente também busca cotações).
2. Seleção/conferência de ativos e quantidades. Apenas IDs de posições são
   aceitos do cliente; o servidor relê o snapshot. Quantidade ausente/zero/inválida
   bloqueia o orçamento; não existe substituição por pesos iguais.
3. Escolha por chave única de modelo/tarifa verificados, nunca nome ambíguo.
4. Orçamento com revisão crescente, ID próprio, fingerprint, expiração de até
   **120 segundos**, abreviada pela validade de mercado/tarifa. O teto solicitado
   pelo usuário pode apenas reduzir o teto do servidor, não declarar custo/saldo.
5. Resumo de compartilhamento futuro: ativos/quantidades selecionados, dados de
   mercado verificados e resultados derivados; provedor/modelo identificados.
   Sem nome, contato, identidade da conta, arquivos pessoais ou credenciais.
   **Nada é compartilhado nesta etapa.**
6. Aprovação explícita separada vinculada a ID/fingerprint da carteira, modelo,
   preços, limites e orçamento. Mudanças de qualquer posição do snapshot,
   revisão/custo das posições, mercado ou tarifa tornam a aprovação inutilizável.
   Mudanças na interface descartam orçamento/aprovação locais; servidor revalida.

Limites preparatórios conservadores, **não autorização de gasto**:
- 6 chamadas; 18.000 tokens de entrada + 6.000 de saída no estudo inteiro.
- 90 segundos totais; zero repetições automáticas.
- Teto máximo de USD 1,00, configurado no servidor; custo em micros inteiros,
  calculado exclusivamente de tarifa verificada e limites de tokens.
- Idempotência por conta/chave de solicitação; aprovação repetida não duplica
  auditoria; uma reserva ativa por conta; transações serializadas para concorrência.

Faltando modelo/preço, mercado verificado, executor ou auditoria persistente,
nenhum orçamento é emitido. **Todos os orçamentos desta fase são não executáveis.**
As reservas internas não são API de consumo nem dispatch: somente testes com
provedor falso exercitam os limites. Não existe código de chamada a provedor.

## Auditoria e infraestrutura: impedimentos concretos

O contrato `PilotLedger` requer gravação atômica e persistente de orçamento,
aprovação, reservas e eventos. **Não há adaptador de produção** nem substituto
em memória. O adaptador em memória existe exclusivamente no arquivo de testes.
Não houve alteração de esquema, migração, banco de desenvolvimento/produção,
segredos, DNS ou permissões nesta tarefa.

Próximos passos, em nova autorização:
1. Confirmar inequivocamente o subject Clerk da conta proprietária, sem listar
   clientes nem inferir propriedade por dados de perfil.
2. Confirmar qual entrada Nous e tarifa exatas serão usadas; manter os perfis
   Hermes existentes sem alterações até instrução expressa.
3. Validar contrato de motor sanitizado, quantidades completas, séries de mercado,
   benchmark/metodologia e dados necessários — sem copiar notebook pessoal.
4. Revisar adaptador durável e sua auditoria/locks/reinício/múltiplos servidores,
   e só então propor infraestrutura aditiva em uma tarefa autorizada.
5. Confirmar teto monetário e limites conservadores; qualquer futura habilitação
   real exige nova revisão explícita e aprovação de orçamento específico.
   Aprovação de preparação não remove o bloqueio desta versão.

## Evidências

`server/portfolio-pilot.test.ts`: dados sintéticos, ledger transacional falso e
provedor local falso, autenticação fictícia nos endpoints de teste; sem provedores,
carteiras pessoais, créditos ou mensagens. Regressão completa da demonstração e
teste de navegador da tela fechada em desktop/celular claro/escuro no script
`scripts/tests/portfolio-simulation-browser.test.mjs`.

Resultados da execução final estão em
`docs/evidence/portfolio-pilot-validation.json`.
