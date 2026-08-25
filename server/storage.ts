import { type User, type InsertUser } from "@shared/schema";
import { randomUUID } from "crypto";
import { Pool } from "pg";

export type PortfolioHolding = {
  id: string;
  userId: string;
  ticker: string;
  quantity: number;
  averagePrice: number;
  purchaseDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PortfolioTransactionType = "buy" | "sell";

export type ReportDeliveryChannel = "email" | "whatsapp";

export type ReportDeliveryRequest = {
  id: string;
  userId: string;
  ticker: string;
  channel: ReportDeliveryChannel;
  contact: string;
  useRegisteredContact: boolean;
  status: string;
  requestedAt: string;
};

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

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;

  getUserByUsername(username: string): Promise<User | undefined>;

  createUser(user: InsertUser): Promise<User>;

  listHoldings(userId: string): Promise<PortfolioHolding[]>;

  upsertHolding(input: {
    userId: string;
    ticker: string;
    quantity: number;
    averagePrice: number;
    purchaseDate?: string;
  }): Promise<PortfolioHolding>;

  deleteHolding(userId: string, id: string): Promise<boolean>;

  listTransactions(userId: string): Promise<PortfolioTransaction[]>;

  createTransaction(input: {
    userId: string;
    ticker: string;
    transactionType: PortfolioTransactionType;
    quantity: number;
    price: number;
    operationDate: string;
  }): Promise<PortfolioTransaction>;

  updateTransaction(userId: string, id: string, input: Partial<{
    ticker: string;
    transactionType: PortfolioTransactionType;
    quantity: number;
    price: number;
    operationDate: string;
  }>): Promise<PortfolioTransaction | undefined>;

  deleteTransaction(userId: string, id: string): Promise<boolean>;

  getPortfolioSnapshot(userId: string): Promise<PortfolioSnapshot>;

  listReports(userId: string, ticker?: string): Promise<InvestmentReport[]>;

  createReport(input: Omit<InvestmentReport, "id" | "generatedAt">): Promise<InvestmentReport>;

  createReportDeliveryRequest(input: {
    userId: string;
    ticker: string;
    channel: ReportDeliveryChannel;
    contact: string;
    useRegisteredContact: boolean;
  }): Promise<ReportDeliveryRequest>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;

  constructor() {
    this.users = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async listHoldings(userId: string): Promise<PortfolioHolding[]> {
    const { rows } = await pool.query(
      `SELECT id, user_id AS "userId", ticker, quantity::float8 AS quantity,
        average_price::float8 AS "averagePrice", purchase_date AS "purchaseDate",
        created_at AS "createdAt", updated_at AS "updatedAt"
       FROM portfolio_holdings WHERE user_id = $1 ORDER BY ticker`,
      [userId],
    );
    return rows;
  }

  async upsertHolding(input: {
    userId: string;
    ticker: string;
    quantity: number;
    averagePrice: number;
    purchaseDate?: string;
  }): Promise<PortfolioHolding> {
    const { rows } = await pool.query(
      `INSERT INTO portfolio_holdings
        (id, user_id, ticker, quantity, average_price, purchase_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, ticker) DO UPDATE SET
        quantity = EXCLUDED.quantity,
        average_price = EXCLUDED.average_price,
        purchase_date = EXCLUDED.purchase_date,
        updated_at = NOW()
       RETURNING id, user_id AS "userId", ticker, quantity::float8 AS quantity,
        average_price::float8 AS "averagePrice", purchase_date AS "purchaseDate",
        created_at AS "createdAt", updated_at AS "updatedAt"`,
      [
        randomUUID(),
        input.userId,
        input.ticker,
        input.quantity,
        input.averagePrice,
        input.purchaseDate || null,
      ],
    );
    return rows[0];
  }

  async deleteHolding(userId: string, id: string): Promise<boolean> {
    const result = await pool.query(
      "DELETE FROM portfolio_holdings WHERE id = $1 AND user_id = $2",
      [id, userId],
    );
    return result.rowCount === 1;
  }

  async listTransactions(userId: string): Promise<PortfolioTransaction[]> {
    const { rows } = await pool.query(
      `SELECT id, user_id AS "userId", ticker, transaction_type AS "transactionType",
        quantity::float8 AS quantity, price::float8 AS price,
        operation_date AS "operationDate", created_at AS "createdAt", updated_at AS "updatedAt"
       FROM portfolio_transactions
       WHERE user_id = $1
       ORDER BY operation_date DESC, created_at DESC, id DESC`,
      [userId],
    );
    return rows.map(normalizePortfolioTransaction);
  }

  async createTransaction(input: {
    userId: string;
    ticker: string;
    transactionType: PortfolioTransactionType;
    quantity: number;
    price: number;
    operationDate: string;
  }): Promise<PortfolioTransaction> {
    return this.withLockedTransactions(input.userId, async (client, current) => {
      const candidate: PortfolioTransaction = {
        id: randomUUID(),
        userId: input.userId,
        ticker: input.ticker,
        transactionType: input.transactionType,
        quantity: input.quantity,
        price: input.price,
        operationDate: input.operationDate,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      calculatePortfolioSnapshot([...current, candidate]);
      const { rows } = await client.query(
        `INSERT INTO portfolio_transactions
          (id, user_id, ticker, transaction_type, quantity, price, operation_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, user_id AS "userId", ticker, transaction_type AS "transactionType",
          quantity::float8 AS quantity, price::float8 AS price,
          operation_date AS "operationDate", created_at AS "createdAt", updated_at AS "updatedAt"`,
        [candidate.id, candidate.userId, candidate.ticker, candidate.transactionType,
          candidate.quantity, candidate.price, candidate.operationDate],
      );
      return normalizePortfolioTransaction(rows[0]);
    });
  }

  async updateTransaction(userId: string, id: string, input: Partial<{
    ticker: string;
    transactionType: PortfolioTransactionType;
    quantity: number;
    price: number;
    operationDate: string;
  }>): Promise<PortfolioTransaction | undefined> {
    return this.withLockedTransactions(userId, async (client, current) => {
      const existing = current.find((transaction) => transaction.id === id);
      if (!existing) return undefined;
      const candidate = { ...existing, ...input, updatedAt: new Date().toISOString() };
      calculatePortfolioSnapshot(current.map((transaction) => transaction.id === id ? candidate : transaction));
      const { rows } = await client.query(
        `UPDATE portfolio_transactions
         SET ticker = $3, transaction_type = $4, quantity = $5, price = $6,
             operation_date = $7, updated_at = NOW()
         WHERE id = $1 AND user_id = $2
         RETURNING id, user_id AS "userId", ticker, transaction_type AS "transactionType",
          quantity::float8 AS quantity, price::float8 AS price,
          operation_date AS "operationDate", created_at AS "createdAt", updated_at AS "updatedAt"`,
        [id, userId, candidate.ticker, candidate.transactionType, candidate.quantity,
          candidate.price, candidate.operationDate],
      );
      return rows[0] ? normalizePortfolioTransaction(rows[0]) : undefined;
    });
  }

  async deleteTransaction(userId: string, id: string): Promise<boolean> {
    return this.withLockedTransactions(userId, async (client, current) => {
      if (!current.some((transaction) => transaction.id === id)) return false;
      calculatePortfolioSnapshot(current.filter((transaction) => transaction.id !== id));
      const result = await client.query(
        "DELETE FROM portfolio_transactions WHERE id = $1 AND user_id = $2",
        [id, userId],
      );
      return result.rowCount === 1;
    });
  }

  async getPortfolioSnapshot(userId: string): Promise<PortfolioSnapshot> {
    return calculatePortfolioSnapshot(await this.listTransactionsAscending(userId));
  }

  private async listTransactionsAscending(userId: string): Promise<PortfolioTransaction[]> {
    const { rows } = await pool.query(
      `SELECT id, user_id AS "userId", ticker, transaction_type AS "transactionType",
        quantity::float8 AS quantity, price::float8 AS price,
        operation_date AS "operationDate", created_at AS "createdAt", updated_at AS "updatedAt"
       FROM portfolio_transactions
       WHERE user_id = $1
       ORDER BY operation_date ASC, created_at ASC, id ASC`,
      [userId],
    );
    return rows.map(normalizePortfolioTransaction);
  }

  private async withLockedTransactions<T>(
    userId: string,
    callback: (client: import("pg").PoolClient, current: PortfolioTransaction[]) => Promise<T>,
  ): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [userId]);
      const { rows } = await client.query(
        `SELECT id, user_id AS "userId", ticker, transaction_type AS "transactionType",
          quantity::float8 AS quantity, price::float8 AS price,
          operation_date AS "operationDate", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM portfolio_transactions
         WHERE user_id = $1
         ORDER BY operation_date ASC, created_at ASC, id ASC
         FOR UPDATE`,
        [userId],
      );
      const result = await callback(client, rows.map(normalizePortfolioTransaction));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listReports(userId: string, ticker?: string): Promise<InvestmentReport[]> {
    const values = ticker ? [userId, ticker] : [userId];
    const { rows } = await pool.query(
      `SELECT id, user_id AS "userId", ticker, company_name AS "companyName",
        generated_at AS "generatedAt", price::float8 AS price,
        change_percent::float8 AS "changePercent", signal, summary,
        strengths, risks, outlook, source
       FROM investment_reports
       WHERE user_id = $1 ${ticker ? "AND ticker = $2" : ""}
       ORDER BY generated_at DESC`,
      values,
    );
    return rows;
  }

  async createReport(input: Omit<InvestmentReport, "id" | "generatedAt">): Promise<InvestmentReport> {
    const { rows } = await pool.query(
      `INSERT INTO investment_reports
        (id, user_id, ticker, company_name, price, change_percent, signal,
         summary, strengths, risks, outlook, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12)
       RETURNING id, user_id AS "userId", ticker, company_name AS "companyName",
        generated_at AS "generatedAt", price::float8 AS price,
        change_percent::float8 AS "changePercent", signal, summary,
        strengths, risks, outlook, source`,
      [
        randomUUID(),
        input.userId,
        input.ticker,
        input.companyName,
        input.price,
        input.changePercent,
        input.signal,
        input.summary,
        JSON.stringify(input.strengths),
        JSON.stringify(input.risks),
        input.outlook,
        input.source,
      ],
    );
    return rows[0];
  }

  async createReportDeliveryRequest(input: {
    userId: string;
    ticker: string;
    channel: ReportDeliveryChannel;
    contact: string;
    useRegisteredContact: boolean;
  }): Promise<ReportDeliveryRequest> {
    const { rows } = await pool.query(
      `INSERT INTO report_delivery_requests
        (id, user_id, ticker, channel, contact, use_registered_contact)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, user_id AS "userId", ticker, channel, contact,
        use_registered_contact AS "useRegisteredContact", status,
        requested_at AS "requestedAt"`,
      [
        randomUUID(),
        input.userId,
        input.ticker,
        input.channel,
        input.contact,
        input.useRegisteredContact,
      ],
    );
    return normalizeReportDeliveryRequest(rows[0]);
  }
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

function normalizePortfolioTransaction(transaction: PortfolioTransaction): PortfolioTransaction {
  return {
    ...transaction,
    operationDate: formatDatabaseDate(transaction.operationDate),
    createdAt: formatDatabaseTimestamp(transaction.createdAt),
    updatedAt: formatDatabaseTimestamp(transaction.updatedAt),
  };
}

function formatDatabaseDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function formatDatabaseTimestamp(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function roundMoney(value: number): number {
  const factor = 10 ** MONEY_DECIMALS;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function normalizeReportDeliveryRequest(
  request: Omit<ReportDeliveryRequest, "requestedAt"> & { requestedAt: unknown },
): ReportDeliveryRequest {
  const requestedAt = request.requestedAt;
  return {
    id: request.id,
    userId: request.userId,
    ticker: request.ticker,
    channel: request.channel,
    contact: request.contact,
    useRegisteredContact: request.useRegisteredContact,
    status: request.status,
    requestedAt: requestedAt instanceof Date
      ? requestedAt.toISOString()
      : String(requestedAt),
  };
}

export const storage = new MemStorage();

export type InvestmentReport = {
  id: string;
  userId: string;
  ticker: string;
  companyName: string;
  generatedAt: string;
  price: number;
  changePercent: number;
  signal: string;
  summary: string;
  strengths: string[];
  risks: string[];
  outlook: string;
  source: string;
};

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function closeStorage(): Promise<void> {
  await pool.end();
}
