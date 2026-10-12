---
name: Testes de interface
description: JSX em SSR, indisponibilidade de executor de navegador e portas temporárias no Replit.
---

## Executor de navegador e portas temporárias

O runtime pode rejeitar a configuração de helper de testes descrita na skill
com `Unknown config kind: testing`. Não interpretar isso como exigência de
usar contas reais ou abrir um bypass de autenticação no aplicativo.

**Why:** O executor documentado não estava disponível nesta configuração;
o navegador local permitiu verificar a interface mantendo o app real protegido.

**How to apply:** Confirmar a disponibilidade atual do executor; quando necessário
usar navegador local e fixtures isolados, sem substituir a autenticação do servidor
normal. Um listener temporário pode acrescentar automaticamente um mapeamento
de porta à configuração Replit: fechar o processo não remove necessariamente
esse mapeamento. Conferir o diff e remover somente a porta temporária por
configuração validada suportada, preservando workflows e portas existentes.

Nos componentes usados em testes de renderização pelo `tsx`, manter a importação explícita de React quando houver JSX.

**Why:** Neste ambiente, a configuração `jsx: react-jsx` da suíte não impediu que um componente importado fosse transformado em chamadas de `React.createElement`; a checagem de tipos passou, mas a renderização falhou com `React is not defined`.

**How to apply:** Ao adicionar um componente aos testes de interface, verificar a renderização real, não apenas a compilação. Seguir a importação explícita usada pelos componentes já cobertos, sem alterar o compilador de toda a aplicação para resolver um teste.

Não enfraquecer a verificação de autorização da página para fazer fixtures SSR aparecerem. Em React Query, dados sintéticos já no cache podem produzir um estado otimista de atualização quando a consulta exige revalidação imediata.

**Why:** A renderização estática de uma página protegida permaneceu no estado de carregamento apesar do cache preenchido; era a atualização otimista da consulta, não uma falha de permissão nem falta de dados.

**How to apply:** Nos testes estáticos com cache previamente preenchido, desabilitar a atualização/repetição ao montar na configuração da fixture. Preservar na aplicação a revalidação de permissões e o bloqueio durante erros de autorização.