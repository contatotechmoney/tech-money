# Acesso a investimentos pela landing page

## Alterações integradas pelo GitHub

- Site institucional: `https://www.techmoney.com.br`, mantido em
  `contatotechmoney/sistema`.
  [Alteração integrada](https://github.com/contatotechmoney/sistema/pull/2):
  acesso no cabeçalho e na seção de investimentos, preservando o contato
  com o consultor e o formulário de confirmação de e-mail.
- Aplicação: `contatotechmoney/tech-money`.
  [Alteração integrada](https://github.com/contatotechmoney/tech-money/pull/1):
  destino preservado no login, cadastro, login social e etapas adicionais
  de autenticação. Os destinos externos e os ciclos pelas telas de autenticação
  são rejeitados.

O botão aponta para
`https://dre-insights--ClevertonMarlon.replit.app/investments/agents`.
Esse endereço foi obtido da informação de publicação e conferido por requisição
e captura visual. Não usar `https://techmoney.com.br/investments/agents`:
o domínio sem `www` redireciona para o site institucional.

## Publicação

Integrar código no GitHub não comprova que ele foi publicado. A verificação
após a integração ainda encontrou a landing page sem o novo botão, e os
repositórios não informaram uma publicação correspondente.

Publicar as versões atualizadas do GitHub pela configuração existente de cada
projeto, sem substituir o site institucional pelos arquivos antigos do preview.
Publicar primeiro o ajuste de autenticação da aplicação, depois a landing page.
Não modificar DNS, hospedagem, revisão de recomendações ou confirmação de e-mail.

## Verificações realizadas

- Compilação TypeScript e build da aplicação.
- Oito testes de redirecionamento, incluindo execução do guard com estados
  de sessão simulados: carregando, visitante e autenticado.
- Sintaxe e destinos da landing page; cooperativas e finanças preservados.
- Visitante sem sessão recebe login; a API protegida responde `401`.
- Página de cadastro carregou no preview mantendo a configuração de destino.

A interface com uma conta realmente autenticada e o ciclo completo de
cadastro/login social não foram verificados no navegador. Esses testes não
devem usar um bypass de autenticação.