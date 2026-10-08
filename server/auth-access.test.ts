import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformSync } from "esbuild";
import { runInNewContext } from "node:vm";
import { createHash } from "node:crypto";
import { applyBrandMetadata } from "../shared/brand-metadata";
import { beginEmailCode, verifyEmailCode, type EmailCodeAttempt } from "../client/src/lib/email-code-sign-in";
import { authLink, getAccessArea, getAuthRedirect, withAppBase } from "../client/src/lib/auth-redirect";

describe("current brand audit, offline", () => {
  it("all Clerk logo assets have exactly three ascending bars and correct module labels", () => {
    for (const [file, area] of [["logo.svg", "ACESSO"], ["logo-investments.svg", "INVESTIMENTOS"], ["logo-finance.svg", "FINANCE"]]) {
      const svg = readFileSync(`client/public/${file}`, "utf8");
      assert.match(svg, new RegExp(area));
      assert.match(svg, /TECH MONEY/);
      const mark = svg.match(/<g fill="#087d61">(.+?)<\/g>/)![1];
      assert.equal((mark.match(/<rect /g) || []).length, 3);
      assert.deepEqual([...mark.matchAll(/height="(\d+)"/g)].map(item => +item[1]), [22, 31, 36]);
    }
  });
  it("committee hub has no legacy group or logo fallback and keeps all individual portraits", () => {
    const html = readFileSync("client/public/comites/central_comites.html", "utf8");
    assert.doesNotMatch(html, /tech_money_logo\.png|comite_r[ vf]\.jpg|onerror=/);
    assert.match(html, /PERSONAS SIMULADAS/);
    assert.match(html, /prefers-color-scheme:dark/);
    assert.match(html, /prefers-reduced-motion:reduce/);
    assert.match(html, /align-items:flex-end/);
    assert.match(html, /age conforme o currículo/);
    const original = readFileSync("docs/history/brand-before-three-bars/central-comites-before.html", "utf8");
    const data = (source: string) => JSON.parse(JSON.stringify(runInNewContext(
      `(${source.match(/const DATA\s*=\s*([\s\S]+?);\s*const /)![1]})`, {},
    )));
    assert.deepEqual(data(html), data(original), "every persona field and curriculum preserved");
  });
  it("both host modules and committee deep links have correct share identity, not Replit metadata", () => {
    const html = readFileSync("client/index.html", "utf8");
    assert.doesNotMatch(html, /replit\.com\/public|@replit/);
    for (const [host, area] of [["invest.techmoney.com.br", "Investimentos"], ["finance.techmoney.com.br", "Finance"]]) {
      const result = applyBrandMetadata(html, host);
      assert.match(result, new RegExp(`Tech Money — ${area}`));
      assert.match(result, new RegExp(`opengraph-${area === "Finance" ? "finance" : "investments"}\\.jpg`));
    }
    assert.match(applyBrandMetadata(html, "local.test", "/comites/central_comites.html"), /opengraph-investments/);
    assert.match(applyBrandMetadata(html, "finance.techmoney.com.br", "/sign-in?redirect=%2Finvestments%2Fagents"), /opengraph-investments/);
    assert.match(applyBrandMetadata(html, "invest.techmoney.com.br", "/sign-up?redirect=%2Fdashboard"), /opengraph-finance/);
    assert.match(applyBrandMetadata(html, "invest.techmoney.com.br", "/sign-in", "https://invest.techmoney.com.br"),
      /https:\/\/invest\.techmoney\.com\.br\/opengraph-investments\.jpg/);
    assert.doesNotMatch(applyBrandMetadata(html, "local.test", "/sign-in", "https://attacker.example"), /attacker\.example/);
    assert.doesNotMatch(applyBrandMetadata(html, '"><script>invalid</script>'), /<script>invalid/);
  });
  it("historical assets are preserved separately and public assets are no longer those originals", () => {
    const hash = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
    for (const file of ["logo.svg", "favicon.png", "opengraph.jpg", "comites/tech_money_logo.png", "comites/comite_rv.jpg", "comites/comite_rf.jpg"]) {
      assert.notEqual(hash(`client/public/${file}`), hash(`docs/history/brand-before-three-bars/${file.replaceAll("/", "-")}`));
    }
  });
});

