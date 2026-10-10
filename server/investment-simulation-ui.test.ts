import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it } from "node:test";
import { InvestmentSimulationBody } from "../client/src/components/investment-simulation-panel";

function render(owner: string, cache: QueryClient) {
  return renderToStaticMarkup(createElement(QueryClientProvider, { client: cache },
    createElement(InvestmentSimulationBody, { userId: owner })));
}
function cache() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, staleTime: Infinity } } });
  for (const owner of ["alpha", "beta"]) client.setQueryData(["/api/investments/simulation-options", owner], {
    mode: "simulation", tickers: ["BBDC3", "BBAS3"], realAnalysisEnabled: false, tokensUsed: 0, creditsDebited: 0,
  });
  return client;
}
describe("Simulation UI safety and account isolation", () => {
  it("labels fictional data and zero costs without asserting review", () => {
    const client = cache(); client.setQueryData(["/api/investments/simulations", "alpha"], { studies: [] });
    const html = render("alpha", client);
    assert.match(html, /SIMULAÇÃO — DADOS FICTÍCIOS/);
    assert.match(html, /0 utilizados/); assert.match(html, /0 debitados/);
    assert.match(html, /Nenhum estudo demonstrativo ainda/);
    assert.match(html, /não constitui recomendação aprovada/);
    assert.match(html, /não consulta provedores externos/);
  });
  it("does not render another account's cached studies", () => {
    const client = cache();
    client.setQueryData(["/api/investments/simulations", "alpha"], { studies: [{
      id: "private-alpha", ticker: "PRIVATE-ALPHA", status: "completed", createdAt: new Date().toISOString(), stage: "Private history",
    }] });
    client.setQueryData(["/api/investments/simulations", "beta"], { studies: [] });
    assert.match(render("alpha", client), /PRIVATE-ALPHA/);
    assert.doesNotMatch(render("beta", client), /PRIVATE-ALPHA|Private history/);
  });
  it("does not replace failed history with an empty state", () => {
    const client = cache();
    const query = client.getQueryCache().build(client, { queryKey: ["/api/investments/simulations", "alpha"] });
    query.setState({ status: "error", error: Error("synthetic outage"), fetchStatus: "idle" });
    const html = render("alpha", client);
    assert.match(html, /Não foi possível carregar o histórico/);
    assert.doesNotMatch(html, /Nenhum estudo demonstrativo ainda/);
    assert.match(html, /Histórico indisponível/);
  });
  it("refuses options that claim real analysis is enabled", () => {
    const client = cache();
    client.setQueryData(["/api/investments/simulation-options", "alpha"], { mode: "simulation", realAnalysisEnabled: true });
    const html = render("alpha", client);
    assert.match(html, /não confirma um ambiente exclusivamente simulado/);
    assert.doesNotMatch(html, /Iniciar uma demonstração/);
  });
});
