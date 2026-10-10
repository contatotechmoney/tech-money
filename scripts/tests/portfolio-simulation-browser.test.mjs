import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";

const origin = "http://127.0.0.1:5110";
const directory = "/tmp/tm-portfolio-browser";
await mkdir(directory, { recursive: true });
const fixture = spawn("bash", ["scripts/validate-simulation-browser.sh"], { detached: true, stdio: ["ignore", "pipe", "pipe"] });
let logs = "", browser, activePage;
fixture.stdout.on("data", data => { logs += data; });
fixture.stderr.on("data", data => { logs += data; });
const evidence = { stages: [], errors: [], externalAttempts: 0, blockedExternalHosts: [], screenshots: [], realPortfolioReads: 0 };
try {
  await new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      if (logs.includes("SYNTHETIC_BROWSER_READY")) { clearInterval(timer); resolve(); }
      else if (fixture.exitCode !== null) { clearInterval(timer); reject(Error(logs)); }
    }, 100);
    setTimeout(() => { clearInterval(timer); reject(Error("Fixture readiness timeout")); }, 30000).unref();
  });
  browser = await chromium.launch({
    executablePath: "/repl/tools/bin/chromium",
    args: ["--no-sandbox", "--disable-background-networking", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"],
  });
  async function context(width = 1280, colorScheme = "light") {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme, reducedMotion: "reduce" });
    await ctx.route("**/*", route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) {
        evidence.externalAttempts++;
        if (!evidence.blockedExternalHosts.includes(url.hostname)) evidence.blockedExternalHosts.push(url.hostname);
        return route.abort();
      }
      if (url.pathname === "/api/investments/portfolio") {
        evidence.realPortfolioReads++;
        return route.fulfill({ json: {
          items: [], transactions: [], updatedAt: "2026-10-10T12:00:00Z", source: "synthetic-empty-fixture",
          summary: { totalInvested: 0, totalCurrent: 0, realizedProfit: 0, unrealizedReturnValue: 0, returnValue: 0, returnPercent: 0 },
        } });
      }
      return route.continue();
    });
    return ctx;
  }
  async function signIn(page, actor) {
    await page.goto(origin + "/sign-in?redirect=%2Finvestments%2Fagents");
    await page.locator("input[type=email]").fill(`${actor}@example.test`);
    await page.locator('button[type="submit"]').click();
    await page.locator('input[autocomplete="one-time-code"]').fill("000000");
    await page.locator('button[type="submit"]').click();
    await page.waitForURL("**/investments/agents");
    const language = page.getByRole("button", { name: /Português \(Brasil\)/ });
    if (await language.isVisible()) await language.click();
  }
  async function capture(page, name) {
    await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true });
    evidence.screenshots.push(name);
  }
  const alpha = await context();
  const page = await alpha.newPage();
  activePage = page;
  page.on("pageerror", error => evidence.errors.push(error.message));
  await page.goto(origin + "/investments/portfolio/simulation");
  await page.locator("input[type=email]").waitFor();
  assert.equal((await alpha.request.get(origin + "/api/investments/portfolio-simulations")).status(), 401);
  evidence.stages.push("anonymous-demo-protected");
  await signIn(page, "alpha");
  await page.goto(origin + "/investments/portfolio");
  await page.getByRole("link", { name: /Analisar minha carteira/ }).click();
  await page.waitForURL("**/investments/portfolio/simulation");
  await page.getByText("Nenhuma demonstração ainda", { exact: true }).waitFor();
  await page.getByRole("cell", { name: "Título fictício Alfa", exact: true }).waitFor();
  assert.equal(await page.getByText("40%", { exact: true }).count(), 2);
  assert.equal(await page.getByText("55%", { exact: true }).count(), 1);
  const readsBeforeDemo = evidence.realPortfolioReads;
  assert.equal((await (await alpha.request.get(origin + "/__fixture/evidence")).json()).studiesCreated, 0);
  await capture(page, "01-fictional-composition-and-empty-history");
  evidence.stages.push("portfolio-button-separate-demo-no-auto-start");
  const created = page.waitForResponse(response => response.url() === origin + "/api/investments/portfolio-simulations" && response.request().method() === "POST");
  await page.getByRole("button", { name: /Iniciar demonstração/ }).click();
  const response = await created;
  assert.equal(response.status(), 202);
  const study = await response.json();
  assert.equal(study.tokensUsed, 0);
  assert.equal(study.creditsDebited, 0);
  assert.equal(study.agents.length, 6);
  assert.deepEqual(study.agents.map(agent => agent.id), ["bruno", "tereza", "paulo", "larissa", "sergio", "denise"]);
  await page.getByRole("button", { name: /Iniciar demonstração/ }).isDisabled().then(value => assert.equal(value, true));
  await capture(page, "02-illustrative-progress");
  evidence.stages.push("explicit-start-six-illustrative-agents");
  await page.getByText("Síntese ilustrativa · Denise", { exact: true }).waitFor({ timeout: 25000 });
  await page.getByText(/SIMULAÇÃO — Síntese ilustrativa da Denise/).first().waitFor();
  assert.equal(evidence.realPortfolioReads, readsBeforeDemo, "demo must not refresh registered portfolio or quotes");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await capture(page, "03-completed-denise-synthesis");
  const detail = await (await alpha.request.get(origin + "/api/investments/portfolio-simulations/" + study.id)).json();
  assert.equal(detail.completedAgents, 6);
  assert.equal(detail.recommendation, "blocked");
  evidence.stages.push("deterministic-completion-no-real-portfolio-read");
  await page.reload();
  await page.getByText(/SIMULAÇÃO — Síntese ilustrativa da Denise/).first().waitFor();
  assert.match(page.url(), new RegExp(study.id));
  assert.equal((await (await alpha.request.get(origin + "/api/investments/portfolio-simulations")).json()).studies[0].synthesis, detail.synthesis);
  evidence.stages.push("private-history-reopened-after-reload");

  await alpha.clearCookies();
  await signIn(page, "alpha");
  await page.goto(origin + "/investments/portfolio/simulation");
  await page.getByText(/SIMULAÇÃO — Síntese ilustrativa da Denise/).first().waitFor();
  evidence.stages.push("private-history-reopened-after-fictitious-sign-out-and-in");
  const beta = await context(375, "dark");
  const mobile = await beta.newPage();
  activePage = mobile;
  mobile.on("pageerror", error => evidence.errors.push(error.message));
  await signIn(mobile, "beta");
  await mobile.goto(origin + "/investments/portfolio/simulation?study=" + study.id);
  await mobile.getByText("Nenhuma demonstração ainda", { exact: true }).waitFor();
  await mobile.getByText("Não foi possível abrir esta demonstração agora.", { exact: true }).waitFor();
  assert.equal(await mobile.getByText(/SIMULAÇÃO — Síntese ilustrativa da Denise/).count(), 0);
  assert.equal((await beta.request.get(origin + "/api/investments/portfolio-simulations/" + study.id)).status(), 404);
  assert.equal(await mobile.locator(".portfolio-simulation").evaluate(element => getComputedStyle(element).backgroundColor), "rgb(20, 35, 29)");
  assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await capture(mobile, "04-mobile-dark-other-user-isolated");
  evidence.stages.push("other-user-empty-history-detail-404-mobile-dark");

  await mobile.route("**/api/investments/portfolio-simulations", route => route.fulfill({ status: 503, json: { error: "SYNTHETIC_UNAVAILABLE" } }));
  await mobile.goto(origin + "/investments/portfolio/simulation");
  await mobile.getByText("O histórico não está disponível.", { exact: true }).waitFor();
  assert.equal(await mobile.getByText("Nenhuma demonstração ainda", { exact: true }).count(), 0);
  assert.equal(await mobile.getByRole("button", { name: /Iniciar demonstração/ }).isDisabled(), true);
  await capture(mobile, "05-history-error-not-empty");
  await mobile.unroute("**/api/investments/portfolio-simulations");
  evidence.stages.push("unavailable-history-explicit-error-no-fake-empty");

  for (const [context, target, theme] of [[alpha, page, "light-desktop"], [beta, mobile, "dark-mobile"]]) {
    await target.goto(origin + "/comites/central_comites.html");
    assert.equal(await target.locator(".hub-card").count(), 3);
    await target.getByRole("button", { name: "Abrir Comitê de Carteira Completa", exact: true }).click();
    assert.equal(await target.locator("#panel-carteira .member-card").count(), 6);
    for (const agent of study.agents) {
      await target.getByRole("button", { name: `Ver perfil simulado de ${agent.name}`, exact: true }).click();
      const profile = await target.locator("#cvOverlay.show").innerText();
      assert.match(profile, /não é uma pessoa nem profissional real/);
      assert.doesNotMatch(profile, /MBA|CFA|CFP|PhD|Universidade|Certificações|Formação acadêmica/);
      await target.keyboard.press("Escape");
    }
    assert.equal(await target.locator("#panel-carteira img").count(), 0);
    assert.ok(await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await capture(target, "06-central-carteira-" + theme);
    for (const [committee, count] of [["rv", 10], ["rf", 6]]) {
      await target.evaluate(() => window.goHome());
      await target.evaluate(key => window.enter(key), committee);
      assert.equal(await target.locator(`#panel-${committee} .member-card`).count(), count);
    }
    await context.close();
  }
  evidence.stages.push("third-central-card-six-ai-profiles-rv-rf-preserved");
  const counters = await (await fetch(origin + "/__fixture/evidence")).json();
  for (const key of ["externalCalls", "databaseCalls", "legacyCalls", "tokensConsumed", "realCreditsChanged", "accountsCreated"]) assert.equal(counters[key], 0, key);
  assert.equal(counters.productionWorkerEnabled, false);
  assert.ok(evidence.blockedExternalHosts.every(host => ["fonts.googleapis.com", "fonts.gstatic.com"].includes(host)), "only optional font attempts are allowed and aborted");
  assert.deepEqual(evidence.errors, []);
  evidence.counters = counters;
  evidence.result = "passed";
  await writeFile(directory + "/evidence.json", JSON.stringify(evidence, null, 2));
  console.log("PORTFOLIO_BROWSER_PASSED", JSON.stringify(evidence));
} catch (error) {
  evidence.result = "failed"; evidence.failure = String(error);
  try { await activePage?.screenshot({ path: directory + "/failure.png", fullPage: true }); } catch {}
  await writeFile(directory + "/evidence.json", JSON.stringify(evidence, null, 2));
  console.error(logs.slice(-4000)); throw error;
} finally {
  await browser?.close();
  try { process.kill(-fixture.pid, "SIGTERM"); } catch {}
}