function attempt(overrides: Partial<EmailCodeAttempt> = {}): EmailCodeAttempt {
  const resource: EmailCodeAttempt = {
    status: "needs_first_factor", createdSessionId: null, protectCheck: null,
    supportedFirstFactors: [{ strategy: "email_code", emailAddressId: "synthetic-email" }],
    prepareFirstFactor: async () => resource,
    attemptFirstFactor: async () => resource,
    ...overrides,
  };
  return resource;
}

describe("email code with synthetic Clerk resources, no provider requests", () => {
  it("prepares only an email_code factor explicitly offered by Clerk", async () => {
    const calls: unknown[] = [];
    const resource = attempt({ prepareFirstFactor: async input => { calls.push(input); return resource; } });
    assert.deepEqual(await beginEmailCode({ create: async input => { calls.push(input); return resource; } }, "personal@gmail.com"), { kind: "code" });
    assert.deepEqual(calls, [{ identifier: "personal@gmail.com" }, { strategy: "email_code", emailAddressId: "synthetic-email" }]);
  });
  it("falls back without preparing email when only configured alternatives exist", async () => {
    for (const factors of [null, [], [{ strategy: "password" }], [{ strategy: "oauth_google" }], [{ strategy: "email_code" }]]) {
      const resource = attempt({ supportedFirstFactors: factors,
        prepareFirstFactor: async () => { assert.fail("must not send a code"); } });
      assert.deepEqual(await beginEmailCode({ create: async () => resource }, "team@company.org"), { kind: "native" });
    }
  });
  it("keeps CAPTCHA/Protect checks in native Clerk before sending any code", async () => {
    const resource = attempt({ protectCheck: { synthetic: true },
      prepareFirstFactor: async () => { assert.fail("must preserve security challenge"); } });
    assert.deepEqual(await beginEmailCode({ create: async () => resource }, "personal@gmail.com"), { kind: "native" });
  });
  it("preserves security checks that appear during preparation", async () => {
    const resource = attempt({ prepareFirstFactor: async () => attempt({ status: "needs_protect_check" }) });
    assert.deepEqual(await beginEmailCode({ create: async () => resource }, "personal@gmail.com"), { kind: "native" });
  });
  it("does not activate a session while MFA, client trust or another factor is pending", async () => {
    for (const status of ["needs_second_factor", "needs_first_factor", "needs_protect_check", "needs_identifier", null, "unknown"]) {
      const resource = attempt({ attemptFirstFactor: async () => attempt({ status, createdSessionId: "not-valid-yet" }) });
      assert.deepEqual(await verifyEmailCode(resource, "123456"), { kind: "native" });
    }
  });
  it("requires both completed authentication and the Clerk session id", async () => {
    for (const result of [
      attempt({ status: "complete", createdSessionId: null }),
      attempt({ status: "complete", createdSessionId: "pending", protectCheck: { synthetic: true } }),
    ]) {
      assert.deepEqual(await verifyEmailCode(attempt({ attemptFirstFactor: async () => result }), "123456"), { kind: "native" });
    }
    const calls: unknown[] = [];
    const resource = attempt({ attemptFirstFactor: async input => {
      calls.push(input); return attempt({ status: "complete", createdSessionId: "clerk-synthetic-session" });
    } });
    assert.deepEqual(await verifyEmailCode(resource, "123456"), { kind: "complete", sessionId: "clerk-synthetic-session" });
    assert.deepEqual(calls, [{ strategy: "email_code", code: "123456" }]);
  });
  it("does not swallow provider failures or fake a successful session", async () => {
    await assert.rejects(beginEmailCode({ create: async () => { throw new Error("synthetic CAPTCHA or rate limit"); } }, "person@example.org"));
    await assert.rejects(verifyEmailCode(attempt({ attemptFirstFactor: async () => { throw new Error("synthetic wrong code"); } }), "111111"));
  });
});

