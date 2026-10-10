# Conferência assistida da própria conta em produção

O operador já recebeu a identificação privadamente. Não pedir novamente nem
colocar o identificador em código, GitHub ou documentação.

O Agent não tem a sessão do navegador do proprietário. As requisições anônimas
ao Invest retornam 401. As credenciais Clerk do desenvolvimento não podem
substituir as credenciais da instância de produção.

## Uma conferência no navegador já autenticado

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
