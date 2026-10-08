import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";

const origin = "http://127.0.0.1:5110";
const evidenceDir = process.env.SYNTHETIC_BROWSER_EVIDENCE_DIR || "/tmp/invest-browser-evidence";
await mkdir(evidenceDir, { recursive: true });
let child, browser, activePage;
let externalBlocked = 0;
const errors = [];
const report = { synthetic: true, stages: [], screenshots: [], isolation: false, errors };
try {
  if (process.env.SYNTHETIC_BROWSER_REUSE !== "1") {
    child = spawn("bash", ["scripts/validate-simulation-browser.sh"], { detached: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", data => { output += data; });
    child.stderr.on("data", data => { output += data; });
    await new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(Error("Fixture did not start: " + output)), 30000);
      const poll = setInterval(() => {
        if (output.includes("SYNTHETIC_BROWSER_READY")) { clearTimeout(deadline); clearInterval(poll); resolve(); }
        else if (child.exitCode !== null) { clearTimeout(deadline); clearInterval(poll); reject(Error("Fixture exited: " + output)); }
      }, 100);
    });
  }
  const browserEnv = Object.fromEntries(["PATH", "HOME", "LD_LIBRARY_PATH", "TMPDIR"].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  browser = await chromium.launch({
    executablePath: process.env.SYNTHETIC_CHROMIUM || "/repl/tools/bin/chromium",
    headless: true, env: browserEnv,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-background-networking",
      "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"],
  });
  async function context() {
    const value = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
    await value.route("**/*", route => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      externalBlocked++; return route.abort();
    });
    return value;
  }
  async function screenshot(page, name) {
    await page.screenshot({ path: `${evidenceDir}/${name}.png`, fullPage: true });
    report.screenshots.push(name);
  }
  async function signIn(page, actor) {
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(origin + "/sign-in?redirect=%2Finvestments%2Fagents");
    await page.locator("input[type=email]").fill(`${actor}@example.test`);
    await page.locator('button[type="submit"]').click();
    await page.locator('input[autocomplete="one-time-code"]').fill("000000");
    await page.locator('button[type="submit"]').click();
    await page.waitForURL("**/investments/agents");
    await page.getByText("Estudo de investimento simulado", { exact: true }).waitFor();
    const languageChoice = page.getByRole("button", { name: /Português \(Brasil\)/ });
    if (await languageChoice.isVisible()) await languageChoice.click();
  }
  const alpha = await context();
  const page = await alpha.newPage();
  activePage = page;
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(origin + "/investments/agents");
  await page.locator("input[type=email]").waitFor();
  assert.match(page.url(), /sign-in|\?redirect=/);
  report.stages.push("anonymous-access-redirect");
  await screenshot(page, "01-access");
  assert.equal((await alpha.request.get(origin + "/api/investments/simulations")).status(), 401);
  await signIn(page, "alpha");
  report.stages.push("fictitious-email-code-access");
  await page.getByText(/Nenhuma demonstração|Nenhum estudo|Ainda não há/).first().waitFor();
  await screenshot(page, "02-empty");
  await page.locator("select").selectOption("BBAS3");
  const creation = page.waitForResponse(response =>
    response.url() === origin + "/api/investments/simulations" && response.request().method() === "POST");
  const [response] = await Promise.all([
    creation, page.getByRole("button", { name: /Iniciar.*simula/i }).click(),
  ]);
  assert.equal(response.status(), 202);
  const study = await response.json();
  assert.equal(study.ticker, "BBAS3");
  assert.equal(study.status, "queued");
  report.stages.push("action-selection", "study-start", "queued");
  await page.getByText("Preparando demonstração", { exact: true }).first().waitFor();
  await screenshot(page, "03-queued");
  await page.getByText("Montando o exemplo local", { exact: true }).first().waitFor({ timeout: 10000 });
  report.stages.push("running");
  await screenshot(page, "04-progress");
  await page.getByText(/Este exemplo usa um roteiro fixo/).first().waitFor({ timeout: 15000 });
  report.stages.push("completed-fictional-result");
  assert.ok((await page.locator("body").innerText()).includes("Créditos reais"));
  await screenshot(page, "05-result");
  const result = await (await alpha.request.get(origin + `/api/investments/simulations/${study.id}`)).json();
  assert.equal(result.status, "completed");
  assert.equal(result.tokensUsed, 0);
  assert.equal(result.creditsDebited, 0);
  assert.equal(result.recommendation, "blocked");
  const history = await (await alpha.request.get(origin + "/api/investments/simulations")).json();
  assert.equal(history.studies.length, 1);
  assert.equal(history.studies[0].id, study.id);
  await page.reload();
  await page.getByRole("button", { name: /BBAS3/ }).first().click();
  await page.getByText(/Este exemplo usa um roteiro fixo/).first().waitFor();
  report.stages.push("history-reload-and-reopen");
  await screenshot(page, "06-history");

  const beta = await context();
  const betaPage = await beta.newPage();
  await signIn(betaPage, "beta");
  const betaHistory = await (await beta.request.get(origin + "/api/investments/simulations")).json();
  assert.deepEqual(betaHistory.studies, []);
  assert.equal((await beta.request.get(origin + `/api/investments/simulations/${study.id}`)).status(), 404);
  report.isolation = true;
  report.stages.push("second-user-isolation");
  for (const route of ["/api/investments/reports/BBAS3/delivery", "/api/investments/agents/run",
    "/api/investments/billing/checkout", "/api/investments/credits/signup-grant"]) {
    assert.equal((await alpha.request.post(origin + route, { data: {} })).status(), 403);
  }
  report.stages.push("real-delivery-analysis-checkout-credits-blocked");
  // Mount the real history widget for an authenticated synthetic owner. Wait
  // longer than its former polling interval and trigger a window-focus event.
  let historyRequests = 0;
  page.on("request", request => { if (request.url().includes("/api/investments/report-deliveries")) historyRequests++; });
  await page.goto(origin + "/__fixture/legacy-monitor");
  await page.getByText(/Monitoramento automático de entregas suspenso/).waitFor();
  await page.waitForTimeout(5500);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForTimeout(1000);
  assert.equal(historyRequests, 0);
  report.legacyHistoryBrowserRequests = historyRequests;
  report.stages.push("authenticated-legacy-widget-no-poll-or-focus-query");
  await screenshot(page, "07-monitoring-suspended");
  report.counters = await (await alpha.request.get(origin + "/__fixture/evidence")).json();
  for (const key of ["externalCalls", "databaseCalls", "legacyCalls", "tokensConsumed", "realCreditsChanged", "accountsCreated"]) {
    assert.equal(report.counters[key], 0, key);
  }
  assert.equal(report.counters.productionWorkerEnabled, false);
  assert.deepEqual(errors, []);
  report.externalBrowserRequestsBlocked = externalBlocked;
  report.passed = true;
  await writeFile(`${evidenceDir}/result.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.passed = false; report.failure = String(error);
  if (activePage) {
    report.failureUrl = activePage.url();
    report.failureText = (await activePage.locator("body").innerText().catch(() => "")).slice(0, 3000);
    await activePage.screenshot({ path: `${evidenceDir}/failure.png` }).catch(() => {});
  }
  await writeFile(`${evidenceDir}/result.json`, JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser?.close();
  if (child) {
    try { process.kill(-child.pid, "SIGTERM"); } catch {}
    const deadline = setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch {} }, 3000);
    child.stdout.destroy();
    child.stderr.destroy();
    child.unref();
    deadline.unref();
  }
}
