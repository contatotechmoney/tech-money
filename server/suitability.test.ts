import assert from "node:assert/strict";
import { after, afterEach, describe, it } from "node:test";
import { Pool } from "pg";
import { QUESTOES, classificarPerfil, respostasSaoValidas, validarConformidade, closeSuitability } from "./suitability";

// Synthetic profiles only; never connect to a database or alter customer profiles.
const originalQuery = Pool.prototype.query;
afterEach(() => { Pool.prototype.query = originalQuery; });
after(async () => { await closeSuitability(); });

function mockProfile(score: number) {
  const row = {
    id: "synthetic-profile", userId: "synthetic-user", perfil: "AGRESSIVO",
    pontuacaoMedia: score, dataAvaliacao: new Date(),
    dataProximaReavaliacao: new Date(Date.now() + 86_400_000),
  };
  Pool.prototype.query = (async () => ({ rows: [row] })) as unknown as typeof Pool.prototype.query;
}

describe("Suitability score consistency", () => {
  it("all highest choices are valid answers and classify as aggressive", () => {
    const answers = Object.fromEntries(QUESTOES.map((q) => [q.id, 4]));
    assert.equal(respostasSaoValidas(answers), true);
    assert.equal(classificarPerfil(answers), "AGRESSIVO");
  });
  it("a valid average above four remains usable for conformity", async () => {
    for (const score of [4.1, 4.5, 5]) {
      mockProfile(score);
      const result = await validarConformidade("synthetic-user", "TEST3", 9);
      assert.equal(result.ok, true, String(score));
      assert.equal(result.perfil, "AGRESSIVO");
    }
  });
  it("rejects averages outside the generated one-to-five range", async () => {
    for (const score of [0, 0.9, 5.1, NaN, Infinity]) {
      mockProfile(score);
      const result = await validarConformidade("synthetic-user", "TEST3", 9);
      assert.equal(result.ok, false, String(score));
      assert.match(result.motivo!, /inválidos/);
    }
  });
  it("a valid high score never substitutes for missing asset risk", async () => {
    mockProfile(5);
    const result = await validarConformidade("synthetic-user", "TEST3", null);
    assert.equal(result.ok, false);
    assert.equal(result.riscoIndisponivel, true);
  });
});
