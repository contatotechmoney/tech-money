import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { after, describe, it } from "node:test";
import { createServer, type Server } from "node:http";
import { registerRoutes } from "./routes";
import {
  closeStorage,
  storage,
  type CalculatedPortfolioTransaction,
} from "./storage";

type PortfolioApiResponse = {
  items: Array<Record<string, unknown>>;
  summary: {
    realizedProfit: number;
  };
  transactions: CalculatedPortfolioTransaction[];
};

type ApiResponse<T> = {
  status: number;
  body: T;
};

after(async () => {
  await closeStorage();
});

describe("portfolio transaction API", () => {
  it("recalculates an edited sale date while preserving another ticker", async () => {
    const userId = `portfolio-api-test-${randomUUID()}`;
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async (input, init) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
      if (!url.includes("query1.finance.yahoo.com")) {
        return originalFetch(input, init);
      }

      return new Response(JSON.stringify({
        chart: {
          result: [{
            meta: {
              longName: "Test quote",
              regularMarketPrice: 100,
              chartPreviousClose: 100,
              fiftyTwoWeekHigh: 120,
              fiftyTwoWeekLow: 80,
              regularMarketVolume: 1_000,
              regularMarketTime: 1_755_984_000,
            },
            timestamp: [],
            indicators: { quote: [{ close: [] }] },
          }],
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    try {
      await storage.createTransaction({
        userId,
        ticker: "PETR4",
        transactionType: "buy",
        quantity: 10,
        price: 100,
        operationDate: "2026-08-01",
      });
      await storage.createTransaction({
        userId,
        ticker: "VALE3",
        transactionType: "buy",
        quantity: 8,
        price: 50,
        operationDate: "2026-08-02",
      });
      await storage.createTransaction({
        userId,
        ticker: "PETR4",
        transactionType: "buy",
        quantity: 10,
        price: 200,
        operationDate: "2026-08-03",
      });
      await storage.createTransaction({
        userId,
        ticker: "VALE3",
        transactionType: "sell",
        quantity: 3,
        price: 70,
        operationDate: "2026-08-04",
      });
      const petrSale = await storage.createTransaction({
        userId,
        ticker: "PETR4",
        transactionType: "sell",
        quantity: 10,
        price: 150,
        operationDate: "2026-08-05",
      });
      await storage.createTransaction({
        userId,
        ticker: "VALE3",
        transactionType: "buy",
        quantity: 5,
        price: 60,
        operationDate: "2026-08-06",
      });

      const { server, baseUrl } = await startAuthenticatedServer(userId);
      try {
        const before = await request<PortfolioApiResponse>(
          baseUrl,
          "/api/investments/portfolio",
        );
        assert.equal(before.status, 200);

        const updated = await request<{
          id: string;
          operationDate: string;
        }>(baseUrl, `/api/investments/portfolio/transactions/${petrSale.id}`, {
          method: "PATCH",
          body: JSON.stringify({ operationDate: "2026-08-02" }),
        });
        assert.equal(updated.status, 200);
        assert.equal(updated.body.id, petrSale.id);
        assert.equal(updated.body.operationDate, "2026-08-02");

        const after = await request<PortfolioApiResponse>(
          baseUrl,
          "/api/investments/portfolio",
        );
        assert.equal(after.status, 200);

        const petrItem = after.body.items.find((item) => item.ticker === "PETR4");
        assert.deepEqual(pickPositionFields(petrItem), {
          ticker: "PETR4",
          quantity: 10,
          averagePrice: 200,
          investedValue: 2_000,
          realizedProfit: 500,
        });
        assert.equal(after.body.summary.realizedProfit, 560);

        const updatedPetrSale = after.body.transactions.find(
          (transaction) => transaction.id === petrSale.id,
        );
        assert.equal(updatedPetrSale?.operationDate, "2026-08-02");
        assert.equal(updatedPetrSale?.realizedProfit, 500);
        assert.equal(updatedPetrSale?.quantityAfter, 0);
        assert.equal(updatedPetrSale?.averagePriceAfter, 0);

        assert.deepEqual(
          after.body.items.find((item) => item.ticker === "VALE3"),
          before.body.items.find((item) => item.ticker === "VALE3"),
        );
        assert.deepEqual(
          after.body.transactions.filter((transaction) => transaction.ticker === "VALE3"),
          before.body.transactions.filter((transaction) => transaction.ticker === "VALE3"),
        );
      } finally {
        await closeServer(server);
      }
    } finally {
      globalThis.fetch = originalFetch;
      const transactions = await storage.listTransactions(userId);
      for (const transaction of transactions) {
        await storage.deleteTransaction(userId, transaction.id);
      }
    }
  });
});

async function startAuthenticatedServer(userId: string): Promise<{
  server: Server;
  baseUrl: string;
}> {
  const app = express();
  app.use(express.json());

  const authHandler = Object.assign(
    () => ({ userId, tokenType: "session_token" }),
    { [Symbol.for("@clerk/express.auth")]: true },
  );
  app.use((req, _res, next) => {
    Object.assign(req, { auth: authHandler });
    next();
  });

  const server = createServer(app);
  await registerRoutes(server, app);
  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => resolve());
    server.once("error", reject);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    await closeServer(server);
    throw new Error("Test server did not expose a local address.");
  }

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function request<T>(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
): Promise<ApiResponse<T>> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
  });
  return {
    status: response.status,
    body: JSON.parse(await response.text()) as T,
  };
}

function pickPositionFields(
  item: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!item) return undefined;
  return {
    ticker: item.ticker,
    quantity: item.quantity,
    averagePrice: item.averagePrice,
    investedValue: item.investedValue,
    realizedProfit: item.realizedProfit,
  };
}