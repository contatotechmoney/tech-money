export type PortfolioTransactionType = "buy" | "sell";
export type PortfolioTransaction = {
  id: string;
  userId: string;
  ticker: string;
  transactionType: PortfolioTransactionType;
  quantity: number;
  price: number;
  operationDate: string;
  createdAt: string;
  updatedAt: string;
};

export type CalculatedPortfolioTransaction = PortfolioTransaction & {
  realizedProfit: number | null;
  quantityAfter: number;
  averagePriceAfter: number;
};

export type PortfolioPosition = {
  ticker: string;
  quantity: number;
  averagePrice: number;
  investedValue: number;
  realizedProfit: number;
};

export type PortfolioSnapshot = {
  transactions: CalculatedPortfolioTransaction[];
  positions: PortfolioPosition[];
  realizedProfit: number;
};

export class PortfolioValidationError extends Error {
  code = "PORTFOLIO_VALIDATION";
}

type PositionState = { quantity: number; cost: number; realizedProfit: number };
const QUANTITY_EPSILON = 0.0000001;
const MONEY_DECIMALS = 4;

export function calculatePortfolioSnapshot(transactions: PortfolioTransaction[]): PortfolioSnapshot {
  const ordered = [...transactions].sort(compareTransactions);
  const state = new Map<string, PositionState>();
  const calculated: CalculatedPortfolioTransaction[] = [];

  for (const transaction of ordered) {
    const current = state.get(transaction.ticker) || { quantity: 0, cost: 0, realizedProfit: 0 };
    let realizedProfit: number | null = null;

    if (transaction.transactionType === "buy") {
      current.cost = roundMoney(current.cost + transaction.quantity * transaction.price);
      current.quantity += transaction.quantity;
    } else {
      if (transaction.quantity > current.quantity + QUANTITY_EPSILON) {
        throw new PortfolioValidationError(
          `A venda de ${transaction.ticker} excede a posição disponível na data informada.`,
        );
      }
      const averagePrice = current.quantity > QUANTITY_EPSILON ? current.cost / current.quantity : 0;
      realizedProfit = roundMoney((transaction.price - averagePrice) * transaction.quantity);
      current.cost = roundMoney(current.cost - averagePrice * transaction.quantity);
      current.quantity -= transaction.quantity;
      current.realizedProfit = roundMoney(current.realizedProfit + realizedProfit);
      if (current.quantity <= QUANTITY_EPSILON) {
        current.quantity = 0;
        current.cost = 0;
      }
    }

    state.set(transaction.ticker, current);
    calculated.push({
      ...transaction,
      realizedProfit,
      quantityAfter: current.quantity,
      averagePriceAfter: current.quantity > QUANTITY_EPSILON ? current.cost / current.quantity : 0,
    });
  }

  const positions = Array.from(state.entries())
    .filter(([, position]) => position.quantity > QUANTITY_EPSILON)
    .map(([ticker, position]) => ({
      ticker,
      quantity: position.quantity,
      averagePrice: position.cost / position.quantity,
      investedValue: position.cost,
      realizedProfit: position.realizedProfit,
    }))
    .sort((a, b) => a.ticker.localeCompare(b.ticker));

  return {
    transactions: calculated.reverse(),
    positions,
    realizedProfit: roundMoney(Array.from(state.values()).reduce((sum, position) => sum + position.realizedProfit, 0)),
  };
}

function compareTransactions(a: PortfolioTransaction, b: PortfolioTransaction): number {
  return a.operationDate.localeCompare(b.operationDate)
    || a.createdAt.localeCompare(b.createdAt)
    || a.id.localeCompare(b.id);
}

function roundMoney(value: number): number {
  const factor = 10 ** MONEY_DECIMALS;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

