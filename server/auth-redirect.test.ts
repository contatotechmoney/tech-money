import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformSync } from "esbuild";
import { runInNewContext } from "node:vm";
import { authLink, getAuthRedirect, withAppBase } from "../client/src/lib/auth-redirect";

describe("investment entry and authentication destination", () => {
  const destination = "/investments/agents";
  it("keeps the destination through login, signup and switching back", () => {
    for (const screen of ["/sign-in", "/sign-up", "/sign-in"] as const) {
      const link = authLink(screen, destination);
      assert.equal(getAuthRedirect(link.slice(link.indexOf("?"))), destination);
    }
  });
  it("retains deep links, query parameters and fragments", () => {
    const path = "/investments/agents/PETR4?period=2026#quality";
    assert.equal(getAuthRedirect(`?redirect=${encodeURIComponent(path)}`), path);
  });
  it("supports a base path without duplicating it", () => {
    assert.equal(getAuthRedirect("?redirect=%2Fapp%2Finvestments%2Fagents", "/app"), destination);
    assert.equal(withAppBase(destination, "/app"), "/app/investments/agents");
    assert.equal(withAppBase(destination, ""), destination);
  });
  it("rejects external destinations, control characters and auth redirect loops", () => {
    for (const value of [
      "", "https://attacker.example", "//attacker.example", "/\\attacker.example",
      "/\n/attacker.example", "/", "/sign-in", "/sign-up/verify-email-address",
      "/investments/../sign-in",
      "/investments/..//attacker.example",
    ]) {
      assert.equal(getAuthRedirect(`?redirect=${encodeURIComponent(value)}`), "/areas", value);
    }
  });
  for (const state of [
    { isLoaded: false, isSignedIn: false, outcome: "loading" },
    { isLoaded: true, isSignedIn: false, outcome: "login" },
    { isLoaded: true, isSignedIn: true, outcome: "investment" },
  ]) {
    it(`handles a real AuthGuard render for the ${state.outcome} session state`, () => {
      // Execute the actual guard with simulated Clerk hook values, not an auth bypass.
      const source = readFileSync("client/src/App.tsx", "utf8");
      const guard = source.match(/function AuthGuard[\s\S]*?(?=\nfunction ProtectedRoute)/)?.[0];
      assert.ok(guard);
      const code = transformSync(`export ${guard}`, {
        loader: "tsx", format: "cjs", jsxFactory: "React.createElement",
        jsxFragment: "React.Fragment",
      }).code;
      const module = { exports: {} as { AuthGuard?: React.ComponentType<React.PropsWithChildren> } };
      const effects: (() => void)[] = [];
      const navigations: { path: string; replace: boolean }[] = [];
      runInNewContext(code, {
        module, exports: module.exports, React,
        useAuth: () => state,
        useEffect: (effect: () => void) => effects.push(effect),
        useLocation: () => [destination, (path: string, options: { replace: boolean }) => navigations.push({ path, ...options })],
        LoadingScreen: () => React.createElement("p", null, "Carregando sua sessão"),
        window: { location: { pathname: destination, search: "", hash: "" } },
        basePath: "", getAuthRedirect,
      });
      const html = renderToStaticMarkup(React.createElement(module.exports.AuthGuard!, null, "investment content"));
      effects.forEach(effect => effect());
      if (state.outcome === "loading") {
        assert.match(html, /Carregando/);
        assert.equal(navigations.length, 0);
      } else if (state.outcome === "login") {
        assert.equal(html, "");
        assert.deepEqual(navigations, [{ path: "/?redirect=%2Finvestments%2Fagents", replace: true }]);
      } else {
        assert.equal(html, "investment content");
        assert.equal(navigations.length, 0);
      }
    });
  }
  it("keeps the investment routes protected and wires both Clerk flows", () => {
    const app = readFileSync("client/src/App.tsx", "utf8");
    const login = readFileSync("client/src/pages/login.tsx", "utf8");
    assert.match(app, /<ProtectedRoute investment path="\/investments\/agents" component=\{AIAgents\}/);
    assert.match(app, /if \(!isLoaded\) return <LoadingScreen \/>/);
    assert.match(app, /if \(!isSignedIn\) return null/);
    assert.match(app, /return <>\{children\}<\/>/);
    assert.equal((app.match(/forceRedirectUrl=\{destination\}/g) || []).length, 2);
    assert.match(app, /signUpForceRedirectUrl=\{destination\}/);
    assert.match(app, /signInForceRedirectUrl=\{destination\}/);
    assert.equal((app.match(/useState\(\(\) => getAuthRedirect\(search, basePath\)\)/g) || []).length, 2);
    assert.match(login, /navigate\(redirectPath, \{ replace: true \}\)/);
    assert.match(login, /href=\{authLink\("\/sign-up", redirectPath\)\}/);
    assert.match(login, /navigate\(authLink\("\/sign-in", redirectPath\)\)/);
  });
});