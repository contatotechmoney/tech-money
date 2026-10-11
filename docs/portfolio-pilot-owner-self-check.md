# Conferência simples da própria conta

O operador já recebeu a identificação privadamente. Não pedir novamente nem
colocar o identificador em código, GitHub ou documentação.

O Agent não tem a sessão do navegador do proprietário. As requisições anônimas
ao Invest retornam 401. As credenciais Clerk do desenvolvimento não podem
substituir as credenciais da instância de produção.

## Caminho atual preparado: sem console

Após implantação autorizada, abrir no Invest:
`/investments/portfolio/pilot/confirm-account`, entrar pela autenticação Clerk
normal e selecionar **Conferir minha conta**. Na preparação, a mesma rota é
navegável na prévia do Replit. Desenvolvimento não confirma contas de produção.

A consulta GET protegida usa `getAuth(req)`, consulta a sessão ativa e o usuário
no serviço oficial Clerk e confere somente o e-mail principal verificado.
A resposta mostra estados, nunca identificador, e-mail, sessão, token ou digest.
Não lê carteira, grava banco, vincula acesso, faz análise nem envia mensagem.

Correspondência usa uma referência privada, exclusivamente do servidor de
produção: `PORTFOLIO_PILOT_PRODUCTION_OWNER_REFERENCE`. Seu valor é uma referência
unidirecional com domínio de produção, derivada pelo operador da identificação
já confirmada privadamente. Não publicar o valor, não pedir o identificador outra
vez e não usar contas de desenvolvimento para preenchê-la. Nenhuma variável foi
criada/alterada nesta tarefa; sem referência válida o resultado é
**Referência do titular indisponível**. Nunca escolher primeira conta ou nome.

Mesmo três resultados positivos são diagnóstico oficial de leitura, não
vínculo aplicado nem autorização para executar. O procedimento separado de
vínculo continua exigindo revisão do operador e conferência oficial nova.
Execução real permanece desabilitada. Não é necessário o proprietário operar
console, compartilhar credenciais ou fazer esta conferência antes da implantação.

## Histórico técnico preservado: diagnóstico anterior pelo console

O bloco abaixo pertence à preparação anterior, é preservado para auditoria
e testes históricos e **não é o caminho recomendado ao proprietário**.

No Invest publicado, conectado à própria conta, executar o bloco abaixo no
console do navegador e compartilhar somente o resultado. Ele faz dois GETs
protegidos já existentes, sem alterar dados, iniciar análises, enviar mensagens
ou ler cookies/tokens/chaves. Não imprime nome, e-mail nem identificador.

```javascript
(async () => {
  if (location.hostname !== "invest.techmoney.com.br") throw new Error("Abra o Invest de produção.");
  const read = async path => {
    const response = await fetch(path, { method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error" });
    return { status: response.status, data: await response.json() };
  };
  const [session, profile] = await Promise.all([read("/api/auth/session"), read("/api/leads/profile")]);
  const authenticated = session.status === 200 && session.data.authenticated === true && typeof session.data.userId === "string";
  const nonce = crypto.randomUUID();
  const bytes = new TextEncoder().encode(`${nonce}|${location.hostname}|${authenticated ? session.data.userId : ""}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const subjectFingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  console.log(JSON.stringify({
    environment: "production", origin: location.origin, nonce, subjectFingerprint,
    authenticated, sessionStatus: session.status, profileStatus: profile.status,
    primaryEmailVerified: authenticated && profile.status === 200 && typeof profile.data.email === "string",
    ownerBound: false, executable: false
  }));
})().catch(() => console.log("Não foi possível concluir a conferência. Nenhum acesso foi concedido."));
```

O GET de perfil publicado consulta `clerkClient.users.getUser` para o sujeito
da sessão e exige o e-mail **principal** verificado antes de retornar o perfil.
Um perfil desativado (`enabled:false`), erro ou sessão anônima não passa.

O operador compara o fingerprint, com o nonce, à identificação já confirmada,
sem gravar a identificação em desenvolvimento ou arquivos públicos.
**Este resultado é diagnóstico assistido, não uma autorização confiável
enviada pelo navegador.** Aplicar o vínculo exige nova consulta oficial de
usuário e sessão ativa no servidor de produção.

## Preparação técnica, ainda não publicada

- `identity-check`: conferência oficial sem tabelas nem gravação, sem retornar
  identificadores; somente será acessível depois de uma publicação autorizada.
- `identity`: registra evidência quando as tabelas existem, mas não concede vínculo.
- O procedimento de operador `bindReviewedProductionOwner` confere instância
  de produção, sujeito autenticado exato, sessão oficial ativa e e-mail principal
  verificado. Grava vínculo e auditoria atomicamente; recusa conta diferente,
  vínculo revogado ou outro proprietário, sem expor uma rota de concessão.
- A migração aditiva revisável continua sendo `0017_portfolio_pilot.sql`.
  Nenhuma aplicação ou vinculação em produção foi realizada nesta preparação.
