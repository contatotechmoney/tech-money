# Continuação do piloto privado — revisão sem publicação

## Evidências desta revisão

Validação consolidada: **422 testes aprovados**, zero ignorados: 70 básicos,
48 de banco descartável, 101 de qualidade, 156 de Invest/piloto e 47 de acesso.
A primeira execução encontrou uma incompatibilidade do teste SSR com importação
CSS no Node; o harness isolado foi corrigido e os 156 testes de Invest/piloto
foram repetidos com sucesso. As demais suítes aprovadas não foram alteradas.
Typecheck final e build aprovados; aviso preexistente de tamanho de bundle.

O percurso sintético testou autenticação, escolha explícita, consentimento,
prazo, teto, alterações do orçamento, recusa de posições reais no endpoint,
início, progresso, seis conclusões, síntese, repetição e histórico isolado.
Os testes de vínculo e banco descartável existentes também passaram.

Consulta somente de leitura de produção: zero vínculos, contas do piloto e
eventos de auditoria. Referência privada configurada, sem divulgar valor;
credenciais específicas Nous ausentes. Nenhuma atualização foi reaplicada.

Prévia reiniciada e servindo; captura móvel da rota de simulação mostrou o
login, mantendo autenticação. Não foi verificada a tela com sessão real no
navegador; o componente foi renderizado por SSR e o fluxo por HTTP sintético.
Não houve inferência real, posições reais, envio, cobrança ou tokens pagos.

## O que esta revisão prepara

O vínculo exclusivo existente é preservado. Referência privada registrada em
produção não significa vínculo aplicado; não há sessão autenticada do
proprietário disponível ao Agent. A ação oficial da tela ainda depende de
publicação autorizada e confirmação explícita do próprio titular. Não pedir
novamente identificação nem usar console, cookies ou valores do navegador para
autorizar. Nenhum vínculo foi gravado nesta revisão.

O ensaio opcional na demonstração existente permite escolher modelo fictício
A/B, definir teto fictício até US$ 1, conferir uma cotação válida por dois
minutos e confirmar consentimento específico antes de iniciar as seis etapas
ilustrativas. Valores são exemplos inventados, NÃO tarifas Nous.

Esse ensaio é somente estado do navegador, eliminado ao trocar de sessão,
modelo, teto ou vencer. Não é orçamento auditado no servidor nem aprovação para
execução real. A demonstração gratuita anterior permanece disponível. O estudo
usa a API autenticada existente e fica no histórico privado do usuário.
Não se enviam o orçamento fictício ou posições reais à API.

A síntese inclui checklist demonstrativo de conferência humana, não persistido
como aprovação profissional e sem submissão à fila. Histórico anterior,
personas, renda fixa/variável, revisão profissional e bloqueios são preservados.

## Correção de confiança de preços

Uma resposta ao catálogo `/v1/models` com Authorization não prova tarifa
efetiva. O adaptador agora conserva metadados como não verificados até receber
evidência independente através de dependência confiável do servidor.

A prova precisa corresponder ao identificador, versão e taxas exatas, fonte
HTTPS e prazo válido. Não há verificador real configurado. Falha de atualização
remove o catálogo anterior, sem manter tarifa antiga aprovada. O runtime e o
dispatch recusam ausência de prova. Provas dos testes são explicitamente falsas;
nenhuma tarifa autenticada foi obtida nesta tarefa.

## Bloqueios reais

- Vínculo: preparado e testado, não aplicado em produção nesta etapa.
- Nous: credencial específica indisponível.
- Modelo: escolha real explícita ainda pendente, sem alterar Hermes/GLM.
- Tarifa: falta evidência efetiva da conta, além de catálogo autenticado.
- Tokenizer: falta contador comprovado correspondente ao modelo exato.
- Mercado: falta observação verificável ligada à carteira e fontes confiáveis.
- Executor: implementação exercitada com fakes, não conectado/habilitado em
  produção. Não afirmar conexão do notebook ou Hermes.
- Inferência global permanece false; uma identidade vinculada ou consentimento
  do ensaio não a libera.

## Uma instrução de configuração, quando o proprietário tiver a credencial

No Replit, **Publishing → Adjust settings → Production app secrets**, adicionar
o campo **NOUS_INFERENCE_API_KEY** com a credencial da própria conta Nous.
Não enviar a chave no chat, código ou navegador, nem usar campos VITE.
Salvar a configuração não autoriza análise nem substitui confirmação de tarifa;
publicação e inferência continuam sujeitas a autorização separada.

## Ordem para concluir

Revisar e autorizar publicação da ação de vínculo; confirmar pela sessão oficial
do proprietário. Depois validar somente metadados Nous, preço efetivo, tokenizer
e fonte de mercado; validar o executor com dados sintéticos; revisar orçamento e
controles antes de qualquer autorização futura de inferência.

O orçamento real continua no servidor, ligado à carteira completa, modelo,
tarifa, prazo e teto. Mudanças invalidam aprovação. Reserva anterior à chamada,
idempotência, uma execução ativa, timeout, falha parcial e resultado incerto
permanecem protegidos. Nenhuma simulação equivale a prova de transporte real.

Divulgação e manifestação de interesse são apenas proposta em
`docs/invest-acompanhamento-proposta.md`. Não houve ampliação de acesso, ativação
de formulário, campanha, envio, cobrança, publicação ou migração de produção.