function loadComponent(path: string, name: string, globals: Record<string, unknown>) {
  const source = readFileSync(path, "utf8").replace(/^import .*;\n/gm, "")
    .replace('import.meta.env.BASE_URL', '"/"');
  const code = transformSync(source, { loader: "tsx", format: "cjs",
    jsxFactory: "React.createElement", jsxFragment: "React.Fragment" }).code;
  const module = { exports: {} as Record<string, React.ComponentType<any>> };
  runInNewContext(code, { module, exports: module.exports, React, URLSearchParams, ...globals });
  return module.exports[name];
}

describe("real access UI rendered with synthetic hooks", () => {
  const Link = ({ href, children, ...props }: any) => React.createElement("a", { href, ...props }, children);
  const Brand = loadComponent("client/src/components/tech-money-brand.tsx", "TechMoneyBrand", {});
  const Shell = loadComponent("client/src/components/auth-access-shell.tsx", "AuthAccessShell", { Link, TechMoneyBrand: Brand });
  it("reuses exactly three bars and correct module identity in every brand variant", () => {
    for (const areaLabel of ["INVESTIMENTOS", "FINANCE", "ÁREAS"]) {
      for (const variant of ["auth", "compact", "selection"]) {
        const html = renderToStaticMarkup(React.createElement(Brand, { areaLabel, variant }));
        assert.ok(html.includes(`aria-label="Tech Money ${areaLabel}"`));
        assert.match(html, /aria-hidden="true"><span><\/span><span><\/span><span><\/span>/);
        assert.match(html, /TECH MONEY/);
        if (variant !== "compact") assert.ok(html.includes(`>${areaLabel}</span>`));
      }
    }
  });
  it("disables brand animation for reduced motion and replaces the old internal marks", () => {
    const css = readFileSync("client/src/components/tech-money-brand.css", "utf8");
    assert.match(css, /prefers-reduced-motion: reduce[\s\S]*animation: none !important/);
    for (const [file, label] of [
      ["investment-layout.tsx", "INVESTIMENTOS"], ["layout.tsx", "FINANCE"],
    ]) {
      const source = readFileSync(`client/src/components/${file}`, "utf8");
      assert.ok(source.includes(`<TechMoneyBrand areaLabel="${label}"`));
      assert.doesNotMatch(source, /font-bold">[TMR]<\/div>/);
    }
    const areas = readFileSync("client/src/pages/area-selection.tsx", "utf8");
    assert.match(areas, /<TechMoneyBrand areaLabel="ÁREAS"/);
    assert.match(areas, /href: "\/dashboard"/);
    assert.match(areas, /href: "\/investments\/agents"/);
    assert.match(areas, /motion-reduce:transform-none motion-reduce:transition-none/);
  });
  it("renders both branded shells and safe SPA navigation without providers", () => {
    assert.equal(getAccessArea("invest.techmoney.com.br", "/dashboard?view=test#start"), "finance");
    assert.equal(getAccessArea("finance.techmoney.com.br", "/investments/agents?view=test"), "invest");
    for (const area of ["invest", "finance"] as const) {
      const destination = area === "invest" ? "/investments/agents" : "/dashboard";
      const html = renderToStaticMarkup(React.createElement(Shell, {
        area, mode: "sign-up", signInHref: authLink("/sign-in", destination),
        signUpHref: authLink("/sign-up", destination), children: "synthetic form",
      }));
      assert.match(html, area === "invest" ? /INVESTIMENTOS/ : /FINANCE/);
      assert.match(html, /Bem-vindo à Tech Money/);
      assert.match(html, /aria-current="page">Criar conta/);
      assert.match(html, /synthetic form/);
    }
  });
  function renderAccess(path: string, search: string, host: string, status: string | null = null) {
    const requests: unknown[] = [];
    const Access = loadComponent("client/src/components/auth-access-page.tsx", "AuthAccessPage", {
      AuthAccessShell: Shell, Link, authLink, getAccessArea, getAuthRedirect, withAppBase,
      beginEmailCode, verifyEmailCode,
      useLocation: () => [path, () => { assert.fail("SSR must not navigate"); }],
      useSearch: () => search,
      useAuth: () => ({ isLoaded: true, isSignedIn: false }),
      useSession: () => ({ session: null }),
      useSignIn: () => ({ isLoaded: true, signIn: { status, create: () => requests.push("forbidden") } }),
      SignIn: (props: any) => React.createElement("div", { "data-native": true, "data-path": props.path, "data-destination": props.forceRedirectUrl }, "Clerk MFA CAPTCHA"),
      BusinessSignUp: (props: any) => React.createElement("div", { "data-signup": true, "data-destination": props.forceRedirectUrl }, "Clerk verification"),
      window: { location: { hostname: host } },
    });
    const html = renderToStaticMarkup(React.createElement(Access, { mode: path.startsWith("/sign-up") ? "sign-up" : "sign-in" }));
    assert.equal(requests.length, 0);
    return html;
  }
  it("opening either host renders its branded form without sending email", () => {
    assert.match(renderAccess("/", "", "finance.techmoney.com.br"), /FINANCE/);
    assert.match(renderAccess("/", "", "invest.techmoney.com.br"), /INVESTIMENTOS/);
  });
  it("native fallback and MFA callback preserve the exact destination", () => {
    const html = renderAccess("/sign-in/factor-two", "?redirect=%2Finvestments%2Fagents", "finance.techmoney.com.br", "needs_second_factor");
    assert.match(html, /data-native="true"/);
    assert.match(html, /data-path="\/sign-in"/);
    assert.match(html, /data-destination="\/investments\/agents"/);
    assert.match(html, /Clerk MFA CAPTCHA/);
    assert.match(renderAccess("/sign-in", "?method=clerk", "finance.techmoney.com.br"), /data-native="true"/);
  });
  it("signup delegates verification to existing BusinessSignUp with the safe destination", () => {
    const html = renderAccess("/sign-up", "?redirect=%2Fdashboard", "invest.techmoney.com.br");
    assert.match(html, /data-signup="true"/);
    assert.match(html, /data-destination="\/dashboard"/);
  });
  it("keeps session tasks, CAPTCHA containers, verification and the Supabase guard", () => {
    const access = readFileSync("client/src/components/auth-access-page.tsx", "utf8");
    assert.match(access, /activeSession.currentTask \? nativeHref : redirectPath/);
    assert.match(access, /id="clerk-captcha"/);
    assert.match(access, /catch \{[\s\S]*navigate\(nativeHref\)/);
    const app = readFileSync("client/src/App.tsx", "utf8");
    assert.match(app, /registerPortal=\{investment\}/);
    assert.match(app, /<PortalRegistration>\{children\}<\/PortalRegistration>/);
    const registration = readFileSync("client/src/components/portal-registration.tsx", "utf8");
    assert.match(registration, /useState\(false\)/);
    assert.match(registration, /credentials: "same-origin"/);
  });
  it("uses exact card values and disables animation under reduced motion", () => {
    const css = readFileSync("client/src/components/auth-access-shell.css", "utf8");
    for (const value of ["#f4f7f6", "#e1e8e6", "#087d61", "max-width: 440px", "padding: 32px", "border-radius: 12px"]) assert.ok(css.includes(value));
    assert.match(css, /prefers-reduced-motion: reduce/);
    assert.match(css, /animation: none !important/);
    assert.doesNotMatch(css, /captcha[^}]*display:\s*none/i);
  });
});
