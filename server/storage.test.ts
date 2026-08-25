import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, afterEach, describe, it } from "node:test";
import {
  closeStorage,
  PortfolioValidationError,
  storage,
} from "./storage";

const TEST_DATE = "2026-08-23";

const createdUsers = new Set<string>();

afterEach(async () => {
  for (const userId of createdUsers) {
    const transactions = await storage.listTransactions(userId);
    for (const transaction of transactions) {
      await storage.deleteTransaction(userId, transaction.id);
    }
  }
  createdUsers.clear();
});

after(async () => {
  await closeStorage();
});

function newUser(): string {
  const userId = `portfolio-test-${randomUUID()}`;
  createdUsers.add(userId);
  return userId;
}

async function createTransaction(
  userId: string,
  transactionType: "buy" | "sell",
  quantity: number,
  price: number,
  operationDate = TEST_DATE,
  ticker = "PETR4",
) {
  return storage.createTransaction({
    userId,
    ticker,
    transactionType,
    quantity,
    price,
    operationDate,
  });
}

describe("portfolio transaction accounting", () => {
  it("calculates the weighted average across buys at different prices", async () => {
    const userId = newUser();
    await createTransaction(userId, "buy", 10, 100, "2026-08-01");
    await createTransaction(userId, "buy", 5, 130, "2026-08-02");

    const snapshot = await storage.getPortfolioSnapshot(userId);

    assert.deepEqual(snapshot.positions, [{
      ticker: "PETR4",
      quantity: 15,
      averagePrice: 110,
      investedValue: 1650,
      realizedProfit: 0,
    }]);
    assert.equal(snapshot.realizedProfit, 0);
  });

  it("keeps the average cost while calculating profit on a partial sell", async () => {
    const userId = newUser();
    await createTransaction(userId, "buy", 10, 100, "2026-08-01");
    await createTransaction(userId, "buy", 5, 130, "2026-08-02");
    await createTransaction(userId, "sell", 6, 150, "2026-08-03");

    const snapshot = await storage.getPortfolioSnapshot(userId);
    const sale = snapshot.transactions.find(
      (transaction) => transaction.transactionType === "sell",
    );

    assert.equal(sale?.realizedProfit, 240);
    assert.equal(sale?.quantityAfter, 9);
    assert.equal(sale?.averagePriceAfter, 110);
    assert.deepEqual(snapshot.positions[0], {
      ticker: "PETR4",
      quantity: 9,
      averagePrice: 110,
      investedValue: 990,
      realizedProfit: 240,
    });
    assert.equal(snapshot.realizedProfit, 240);
  });

  it("keeps positions and realized profit independent across interleaved tickers", async () => {
    const userId = newUser();
    await createTransaction(userId, "buy", 10, 100, "2026-08-01", "PETR4");
    await createTransaction(userId, "buy", 8, 50, "2026-08-02", "VALE3");
    await createTransaction(userId, "buy", 5, 130, "2026-08-03", "PETR4");
    await createTransaction(userId, "sell", 3, 70, "2026-08-04", "VALE3");
    await createTransaction(userId, "sell", 6, 150, "2026-08-05", "PETR4");
    await createTransaction(userId, "buy", 5, 60, "2026-08-06", "VALE3");

    const snapshot = await storage.getPortfolioSnapshot(userId);
    const petrSale = snapshot.transactions.find(
      (transaction) => transaction.ticker === "PETR4" && transaction.transactionType === "sell",
    );
    const valeSale = snapshot.transactions.find(
      (transaction) => transaction.ticker === "VALE3" && transaction.transactionType === "sell",
    );

    assert.equal(petrSale?.realizedProfit, 240);
    assert.equal(petrSale?.quantityAfter, 9);
    assert.equal(petrSale?.averagePriceAfter, 110);
    assert.equal(valeSale?.realizedProfit, 60);
    assert.equal(valeSale?.quantityAfter, 5);
    assert.equal(valeSale?.averagePriceAfter, 50);
    assert.deepEqual(snapshot.positions, [
      {
        ticker: "PETR4",
        quantity: 9,
        averagePrice: 110,
        investedValue: 990,
        realizedProfit: 240,
      },
      {
        ticker: "VALE3",
        quantity: 10,
        averagePrice: 55,
        investedValue: 550,
        realizedProfit: 60,
      },
    ]);
    assert.equal(snapshot.realizedProfit, 300);
  });

  it("removes a position after selling its entire available quantity", async () => {
    const userId = newUser();
    await createTransaction(userId, "buy", 4, 100, "2026-08-01");
    await createTransaction(userId, "sell", 4, 125, "2026-08-02");

    const snapshot = await storage.getPortfolioSnapshot(userId);
    const sale = snapshot.transactions.find(
      (transaction) => transaction.transactionType === "sell",
    );

    assert.deepEqual(snapshot.positions, []);
    assert.equal(snapshot.realizedProfit, 100);
    assert.equal(sale?.realizedProfit, 100);
    assert.equal(sale?.quantityAfter, 0);
    assert.equal(sale?.averagePriceAfter, 0);
  });

  it("recalculates realized profit when a historical buy is edited", async () => {
    const userId = newUser();
    const firstBuy = await createTransaction(userId, "buy", 10, 100, "2026-08-01");
    await createTransaction(userId, "buy", 10, 200, "2026-08-03");
    await createTransaction(userId, "sell", 10, 150, "2026-08-05");

    const beforeEdit = await storage.getPortfolioSnapshot(userId);
    assert.equal(beforeEdit.realizedProfit, 0);
    assert.equal(beforeEdit.positions[0]?.averagePrice, 150);

    const updated = await storage.updateTransaction(userId, firstBuy.id, { price: 80 });
    assert.equal(updated?.price, 80);

    const afterEdit = await storage.getPortfolioSnapshot(userId);
    const sale = afterEdit.transactions.find(
      (transaction) => transaction.transactionType === "sell",
    );
    assert.equal(afterEdit.realizedProfit, 100);
    assert.equal(afterEdit.positions[0]?.quantity, 10);
    assert.equal(afterEdit.positions[0]?.averagePrice, 140);
    assert.equal(afterEdit.positions[0]?.investedValue, 1400);
    assert.equal(sale?.realizedProfit, 100);
  });

  it("keeps another ticker unchanged when a historical transaction is edited", async () => {
    const userId = newUser();
    const petrFirstBuy = await createTransaction(userId, "buy", 10, 100, "2026-08-01", "PETR4");
    await createTransaction(userId, "buy", 8, 50, "2026-08-02", "VALE3");
    await createTransaction(userId, "buy", 10, 200, "2026-08-03", "PETR4");
    await createTransaction(userId, "sell", 3, 70, "2026-08-04", "VALE3");
    await createTransaction(userId, "sell", 10, 150, "2026-08-05", "PETR4");
    await createTransaction(userId, "buy", 5, 60, "2026-08-06", "VALE3");

    const beforeEdit = await storage.getPortfolioSnapshot(userId);
    assert.deepEqual(beforeEdit.positions, [
      {
        ticker: "PETR4",
        quantity: 10,
        averagePrice: 150,
        investedValue: 1500,
        realizedProfit: 0,
      },
      {
        ticker: "VALE3",
        quantity: 10,
        averagePrice: 55,
        investedValue: 550,
        realizedProfit: 60,
      },
    ]);
    assert.equal(beforeEdit.realizedProfit, 60);

    const updated = await storage.updateTransaction(userId, petrFirstBuy.id, { price: 80 });
    assert.equal(updated?.price, 80);

    const afterEdit = await storage.getPortfolioSnapshot(userId);
    assert.deepEqual(
      afterEdit.transactions.filter((transaction) => transaction.ticker === "VALE3"),
      beforeEdit.transactions.filter((transaction) => transaction.ticker === "VALE3"),
    );
    assert.deepEqual(
      afterEdit.positions.find((position) => position.ticker === "VALE3"),
      beforeEdit.positions.find((position) => position.ticker === "VALE3"),
    );
    assert.deepEqual(afterEdit.positions, [
      {
        ticker: "PETR4",
        quantity: 10,
        averagePrice: 140,
        investedValue: 1400,
        realizedProfit: 100,
      },
      {
        ticker: "VALE3",
        quantity: 10,
        averagePrice: 55,
        investedValue: 550,
        realizedProfit: 60,
      },
    ]);
    assert.equal(afterEdit.realizedProfit, 160);

    const petrSale = afterEdit.transactions.find(
      (transaction) => transaction.ticker === "PETR4" && transaction.transactionType === "sell",
    );
    assert.equal(petrSale?.realizedProfit, 100);
    assert.equal(petrSale?.quantityAfter, 10);
    assert.equal(petrSale?.averagePriceAfter, 140);
  });

  it("keeps another ticker unchanged when a historical sale is edited", async () => {
    const userId = newUser();
    await createTransaction(userId, "buy", 10, 100, "2026-08-01", "PETR4");
    await createTransaction(userId, "buy", 8, 50, "2026-08-02", "VALE3");
    await createTransaction(userId, "buy", 10, 200, "2026-08-03", "PETR4");
    await createTransaction(userId, "sell", 3, 70, "2026-08-04", "VALE3");
    const petrSale = await createTransaction(userId, "sell", 10, 150, "2026-08-05", "PETR4");
    await createTransaction(userId, "buy", 5, 60, "2026-08-06", "VALE3");

    const beforeEdit = await storage.getPortfolioSnapshot(userId);
    assert.deepEqual(beforeEdit.positions, [
      {
        ticker: "PETR4",
        quantity: 10,
        averagePrice: 150,
        investedValue: 1500,
        realizedProfit: 0,
      },
      {
        ticker: "VALE3",
        quantity: 10,
        averagePrice: 55,
        investedValue: 550,
        realizedProfit: 60,
      },
    ]);
    assert.equal(beforeEdit.realizedProfit, 60);

    const updated = await storage.updateTransaction(userId, petrSale.id, { price: 180 });
    assert.equal(updated?.price, 180);

    const afterEdit = await storage.getPortfolioSnapshot(userId);
    assert.deepEqual(
      afterEdit.transactions.filter((transaction) => transaction.ticker === "VALE3"),
      beforeEdit.transactions.filter((transaction) => transaction.ticker === "VALE3"),
    );
    assert.deepEqual(
      afterEdit.positions.find((position) => position.ticker === "VALE3"),
      beforeEdit.positions.find((position) => position.ticker === "VALE3"),
    );
    assert.deepEqual(afterEdit.positions, [
      {
        ticker: "PETR4",
        quantity: 10,
        averagePrice: 150,
        investedValue: 1500,
        realizedProfit: 300,
      },
      {
        ticker: "VALE3",
        quantity: 10,
        averagePrice: 55,
        investedValue: 550,
        realizedProfit: 60,
      },
    ]);
    assert.equal(afterEdit.realizedProfit, 360);

    const updatedPetrSale = afterEdit.transactions.find(
      (transaction) => transaction.id === petrSale.id,
    );
    assert.equal(updatedPetrSale?.realizedProfit, 300);
    assert.equal(updatedPetrSale?.quantityAfter, 10);
    assert.equal(updatedPetrSale?.averagePriceAfter, 150);
  });

  it("keeps another ticker unchanged when a historical sale date is edited", async () => {
    const userId = newUser();
    await createTransaction(userId, "buy", 10, 100, "2026-08-01", "PETR4");
    await createTransaction(userId, "buy", 8, 50, "2026-08-02", "VALE3");
    await createTransaction(userId, "buy", 10, 200, "2026-08-03", "PETR4");
    await createTransaction(userId, "sell", 3, 70, "2026-08-04", "VALE3");
    const petrSale = await createTransaction(userId, "sell", 10, 150, "2026-08-05", "PETR4");
    await createTransaction(userId, "buy", 5, 60, "2026-08-06", "VALE3");

    const beforeEdit = await storage.getPortfolioSnapshot(userId);
    assert.deepEqual(beforeEdit.positions, [
      {
        ticker: "PETR4",
        quantity: 10,
        averagePrice: 150,
        investedValue: 1500,
        realizedProfit: 0,
      },
      {
        ticker: "VALE3",
        quantity: 10,
        averagePrice: 55,
        investedValue: 550,
        realizedProfit: 60,
      },
    ]);
    assert.equal(beforeEdit.realizedProfit, 60);

    const updated = await storage.updateTransaction(userId, petrSale.id, {
      operationDate: "2026-08-02",
    });
    assert.equal(updated?.operationDate, "2026-08-02");

    const afterEdit = await storage.getPortfolioSnapshot(userId);
    assert.deepEqual(
      afterEdit.transactions.filter((transaction) => transaction.ticker === "VALE3"),
      beforeEdit.transactions.filter((transaction) => transaction.ticker === "VALE3"),
    );
    assert.deepEqual(
      afterEdit.positions.find((position) => position.ticker === "VALE3"),
      beforeEdit.positions.find((position) => position.ticker === "VALE3"),
    );
    assert.deepEqual(afterEdit.positions, [
      {
        ticker: "PETR4",
        quantity: 10,
        averagePrice: 200,
        investedValue: 2000,
        realizedProfit: 500,
      },
      {
        ticker: "VALE3",
        quantity: 10,
        averagePrice: 55,
        investedValue: 550,
        realizedProfit: 60,
      },
    ]);
    assert.equal(afterEdit.realizedProfit, 560);

    const updatedPetrSale = afterEdit.transactions.find(
      (transaction) => transaction.id === petrSale.id,
    );
    assert.equal(updatedPetrSale?.operationDate, "2026-08-02");
    assert.equal(updatedPetrSale?.realizedProfit, 500);
    assert.equal(updatedPetrSale?.quantityAfter, 0);
    assert.equal(updatedPetrSale?.averagePriceAfter, 0);
  });

  it("keeps another ticker unchanged when a historical sale quantity is edited", async () => {
    const userId = newUser();
    await createTransaction(userId, "buy", 10, 100, "2026-08-01", "PETR4");
    await createTransaction(userId, "buy", 8, 50, "2026-08-02", "VALE3");
    await createTransaction(userId, "buy", 10, 200, "2026-08-03", "PETR4");
    await createTransaction(userId, "sell", 3, 70, "2026-08-04", "VALE3");
    const petrSale = await createTransaction(userId, "sell", 10, 180, "2026-08-05", "PETR4");
    await createTransaction(userId, "buy", 5, 60, "2026-08-06", "VALE3");

    const beforeEdit = await storage.getPortfolioSnapshot(userId);
    assert.deepEqual(beforeEdit.positions, [
      {
        ticker: "PETR4",
        quantity: 10,
        averagePrice: 150,
        investedValue: 1500,
        realizedProfit: 300,
      },
      {
        ticker: "VALE3",
        quantity: 10,
        averagePrice: 55,
        investedValue: 550,
        realizedProfit: 60,
      },
    ]);
    assert.equal(beforeEdit.realizedProfit, 360);

    const updated = await storage.updateTransaction(userId, petrSale.id, { quantity: 6 });
    assert.equal(updated?.quantity, 6);

    const afterEdit = await storage.getPortfolioSnapshot(userId);
    assert.deepEqual(
      afterEdit.transactions.filter((transaction) => transaction.ticker === "VALE3"),
      beforeEdit.transactions.filter((transaction) => transaction.ticker === "VALE3"),
    );
    assert.deepEqual(
      afterEdit.positions.find((position) => position.ticker === "VALE3"),
      beforeEdit.positions.find((position) => position.ticker === "VALE3"),
    );
    assert.deepEqual(afterEdit.positions, [
      {
        ticker: "PETR4",
        quantity: 14,
        averagePrice: 150,
        investedValue: 2100,
        realizedProfit: 180,
      },
      {
        ticker: "VALE3",
        quantity: 10,
        averagePrice: 55,
        investedValue: 550,
        realizedProfit: 60,
      },
    ]);
    assert.equal(afterEdit.realizedProfit, 240);

    const updatedPetrSale = afterEdit.transactions.find(
      (transaction) => transaction.id === petrSale.id,
    );
    assert.equal(updatedPetrSale?.quantity, 6);
    assert.equal(updatedPetrSale?.realizedProfit, 180);
    assert.equal(updatedPetrSale?.quantityAfter, 14);
    assert.equal(updatedPetrSale?.averagePriceAfter, 150);
  });
});

describe("concurrent portfolio transactions", () => {
  it("does not allow two simultaneous sales to exceed the available position", async () => {
    const userId = newUser();
    await createTransaction(userId, "buy", 10, 100);

    const results = await Promise.allSettled([
      createTransaction(userId, "sell", 7, 120),
      createTransaction(userId, "sell", 7, 120),
    ]);
    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof createTransaction>>> =>
        result.status === "fulfilled",
    );
    const rejected = results.filter((result) => result.status === "rejected");

    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.ok(rejected[0]?.reason instanceof PortfolioValidationError);

    const snapshot = await storage.getPortfolioSnapshot(userId);
    assert.equal(snapshot.positions[0]?.quantity, 3);
    assert.equal(snapshot.positions[0]?.investedValue, 300);
    assert.equal(snapshot.realizedProfit, 140);
    assert.equal(snapshot.transactions.filter(
      (transaction) => transaction.transactionType === "sell",
    ).length, 1);
  });
});