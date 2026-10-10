# Piloto proprietário: avanço técnico, ainda fechado

Conferência em 10/10/2026. Nenhuma inferência, envio, cotação externa, movimentação
de créditos, alteração de segredos ou escrita em produção nesta preparação.

## Resolvido e verificado por testes sintéticos

- Transporte HTTP Nous implementado e conectado à fábrica privada dos seis agentes.
  Não é uma conexão ao Hermes, notebook ou executor Python. Usa endpoint fixo,
  sem retries, streaming, redirects ou fallback de credenciais.
- GET de `/v1/models` por credencial, com rejeição de falhas de autenticação e
  revalidação da tarifa antes de cada despacho. O protocolo foi conferido na fonte
  oficial `NousResearch/hermes-agent`, `hermes_cli/models_pricing.py`:
  https://github.com/NousResearch/hermes-agent/blob/main/hermes_cli/models_pricing.py
  A leitura real realizada nesta tarefa foi **anônima**, não autenticada.
- Escolha explícita do ID completo, persistida no ledger privado, sem default.
  Troca de modelo invalida aprovação; uma execução ativa impede a troca.
  A tela existente registra a escolha antes de preparar o orçamento.
- Contabilidade por `usage.prompt_tokens`, `completion_tokens` e `total_tokens`,
  validando modelo, limites e identidade da tarifa. Custo calculado pela tarifa
  de tokens, não declarado como reconciliação de uma fatura. Saída inválida com
  recibo válido preserva o consumo conhecido. Falha/recibo incerto mantém a reserva.
- Reserva inclui overhead do protocolo; o contador exato do modelo deve estar
  instalado e verificado. Nenhum tokenizer de produção foi instalado nesta tarefa.
- Observações de mercado assinadas por fonte instalada no servidor, vinculadas
  ao sujeito e à versão completa das posições. Rejeita adulteração, quantidades
  ausentes, fonte desconhecida, preços ausentes/velhos, timestamps futuros,
  históricos duplicados e contexto macro sem data/fonte.
- Não há leitura de notebook, posições pessoais, SQLite ou pesos iguais.
  Histórico incompleto continua explícito, sem redistribuição de pesos.
- Conferência Clerk sem dependência das tabelas, sem expor identificadores.
  Procedimento de operador para vínculo atômico confere sessão oficial ativa,
  sujeito exato e e-mail principal verificado antes de qualquer escrita.
  Não existe endpoint público de concessão. Não foi aplicado vínculo real.

## Comprovações e bloqueios reais

1. O identificador do proprietário já foi recebido **privadamente**; não repetir
   o pedido nem publicar. O Agent não tem sua sessão autenticada em produção.
   As rotas protegidas retornam 401 ao acesso anônimo. O Clerk é gerenciado pelo
   Replit; usuários/chaves de desenvolvimento não provam identidade de produção.
   A evidência oficial individual e o vínculo ainda não foram obtidos/aplicados.
2. Sem `NOUS_INFERENCE_API_KEY` ou `NOUS_API_KEY` disponíveis, sem uma integração
   Nous instalada. Não reutilizar credenciais OpenAI ou Hermes. Não alteradas.
3. Modelo não escolhido pelo proprietário. IDs públicos confirmados:
   `deepseek/deepseek-v4.1-flash` e `deepseek/deepseek-v4.1-flash:US`.
   O catálogo público não indica um artefato Hugging Face para o tokenizer.
4. Tarifa efetiva autenticada **não confirmada**. Preços públicos em USD/1M tokens:
   base: entrada 0,106; saída 0,513; cache 0,004.
   US: entrada 0,363; saída 1,089; cache 0,0115.
   Fonte: https://inference-api.nousresearch.com/v1/models
   Leitura anônima: 10/10/2026 às 21:03:59 UTC.
5. Tokenizer verificável e fonte de mercado assinada ainda não instalados.
   Nenhuma carteira real foi lida ou transmitida nesta preparação.
6. As três tabelas do piloto existem em desenvolvimento, sem contas, auditorias
   ou vínculos; continuam ausentes em produção, conforme SELECT somente leitura.
   `migrations/0017_portfolio_pilot.sql` continua a migração aditiva revisável.
   Não houve nova DDL nem migração de produção; campos opcionais de seleção usam
   o JSONB já existente. Os controles profissionais anteriores não foram alterados.
7. `REAL_PORTFOLIO_PILOT_ENABLED=false` e o adaptador desarmado preservam o bloqueio.
   Nenhuma conta, inclusive o proprietário, pode executar agora.

## Aprovação e limites

Cada execução exige orçamento específico aprovado explicitamente, ligado às
posições, modelo, tarifa, mercado e limites. Mudança ou expiração invalida.
Teto de US$ 1 ou menor aprovado, seis chamadas, 18.000 tokens de entrada,
6.000 de saída, 90 segundos, zero retries e validade de até 120 segundos,
limitada também pela validade dos metadados.

Reserva atômica antes do despacho, execução única por conta, idempotência por
orçamento e retenção em resultado incerto. Revisão profissional continua exigida;
resultados não se tornam recomendações aprovadas.

## Validação efetiva

- 354 testes passaram: 70 base, 29 banco descartável, 101 qualidade,
  107 Invest/piloto/adaptadores e 47 acesso. Zero falhas/skips.
- Banco de teste local descartável; nenhum teste escreve em produção.
- Typecheck e build passaram; aviso preexistente de bundle acima de 500 kB.
- HTTP de inferência testado somente com transporte falso. Metadados reais somente
  públicos e fontes oficiais. Zero tokens/LLM pagos, cobranças ou envios.
- Prévia reiniciada e respondendo. Rotas novas retornam 401 sem sessão.
- Tela de acesso renderizada; UI autenticada não verificada com uma conta real.
- Produção e Hermes não alterados; nenhuma publicação ou mesclagem.

## Uma ação mínima assistida

Executar a conferência documentada em
[Conferência da própria conta](portfolio-pilot-owner-self-check.md), no navegador
já autenticado do Invest publicado, e retornar somente o relatório sem
identificadores/cookies/tokens/chaves. Diagnóstico de navegador não autoriza
vínculo: o procedimento ainda exige nova conferência oficial no servidor.

## Etapa de produção preparada, não executada

Após conferência final e autorização: revisar e aplicar a migração aditiva via
caminho oficial de publicação; confirmar as três tabelas e preservar controles
de revisão já existentes; usar o procedimento de operador somente no runtime
de produção com `getAuth(req)`, `clerkClient.users.getUser` e
`clerkClient.sessions.getSession`, sujeito privado confirmado e acesso ao banco
de produção. Não conceder a outra conta, não semear identificadores em SQL/Git
e não executar migração na inicialização.

Não remover o bloqueio até credencial, tarifa efetiva, escolha do modelo,
tokenizer, fonte de mercado, vínculo e auditoria de produção estarem verificados.
