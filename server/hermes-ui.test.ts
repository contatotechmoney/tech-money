import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it } from "node:test";
import { HermesAnalysisPanel } from "../client/src/components/hermes-analysis-panel";

function render(options: unknown) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false, queryFn: async () => { throw new Error("Unexpected network request in SSR test"); } } } });
  client.setQueryData(["/api/investments/analysis-options"], options);
  client.setQueryData(["/api/investments/analyses"], { jobs: [] });
  try { return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(HermesAnalysisPanel))); }
  finally { client.clear(); }
}
describe("Hermes panel with synthetic cache and no network", () => {
  it("disabled connection shows its actual state and offers no submission", () => {
    const html = render({ available: false, models: [], tickers: [], message: "Conexão de teste desativada" });
    assert.ok(html.includes("Conexão de teste desativada"));
    assert.ok(html.includes("As análises do módulo atual abaixo usam outro motor"));
    assert.ok(!html.includes("<select"));
    assert.ok(!html.includes(">Solicitar análise</button>"));
  });
  it("enabled pilot exposes approved choices and its budget without implying client approval", () => {
    const html = render({ available: true, models: [{ id: "standard", label: "Modelo sintético" }], tickers: ["BBDC3"], dailyLimit: 3 });
    assert.ok(html.includes("BBDC3") && html.includes("Modelo sintético"));
    assert.ok(html.includes("até 3 solicitações em 24 horas"));
    assert.ok(html.includes("Recomendações para clientes exigem uma etapa própria"));
    assert.ok(!html.includes("API_KEY") && !html.includes("run_id"));
  });
});
