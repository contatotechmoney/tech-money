const form = document.querySelector("#enterprise-form");
const feedback = document.querySelector("#enterprise-feedback");
const submit = form.querySelector("button[type=submit]");
const success = document.querySelector("#enterprise-success");

if (new URLSearchParams(location.search).get("origem") === "piloto") {
  for (const link of document.querySelectorAll("[data-return]")) {
    link.href = "https://techmoney-invest-customer-pilot.techmoney.workers.dev/investments/credits";
    link.textContent = "Voltar aos planos";
  }
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (submit.disabled || !form.reportValidity()) return;
  const fields = Object.fromEntries(new FormData(form));
  feedback.textContent = "";
  submit.disabled = true;
  submit.textContent = "Enviando pedido…";
  try {
    const response = await fetch("/api/interesse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...fields, interest: "empresarial", contactConsent: true, marketingOptIn: false }),
      signal: AbortSignal.timeout(25000),
    });
    const result = await response.json();
    if (!response.ok || result.accepted !== true) {
      feedback.textContent = result.error || "Não foi possível confirmar o pedido. Tente novamente.";
      return;
    }
    form.reset();
    form.hidden = true;
    success.hidden = false;
    document.querySelector("#enterprise-success-title").focus();
  } catch {
    feedback.textContent = "Não foi possível confirmar o pedido. Seus dados continuam no formulário. Tente novamente.";
  } finally {
    submit.disabled = false;
    submit.textContent = "Enviar pedido";
  }
});
