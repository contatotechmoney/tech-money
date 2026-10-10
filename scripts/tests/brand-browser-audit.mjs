import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";

const origin = "http://127.0.0.1:5110";
const dir = "/tmp/tm-brand-audit";
await mkdir(dir, { recursive: true });
const server = spawn("bash", ["scripts/validate-simulation-browser.sh"], { detached: true, stdio: ["ignore", "pipe", "pipe"] });
let logs = "", browser;
server.stdout.on("data", data => { logs += data; });
server.stderr.on("data", data => { logs += data; });
const results = { screenshots: [], pages: [], errors: [], outboundBlocked: 0 };
try {
  await new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      if (logs.includes("SYNTHETIC_BROWSER_READY")) { clearInterval(timer); resolve(); }
      else if (server.exitCode !== null) { clearInterval(timer); reject(Error(logs)); }
    }, 100);
    setTimeout(() => { clearInterval(timer); reject(Error("Fixture readiness timeout")); }, 30000).unref();
  });
  browser = await chromium.launch({ executablePath: "/repl/tools/bin/chromium", args: ["--no-sandbox", "--disable-background-networking", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"] });
  for (const colorScheme of ["light", "dark"]) {
    for (const width of [colorScheme === "light" ? 375 : 1280]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme, reducedMotion: "reduce" });
      await ctx.route("**/*", route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) { results.outboundBlocked++; return route.abort(); }
        if (url.pathname === "/api/leads/profile") return route.fulfill({ json: { enabled: true, registered: true } });
        if (url.pathname === "/api/investments/billing/catalog") {
          return route.fulfill({ json: { configurado: false, mesesGratisAnual: 0, planos: [] } });
        }
        if (/^\/api\/investments\/(?:simulation-options|simulations)/.test(url.pathname)) return route.continue();
        if (url.pathname === "/api/investments/reports") return route.fulfill({ json: { reports: [] } });
        if (url.pathname === "/api/investments/review-access") return route.fulfill({ json: { canReview: false, canManageProfessionals: false, assignments: [] } });
        if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 503, json: { error: "Fixture visual sem dados reais." } });
        return route.continue();
      });
      const page = await ctx.newPage();
      page.setDefaultTimeout(12000);
      page.on("pageerror", error => results.errors.push(error.message));
      await page.goto(origin + "/comites/central_comites.html");
      await page.locator(".hub-card").first().waitFor();
      const portraits = page.locator(".portrait-montage img");
      await portraits.evaluateAll(images => Promise.all(images.map(image => {
        image.loading = "eager";
        return image.decode();
      })));
      assert.equal(await page.locator(".brand > .brand-lockup .brand-mark i").count(), 3);
      assert.equal(await portraits.count(), 16);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.equal(await page.locator('img[src*="comite_r"], img[src*="tech_money_logo"]').count(), 0);
      const key = `${colorScheme}-${width}`;
      await page.screenshot({ path: `${dir}/central-${key}.png`, fullPage: true });
      results.screenshots.push(`central-${key}`);
      for (const [committee, count] of [["rv", 10], ["rf", 6]]) {
        await page.evaluate(key => window.enter(key), committee);
        assert.equal(await page.locator(`#panel-${committee} .member-card`).count(), count);
        await page.locator(`#panel-${committee} .member-card`).first().click();
        await page.locator("#cvOverlay.show").waitFor();
        assert.ok((await page.locator("#cvOverlay.show").innerText()).includes("simulada"));
        await page.keyboard.press("Escape");
        await page.screenshot({ path: `${dir}/${committee}-${key}.png`, fullPage: true });
        results.screenshots.push(`${committee}-${key}`);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.evaluate(() => window.goHome());
      }
      await ctx.addCookies([{ name: "tm_sim_fixture", value: "alpha", domain: "127.0.0.1", path: "/" }]);
      for (const route of ["/areas", "/dashboard", "/reports", "/balance-sheet", "/settings", "/credits",
        "/investments/agents", "/investments/reports", "/investments/suitability", "/investments/portfolio", "/investments/review",
        "/investments/assignments", "/investments/settings", "/investments/credits"]) {
        console.log("BRAND_AUDIT", colorScheme, width, route);
        await page.goto(origin + route, { waitUntil: "domcontentloaded", timeout: 15000 });
        await page.locator(".tm-brand-name:visible").first().waitFor();
        const languageChoice = page.getByRole("button", { name: /Português \(Brasil\)/ });
        if (await languageChoice.isVisible()) await languageChoice.click();
        const area = route.startsWith("/investments") ? "INVESTIMENTOS" : route === "/areas" ? "ÁREAS" : "FINANCE";
        assert.equal(await page.locator(".tm-brand-area:visible").first().textContent(), area);
        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth, viewport: innerWidth,
          offenders: [...document.querySelectorAll("*")].filter(element => {
            const rect = element.getBoundingClientRect();
            return rect.right > innerWidth + 2 && rect.width > 1;
          }).slice(0, 7).map(element => ({
            tag: element.tagName, className: typeof element.className === "string" ? element.className.slice(0, 110) : "",
            text: element.textContent?.trim().slice(0, 40), right: Math.round(element.getBoundingClientRect().right),
          })),
        }));
        assert.ok(overflow.scrollWidth <= overflow.viewport, `${route} ${JSON.stringify(overflow)}`);
        results.pages.push({ route, colorScheme, width, area });
        if (route === "/dashboard" || route === "/investments/agents") await page.screenshot({ path: `${dir}/${route.includes("investments") ? "invest" : "finance"}-${key}.png`, fullPage: true });
      }
      await ctx.clearCookies();
      for (const route of ["/", "/sign-in?redirect=%2Finvestments%2Fagents", "/sign-up?redirect=%2Fdashboard"]) {
        await page.goto(origin + route);
        await page.locator(".tm-brand-name").first().waitFor();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        results.pages.push({ route, colorScheme, width });
      }
      await ctx.close();
    }
  }
  const response = await fetch(origin + "/__fixture/evidence");
  results.counters = await response.json();
  for (const key of ["externalCalls", "databaseCalls", "legacyCalls", "tokensConsumed", "realCreditsChanged", "accountsCreated"]) assert.equal(results.counters[key], 0, key);
  assert.deepEqual(results.errors, []);
  results.passed = true;
  await writeFile(`${dir}/result.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ passed: true, pages: results.pages.length, screenshots: results.screenshots.length, counters: results.counters }));
} catch (error) {
  results.passed = false; results.failure = String(error);
  await writeFile(`${dir}/result.json`, JSON.stringify(results, null, 2));
  throw error;
} finally {
  await browser?.close();
  try { process.kill(-server.pid, "SIGTERM"); } catch {}
  server.stdout.destroy(); server.stderr.destroy(); server.unref();
}
