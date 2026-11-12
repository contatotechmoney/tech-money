const html = `<!doctype html>
<html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Tech Money Invest · Piloto por convite</title>
<link rel="stylesheet" href="/piloto/entrar.css"><script src="/piloto/entrar.js" defer></script>
</head><body><main>
<p class="brand">TECH MONEY INVEST</p>
<h1>Entre no piloto do Invest</h1>
<p class="intro">Explore relatórios, conversas com o comitê e acompanhamento de empresas em um ambiente de demonstração.</p>
<section aria-label="Acesso por convite">
<form id="request-code">
<label for="email">E-mail do convite</label>
<input id="email" type="email" maxlength="254" required autocomplete="email" placeholder="seu@email.com">
<button>Receber código</button>
</form>
<form id="verify-code" hidden>
<label for="code">Código de acesso</label>
<input id="code" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autocomplete="one-time-code">
<button>Entrar no piloto</button>
<button type="button" id="change-email" class="secondary">Voltar e pedir outro código</button>
</form>
<p id="status" role="status" aria-live="polite"></p>
<p class="note">Acesso por convite. Os dados, créditos e operações são de demonstração.</p>
</section>
</main></body></html>`;

const css = `
:root{color-scheme:light;--ink:#12372d;--muted:#4e655b;--brand:#245e46}
*{box-sizing:border-box}body{margin:0;background:#eef5f1;color:var(--ink);font:1rem/1.55 system-ui,sans-serif}
main{width:min(100%,36rem);margin:clamp(1.5rem,9vh,6rem) auto;padding:0 clamp(1rem,5vw,2rem)}
.brand{font-size:.8rem;letter-spacing:.12em;font-weight:750;color:var(--brand)}
h1{font-size:clamp(2rem,6vw,3rem);line-height:1.08;letter-spacing:-.04em;margin:.7rem 0}
.intro,.note{color:var(--muted)}section{background:white;border:1px solid #d6e5dc;border-radius:1rem;padding:clamp(1rem,4vw,1.5rem);margin:1.5rem 0}
label{display:block;font-weight:650}input,button{font:inherit;width:100%;min-height:2.8rem;border-radius:.55rem}
input{padding:.6rem .8rem;border:1px solid #8da89b;margin:.35rem 0 .8rem}button{border:0;background:var(--brand);color:white;font-weight:650;cursor:pointer}
button:disabled{opacity:.65;cursor:wait}button.secondary{background:transparent;color:var(--brand);margin-top:.35rem}
:focus-visible{outline:3px solid #187454;outline-offset:3px}[hidden]{display:none!important}
#status:empty{display:none}#status{font-weight:550}.note{font-size:.86rem;margin:.8rem 0 0}
`;

const script = `
const requestForm = document.querySelector("#request-code");
const verifyForm = document.querySelector("#verify-code");
const emailInput = document.querySelector("#email");
const codeInput = document.querySelector("#code");
const status = document.querySelector("#status");
let email = "";

async function post(action, body) {
  return fetch("/api/migration/customer-pilot/" + action, {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
}

async function submit(form, waitMessage, action) {
  const button = form.querySelector('button');
  button.disabled = true;
  status.textContent = waitMessage;
  try { await action(); }
  catch { status.textContent = "O acesso está temporariamente indisponível. Tente novamente."; }
  finally { button.disabled = false; }
}

requestForm.addEventListener("submit", event => {
  event.preventDefault();
  void submit(requestForm, "Solicitando código…", async () => {
    email = emailInput.value.trim();
    const response = await post("request-code", { email });
    if (response.status === 429) {
      status.textContent = "Aguarde um minuto antes de pedir outro código.";
      return;
    }
    if (!response.ok) throw Error();
    status.textContent = "Se este e-mail tiver acesso ao piloto, você receberá um código. Confira também o spam.";
    requestForm.hidden = true;
    verifyForm.hidden = false;
    codeInput.focus();
  });
});

verifyForm.addEventListener("submit", event => {
  event.preventDefault();
  void submit(verifyForm, "Verificando código…", async () => {
    const response = await post("verify-code", { email, code: codeInput.value.trim() });
    if (response.status === 429) {
      status.textContent = "Aguarde um minuto e tente novamente.";
      return;
    }
    if (response.status === 401) {
      status.textContent = "O código é inválido ou expirou. Confira o e-mail ou solicite outro código.";
      codeInput.select();
      return;
    }
    if (!response.ok) throw Error();
    location.replace("/investments/inicio");
  });
});

document.querySelector("#change-email").addEventListener("click", () => {
  verifyForm.hidden = true;
  requestForm.hidden = false;
  codeInput.value = "";
  status.textContent = "";
  emailInput.focus();
});

fetch("/api/migration/session", { credentials: "same-origin", cache: "no-store" })
  .then(response => response.ok ? response.json() : null)
  .then(session => { if (session?.authenticated) location.replace("/investments/inicio"); })
  .catch(() => {});
`;

export function customerPilotAsset(path, method) {
  const style = path.endsWith(".css");
  const javascript = path.endsWith(".js");
  return new Response(method === "HEAD" ? null : style ? css : javascript ? script : html, {
    headers: {
      "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
      "Content-Type": (style ? "text/css" : javascript ? "text/javascript" : "text/html") + "; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    },
  });
}
