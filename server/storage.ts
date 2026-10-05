import { type User, type InsertUser } from "@shared/schema";
import { randomUUID } from "crypto";
import { Pool } from "pg";
import type { AnalysisQuality } from "../shared/report-quality";

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

export type ReportDeliveryStatus =
  | "pending"
  | "processing"
  | "awaiting_provider"
  | "sent"
  | "delivered"
  | "failed";
export type ReportDeliveryRequest = {
  id: string;
  userId: string;
  reportId: string | null;
  professionalReviewId?: string | null;
  idempotencyKey: string;
  ticker: string;
  channel: ReportDeliveryChannel;
  contact: string;
  useRegisteredContact: boolean;
  status: ReportDeliveryStatus;
  providerMessageId: string | null;
  attemptCount: number;
  errorCode: string | null;
  errorMessage: string | null;
  requestedAt: string;
  updatedAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  confirmationOverdueAt: string | null;
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
    reportId: string;
    professionalReviewId?: string;
    idempotencyKey: string;
    ticker: string;
    channel: ReportDeliveryChannel;
    contact: string;
    useRegisteredContact: boolean;
  }): Promise<ReportDeliveryRequest>;
  getReportDeliveryRequest(userId: string, id: string): Promise<ReportDeliveryRequest | undefined>;
  claimReportDeliveryRequests(limit: number, id?: string): Promise<ClaimedReportDelivery[]>;
  flagUnconfirmedReportDeliveries(before: Date, limit: number): Promise<ReportDeliveryRequest[]>;
  updateReportDeliveryRequest(
    id: string,
    update: {
      status: ReportDeliveryStatus;
      providerMessageId?: string | null;
      errorCode?: string | null;
      errorMessage?: string | null;
    },
  ): Promise<void>;
  updateReportDeliveryStatusFromProvider(input: {
    channel: ReportDeliveryChannel;
    providerMessageId: string;
    status: Extract<ReportDeliveryStatus, "sent" | "delivered" | "failed">;
    errorCode?: string | null;
    errorMessage?: string | null;
  }): Promise<{ matched: boolean; status?: ReportDeliveryStatus }>;
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
         strengths, risks, risk_score::float8 AS "riskScore", outlook, source,
         analysis_quality AS "analysisQuality"
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
          summary, strengths, risks, risk_score, outlook, source, analysis_quality)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12, $13, $14::jsonb)
       RETURNING id, user_id AS "userId", ticker, company_name AS "companyName",
        generated_at AS "generatedAt", price::float8 AS price,
        change_percent::float8 AS "changePercent", signal, summary,
         strengths, risks, risk_score::float8 AS "riskScore", outlook, source,
         analysis_quality AS "analysisQuality"`,
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
        input.riskScore,
        input.outlook,
        input.source,
        JSON.stringify(input.analysisQuality ?? null),
      ],
    );
    return rows[0];
  }

  async createReportDeliveryRequest(input: {
    userId: string;
    reportId: string;
    professionalReviewId?: string;
    idempotencyKey: string;
    ticker: string;
    channel: ReportDeliveryChannel;
    contact: string;
    useRegisteredContact: boolean;
  }): Promise<ReportDeliveryRequest> {
    const { rows } = await pool.query(
      `INSERT INTO report_delivery_requests AS d
        (id, user_id, report_id, idempotency_key, ticker, channel, contact, use_registered_contact, professional_review_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (user_id, idempotency_key) DO NOTHING
       RETURNING ${REPORT_DELIVERY_COLUMNS}`,
      [
        randomUUID(),
        input.userId,
        input.reportId,
        input.idempotencyKey,
        input.ticker,
        input.channel,
        input.contact,
        input.useRegisteredContact,
        input.professionalReviewId ?? null,
      ],
    );
    if (rows[0]) return normalizeReportDeliveryRequest(rows[0]);
    const existing = await pool.query(
      `SELECT ${REPORT_DELIVERY_COLUMNS}
       FROM report_delivery_requests d
       WHERE d.user_id = $1 AND d.idempotency_key = $2`,
      [input.userId, input.idempotencyKey],
    );
    return normalizeReportDeliveryRequest(existing.rows[0]);
  }

  async getReportDeliveryRequest(userId: string, id: string): Promise<ReportDeliveryRequest | undefined> {
    const { rows } = await pool.query(
      `SELECT ${REPORT_DELIVERY_COLUMNS}
       FROM report_delivery_requests d
       WHERE d.id = $1 AND d.user_id = $2`,
      [id, userId],
    );
    return rows[0] ? normalizeReportDeliveryRequest(rows[0]) : undefined;
  }

  async flagUnconfirmedReportDeliveries(before: Date, limit: number): Promise<ReportDeliveryRequest[]> {
    if (!Number.isFinite(before.getTime()) || !Number.isInteger(limit) || limit < 1 || limit > 1000) {
      throw new Error("Invalid unconfirmed delivery scan parameters");
    }
    // Lock and persist the alert together: overlapping workers cannot alert the same request twice.
    const { rows } = await pool.query(
      `WITH overdue AS (
         SELECT id FROM report_delivery_requests
         WHERE status = 'sent' AND sent_at <= $1
           AND confirmation_overdue_at IS NULL
         ORDER BY sent_at, id
         LIMIT $2
         FOR UPDATE SKIP LOCKED
       )
       UPDATE report_delivery_requests d
       SET confirmation_overdue_at = NOW(), updated_at = NOW()
       FROM overdue
       WHERE d.id = overdue.id AND d.status = 'sent'
         AND d.confirmation_overdue_at IS NULL
       RETURNING ${REPORT_DELIVERY_COLUMNS}`,
      [before, limit],
    );
    return rows.map(normalizeReportDeliveryRequest);
  }

  async claimReportDeliveryRequests(limit: number, id?: string): Promise<ClaimedReportDelivery[]> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE report_delivery_requests
         SET status = 'failed', error_code = 'PROCESSING_TIMEOUT',
             error_message = 'O processamento foi interrompido antes da confirmação do provedor.',
             updated_at = NOW()
         WHERE status = 'processing'
           AND processing_started_at < NOW() - INTERVAL '10 minutes'`,
      );
      const params: unknown[] = [limit];
      const idFilter = id ? "AND d.id = $2" : "";
      if (id) params.push(id);
      const { rows } = await client.query(
        `SELECT d.id
         FROM report_delivery_requests d
         WHERE d.status IN ('pending', 'awaiting_provider')
           AND (d.status = 'pending' OR d.updated_at < NOW() - INTERVAL '1 minute')
           ${idFilter}
         ORDER BY d.requested_at
         LIMIT $1
         FOR UPDATE SKIP LOCKED`,
        params,
      );
      if (!rows.length) {
        await client.query("COMMIT");
        return [];
      }

      const claimed = await client.query(
        `UPDATE report_delivery_requests d
         SET status = 'processing', attempt_count = attempt_count + 1,
             error_code = NULL, error_message = NULL, updated_at = NOW(),
             processing_started_at = NOW()
         FROM investment_reports r
         WHERE d.id = ANY($1::varchar[]) AND r.id = d.report_id AND r.user_id = d.user_id
         RETURNING ${REPORT_DELIVERY_COLUMNS},
           r.id AS "reportReportId", r.user_id AS "reportUserId",
           r.ticker AS "reportTicker", r.company_name AS "reportCompanyName",
           r.generated_at AS "reportGeneratedAt", r.price::float8 AS "reportPrice",
           r.change_percent::float8 AS "reportChangePercent", r.signal AS "reportSignal",
           r.summary AS "reportSummary", r.strengths AS "reportStrengths",
           r.risks AS "reportRisks", r.risk_score::float8 AS "reportRiskScore",
           r.outlook AS "reportOutlook", r.source AS "reportSource"`,
        [rows.map((row) => row.id)],
      );
      await client.query("COMMIT");
      return claimed.rows.map((row) => ({
        ...normalizeReportDeliveryRequest(row),
        report: {
          id: row.reportReportId,
          userId: row.reportUserId,
          ticker: row.reportTicker,
          companyName: row.reportCompanyName,
          generatedAt: new Date(row.reportGeneratedAt).toISOString(),
          price: row.reportPrice,
          changePercent: row.reportChangePercent,
          signal: row.reportSignal,
          summary: row.reportSummary,
          strengths: row.reportStrengths,
          risks: row.reportRisks,
          riskScore: row.reportRiskScore,
          outlook: row.reportOutlook,
          source: row.reportSource,
        },
      }));
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async updateReportDeliveryRequest(
    id: string,
    update: {
      status: ReportDeliveryStatus;
      providerMessageId?: string | null;
      errorCode?: string | null;
      errorMessage?: string | null;
    },
  ): Promise<void> {
    await pool.query(
      `UPDATE report_delivery_requests
       SET status = $2::varchar, provider_message_id = COALESCE($3, provider_message_id),
           error_code = $4::varchar, error_message = $5, updated_at = NOW(),
           sent_at = CASE WHEN $2::varchar IN ('sent', 'delivered') THEN COALESCE(sent_at, NOW()) ELSE sent_at END,
           delivered_at = CASE WHEN $2::varchar = 'delivered' THEN COALESCE(delivered_at, NOW()) ELSE delivered_at END
       WHERE id = $1 AND status NOT IN ('delivered', 'failed')`,
      [
        id,
        update.status,
        update.providerMessageId ?? null,
        update.errorCode ?? null,
        update.errorMessage ?? null,
      ],
    );
  }

  async updateReportDeliveryStatusFromProvider(input: {
    channel: ReportDeliveryChannel;
    providerMessageId: string;
    status: Extract<ReportDeliveryStatus, "sent" | "delivered" | "failed">;
    errorCode?: string | null;
    errorMessage?: string | null;
  }): Promise<{ matched: boolean; status?: ReportDeliveryStatus }> {
    const { rows } = await pool.query(
      `UPDATE report_delivery_requests
       SET status = CASE
           WHEN $3::varchar = 'delivered' AND status NOT IN ('delivered', 'failed') THEN 'delivered'
           WHEN $3::varchar = 'failed' AND status <> 'delivered' THEN 'failed'
           WHEN $3::varchar = 'sent' AND status NOT IN ('delivered', 'failed') THEN 'sent'
           ELSE status
         END,
         error_code = CASE
           WHEN status IN ('delivered', 'failed') THEN error_code
           WHEN $3::varchar = 'failed' AND status <> 'delivered' THEN $4::varchar
           WHEN $3::varchar <> 'failed' THEN NULL
           ELSE error_code
         END,
         error_message = CASE
           WHEN status IN ('delivered', 'failed') THEN error_message
           WHEN $3::varchar = 'failed' AND status <> 'delivered' THEN $5
           WHEN $3::varchar <> 'failed' THEN NULL
           ELSE error_message
         END,
         updated_at = CASE WHEN status IN ('delivered', 'failed') THEN updated_at ELSE NOW() END,
         sent_at = CASE
           WHEN status IN ('delivered', 'failed') THEN sent_at
           WHEN $3::varchar IN ('sent', 'delivered') THEN COALESCE(sent_at, NOW())
           ELSE sent_at
         END,
         delivered_at = CASE
           WHEN $3::varchar = 'delivered' AND status NOT IN ('delivered', 'failed')
             THEN COALESCE(delivered_at, NOW())
           ELSE delivered_at
         END
       WHERE channel = $1
         AND provider_message_id = $2
       RETURNING status`,
      [
        input.channel,
        input.providerMessageId,
        input.status,
        input.errorCode ?? null,
        input.errorMessage ?? null,
      ],
    );
    if (!rows[0]) return { matched: false };
    return { matched: true, status: rows[0].status as ReportDeliveryStatus };
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
  request: Omit<ReportDeliveryRequest, "requestedAt" | "updatedAt" | "sentAt" | "deliveredAt" | "confirmationOverdueAt"> & {
    requestedAt: unknown;
    updatedAt: unknown;
    sentAt: unknown;
    deliveredAt: unknown;
    confirmationOverdueAt: unknown;
  },
): ReportDeliveryRequest {
  return {
    ...request,
    attemptCount: Number(request.attemptCount),
    requestedAt: new Date(request.requestedAt as string | number | Date).toISOString(),
    updatedAt: new Date(request.updatedAt as string | number | Date).toISOString(),
    sentAt: request.sentAt ? new Date(request.sentAt as string | number | Date).toISOString() : null,
    deliveredAt: request.deliveredAt
      ? new Date(request.deliveredAt as string | number | Date).toISOString()
      : null,
    confirmationOverdueAt: request.confirmationOverdueAt
      ? new Date(request.confirmationOverdueAt as string | number | Date).toISOString()
      : null,
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
  riskScore: number | null;
  outlook: string;
  source: string;
  analysisQuality?: AnalysisQuality | null;
};

export type ClaimedReportDelivery = ReportDeliveryRequest & {
  report: InvestmentReport;
};
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function closeStorage(): Promise<void> {
  await pool.end();
}

const REPORT_DELIVERY_COLUMNS = `d.id, d.user_id AS "userId", d.report_id AS "reportId",
  d.professional_review_id AS "professionalReviewId",
  d.idempotency_key AS "idempotencyKey", d.ticker, d.channel, d.contact,
  d.use_registered_contact AS "useRegisteredContact",
  d.status, d.provider_message_id AS "providerMessageId",
  d.attempt_count::int AS "attemptCount", d.error_code AS "errorCode",
  d.error_message AS "errorMessage", d.requested_at AS "requestedAt",
  d.updated_at AS "updatedAt", d.processing_started_at AS "processingStartedAt",
  d.sent_at AS "sentAt", d.delivered_at AS "deliveredAt",
  d.confirmation_overdue_at AS "confirmationOverdueAt"`;
