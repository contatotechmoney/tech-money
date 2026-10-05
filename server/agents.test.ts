import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { parseNota, runCommittee } from "./agents";

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.LLM_API_KEY;
const originalApiBase = process.env.LLM_API_BASE;
const originalModel = process.env.LLM_MODEL;
const originalOpenAIKey = process.env.OPENAI_API_KEY;

afterEach(() => {
  globalThis.fetch = originalFetch;
  restoreEnv("LLM_API_KEY", originalApiKey);
  restoreEnv("LLM_API_BASE", originalApiBase);
  restoreEnv("LLM_MODEL", originalModel);
  restoreEnv("OPENAI_API_KEY", originalOpenAIKey);
});

describe("Risk Officer score validity", () => {
  it("has no invented scores, consensus or trading signal when no LLM is configured", async () => {
    delete process.env.LLM_API_KEY;
    delete process.env.OPENAI_API_KEY;
    globalThis.fetch = async () => { throw new Error("No request should be made"); };
    const verdict = await runCommittee(testContext());
    assert.equal(verdict.analysisQuality.status, "unavailable");
    assert.equal(verdict.analysisQuality.consensusScore, null);
    assert.equal(verdict.riskScore, null);
    assert.ok(verdict.agents.every((a) => a.nota === null && !a.scoreAvailable));
    assert.equal(verdict.signal, "Recomendação pendente");
    assert.doesNotMatch(verdict.summary, /nota consolidada|Comprar|Manter|Evitar/);
  });

  it("labels failure of all configured agents unavailable, never as a valid committee", async () => {
    process.env.LLM_API_KEY = "synthetic-key";
    globalThis.fetch = async () => new Response("Synthetic outage", { status: 503 });
    const verdict = await runCommittee(testContext());
    assert.equal(verdict.analysisQuality.status, "unavailable");
    assert.equal(verdict.analysisQuality.availableAgents, 0);
    assert.equal(verdict.analysisQuality.consensusScore, null);
    assert.equal(verdict.riskScore, null);
    assert.ok(verdict.agents.every((a) => a.nota === null));
    assert.match(verdict.source, /indisponível/);
    assert.doesNotMatch(verdict.outlook, /Veredito|Comprar|Manter/);
  });

  it("valid full analysis has a technical consensus but no personalized financial signal", async () => {
    mockScores(3);
    const verdict = await runCommittee(testContext());
    assert.equal(verdict.analysisQuality.status, "complete");
    assert.equal(verdict.analysisQuality.availableAgents, 9);
    assert.equal(verdict.riskScore, 3);
    assert.ok(verdict.analysisQuality.consensusScore !== null);
    assert.equal(verdict.signal, "Recomendação pendente");
    assert.match(verdict.summary, /2026-06-30/);
    assert.doesNotMatch(verdict.summary, /1S26|Comprar|Manter|Evitar/);
  });

  it("partial analysis is informational and has no consensus", async () => {
    mockScores(3, "Moat & Estratégia");
    const verdict = await runCommittee(testContext());
    assert.equal(verdict.analysisQuality.status, "partial");
    assert.equal(verdict.analysisQuality.availableAgents, 8);
    assert.equal(verdict.analysisQuality.consensusScore, null);
    assert.equal(verdict.signal, "Recomendação pendente");
    assert.equal(verdict.agents.find((a) => a.role === "Moat & Estratégia")?.nota, null);
  });

  it("elevated risk lowers attractiveness and activates a safety veto", async () => {
    mockScores(3);
    const low = await runCommittee(testContext());
    mockScores(9);
    const high = await runCommittee(testContext());
    assert.ok(high.analysisQuality.consensusScore! < low.analysisQuality.consensusScore!);
    assert.equal(high.riskScore, 9);
    assert.equal(high.analysisQuality.highRisk, true);
    assert.ok(high.risks.some((r) => r.includes("veto")));
    assert.equal(high.signal, "Recomendação pendente");
  });

  it("missing financial data dates prevents a complete analysis or consensus", async () => {
    mockScores(3);
    const context = testContext();
    context.quote.updatedAt = "";
    const verdict = await runCommittee(context);
    assert.equal(verdict.analysisQuality.status, "partial");
    assert.equal(verdict.analysisQuality.consensusScore, null);
  });

  it("invalid out-of-range responses never become clamped/artificial scores", async () => {
    process.env.LLM_API_KEY = "synthetic-key";
    globalThis.fetch = async () => new Response(JSON.stringify({
      choices: [{ message: { content: "Nota: 100/10" } }],
    }));
    const verdict = await runCommittee(testContext());
    assert.equal(verdict.analysisQuality.status, "unavailable");
    assert.ok(verdict.agents.every((a) => a.nota === null));
  });
  it("does not persist a neutral risk when the Risk Officer response has no score", async () => {
    process.env.LLM_API_KEY = "test-key";
    process.env.LLM_API_BASE = "https://llm.test";
    process.env.LLM_MODEL = "test-model";
    globalThis.fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      const prompt = body.messages.at(-1)?.content || "";
      const content = prompt.includes("Risk Officer")
        ? "A exposição exige atenção, mas não há classificação estruturada."
        : "Cenário analisado. Nota: 7/10";
      return new Response(JSON.stringify({
        choices: [{ message: { content } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    };

    const verdict = await runCommittee(testContext());

    assert.equal(verdict.riskScore, null);
    assert.equal(verdict.agents.find((agent) => agent.role === "Risk Officer")?.scoreAvailable, false);
  });

  it("does not persist a risk when the Risk Officer request fails", async () => {
    process.env.LLM_API_KEY = "test-key";
    process.env.LLM_API_BASE = "https://llm.test";
    process.env.LLM_MODEL = "test-model";
    globalThis.fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      const prompt = body.messages.at(-1)?.content || "";
      if (prompt.includes("Risk Officer")) throw new Error("Risk Officer unavailable");
      return new Response(JSON.stringify({
        choices: [{ message: { content: "Cenário analisado. Nota: 7/10" } }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    };

    const verdict = await runCommittee(testContext());

    assert.equal(verdict.riskScore, null);
    assert.equal(verdict.agents.find((agent) => agent.role === "Risk Officer")?.scoreAvailable, false);
  });
});

function testContext() {
  return {
    ticker: "LEVE3",
    companyName: "Metal Leve",
    quote: { price: 25, changePercent: 0, updatedAt: new Date().toISOString() },
    fundamentos: {
      ticker: "LEVE3",
      cnpj: "00.000.000/0001-00",
      companyName: "Metal Leve",
      demonstrativo: "ITR" as const,
      ano: 2026,
      periodoReferencia: "2026-06-30",
      dataRecebimento: "2026-08-01",
      receitaLiquida: 1_000_000,
      ebit: 100_000,
      ebt: 90_000,
      lucroLiquido: 80_000,
      ativoTotal: 2_000_000,
      patrimonioLiquido: 1_200_000,
      fonte: "Teste",
    },
  };
}

function mockScores(risk: number, failedRole?: string) {
  process.env.LLM_API_KEY = "synthetic-key";
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
    const role = body.messages[0].content;
    if (role === failedRole) throw new Error("Synthetic agent outage");
    const content = role === "Risk Officer" ? `Risco: ${risk}/10 | Downside: 20%`
      : role === "Analista Político-Jurídico" ? "Risco: 2/10" : "Nota: 8/10";
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }));
  };
}

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

describe("Explicit score parsing", () => {
  it("accepts one score, comma decimals and the ten-point scale", () => {
    assert.equal(parseNota("Análise informativa.\nNota: 7,5/10"), 7.5);
    assert.equal(parseNota("Risco: 9/10 | Downside: 20%"), 9);
    assert.equal(parseNota("Nota: 0"), 0);
    assert.equal(parseNota("Nota: 10/10"), 10);
  });
  it("rejects ambiguous, negative, malformed or differently scaled scores", () => {
    for (const text of ["Nota: -1/10", "Nota: 7/100", "Nota: 7e2", "Nota: 7.2.3/10", "Nota: 11/10", "Nota: 7/10\nNota: 8/10", "Nota: 7/10 | Risco: 8/10"]) {
      assert.equal(parseNota(text), null, text);
    }
  });
});
