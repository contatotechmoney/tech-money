---
name: Limites da demonstração de carteira
description: Escopo definido pelo usuário para personas, dados fictícios e estabilidade do histórico da simulação.
---

O Comitê de Carteira Completa começa exclusivamente em simulação, sem
consumo de tokens. A demonstração aberta por “Analisar minha carteira” é
separada da carteira cadastrada: não ler nem enviar posições reais e não
iniciar atualizações de cotações para ela.

**Why:** O usuário pediu: “Vamos começar pela simulação, sem consumir tokens”,
com carteira fictícia claramente identificada e independente da cadastrada.

**How to apply:** Mudanças de cenário ou interface não autorizam conexão
com posições/perfil reais, LLM, Hermes, cotações, créditos, pagamentos,
envio, aprovação profissional ou aconselhamento. Isso requer novo escopo
explícito, não uma evolução implícita da demonstração.

As seis personas são agentes de IA, não profissionais humanos. Não apresentar
diplomas, certificações ou registros fictícios como credenciais reais.
Reutilizar retratos originais disponíveis; na ausência, usar iniciais e
indicar a pendência, sem inventar novas pessoas.

**Why:** Instrução expressa do usuário ao definir o novo comitê.

**How to apply:** Perfis funcionais devem explicar papel e limites, sem
inventar experiência humana. Carteira é um terceiro grupo; não classificar
essas personas como renda fixa por exclusão.

Mudanças de composição ou metodologia da demonstração precisam de uma nova
versão de cenário, preservando a interpretação das versões anteriores.

**Why:** O histórico determinístico pode ser reconstruído a partir da versão;
editar os dados da mesma versão alteraria retroativamente estudos existentes.

**How to apply:** Não substituir silenciosamente o cenário de um histórico
já registrado. Preservar versões anteriores ao introduzir uma nova.

O piloto da carteira real é exclusivo do proprietário e não altera a demonstração
fictícia dos demais usuários. O proprietário autorizou preparação de execução real
com aprovação explícita do custo antes de cada execução; implementação e testes
nunca iniciam análises reais ou transmitem posições reais. Sem identidade inequívoca
autenticada do proprietário, deve permanecer fechado — nunca inferir pelo nome
ou primeira conta.

O proprietário já confirmou sua identificação privadamente. Não pedir novamente
o identificador nem publicá-lo; conferir a sessão e o e-mail principal no Clerk
de produção, sem transferir a identidade para desenvolvimento.

**Why:** O usuário ampliou o escopo para preparar o executor seguro, mantendo
aprovação específica antes de qualquer gasto ou compartilhamento e proibindo
inferência real durante a implementação.

**How to apply:** Manter separados demonstração, preparação privada e execução.
Não transportar posições pessoais, credenciais ou caminhos locais de notebooks;
não afirmar conexão de motor antes de validá-la. Identidade ausente, mercado/modelo/
preço não confirmados ou infraestrutura incompleta devem impedir orçamento executável.

Catálogo Nous público e tarifa efetiva autenticada da conta são evidências distintas.
Entradas homônimas não autorizam inferência de identificador; nunca trocar o Hermes
ou escolher GLM automaticamente para preencher a lacuna.

**Why:** O usuário destacou opções homônimas com tarifas diferentes e exigiu
preservar as configurações Hermes, sem presumir custo.

**How to apply:** Confirmar ID completo, fonte e escopo da tarifa; preço público
confirmado não comprova desconto, modalidade ou disponibilidade da conta.
