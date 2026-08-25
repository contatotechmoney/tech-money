import type { Express } from "express";
import type { NextFunction, Request, Response } from "express";
import { getAuth } from "@clerk/express";
import { createServer, type Server } from "http";
import { z } from "zod";
import {
  PortfolioValidationError,
  storage,
  type InvestmentReport,
} from "./storage";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const { userId } = getAuth(req);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  req.userId = userId;
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.get("/api/auth/session", requireAuth, (req, res) => {
    res.json({ authenticated: true, userId: req.userId });
  });

  app.get("/api/investments/quotes", requireAuth, async (req, res) => {
    const requested = typeof req.query.tickers === "string"
      ? req.query.tickers.split(",")
      : [];
    const tickers = Array.from(new Set(requested.map(normalizeTicker).filter(Boolean)));

    if (tickers.length === 0 || tickers.length > 20) {
      return res.status(400).json({ error: "Informe entre 1 e 20 tickers válidos." });
    }

    try {
      const quotes = await Promise.all(tickers.map((ticker) => fetchQuote(ticker)));
      res.json({ quotes, source: "Yahoo Finance", updatedAt: new Date().toISOString() });
    } catch (error) {
      sendMarketDataError(res, "consultar cotações", error);
    }
  });

  app.get("/api/investments/portfolio", requireAuth, async (req, res) => {
    try {
      const snapshot = await storage.getPortfolioSnapshot(req.userId!);
      const quotes = await getQuotesForTickers(snapshot.positions.map((position) => position.ticker));
      const items = snapshot.positions.map((position) => {
        const quote = quotes.get(position.ticker);
        const currentValue = quote ? position.quantity * quote.price : null;
        const unrealizedReturnValue = currentValue === null ? null : currentValue - position.investedValue;
        const returnValue = unrealizedReturnValue === null
          ? null
          : unrealizedReturnValue + position.realizedProfit;
        return {
          id: position.ticker,
          ticker: position.ticker,
          quantity: position.quantity,
          averagePrice: position.averagePrice,
          investedValue: position.investedValue,
          currentValue,
          realizedProfit: position.realizedProfit,
          returnValue,
          unrealizedReturnValue,
          returnPercent: returnValue === null || position.investedValue === 0
            ? null
            : (returnValue / position.investedValue) * 100,
          quote,
        };
      });
      const totalInvested = items.reduce((total, item) => total + item.investedValue, 0);
      const hasUnavailableQuote = items.some((item) => item.currentValue === null);
      const totalCurrent = hasUnavailableQuote
        ? null
        : items.reduce((total, item) => total + (item.currentValue ?? 0), 0);
      const unrealizedReturnValue = totalCurrent === null ? null : totalCurrent - totalInvested;
      const returnValue = unrealizedReturnValue === null
        ? null
        : unrealizedReturnValue + snapshot.realizedProfit;
      res.json({
        items,
        summary: {
          totalInvested,
          totalCurrent,
          realizedProfit: snapshot.realizedProfit,
          unrealizedReturnValue,
          returnValue,
          returnPercent: returnValue !== null && totalInvested ? (returnValue / totalInvested) * 100 : null,
        },
        transactions: snapshot.transactions,
        source: "Yahoo Finance",
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      sendInternalError(res, "carregar carteira", error);
    }
  });

  app.post("/api/investments/portfolio/transactions", requireAuth, async (req, res) => {
    const input = transactionInputSchema.safeParse(req.body);
    if (!input.success) {
      return res.status(400).json({ error: "Informe tipo, ticker, quantidade, preço e data válidos." });
    }

    try {
      const transaction = await storage.createTransaction({
        userId: req.userId!,
        ...input.data,
        ticker: normalizeTicker(input.data.ticker),
      });
      res.status(201).json(transaction);
    } catch (error) {
      sendPortfolioError(res, error);
    }
  });

  app.patch("/api/investments/portfolio/transactions/:id", requireAuth, async (req, res) => {
    const input = transactionInputSchema.partial().safeParse(req.body);
    if (!input.success || Object.keys(input.data).length === 0) {
      return res.status(400).json({ error: "Informe ao menos um campo válido para atualizar a movimentação." });
    }

    try {
      const transaction = await storage.updateTransaction(req.userId!, req.params.id, {
        ...input.data,
        ...(input.data.ticker ? { ticker: normalizeTicker(input.data.ticker) } : {}),
      });
      if (!transaction) return res.status(404).json({ error: "Movimentação não encontrada." });
      res.json(transaction);
    } catch (error) {
      sendPortfolioError(res, error);
    }
  });

  app.delete("/api/investments/portfolio/transactions/:id", requireAuth, async (req, res) => {
    try {
      const deleted = await storage.deleteTransaction(req.userId!, req.params.id);
      if (!deleted) return res.status(404).json({ error: "Movimentação não encontrada." });
      res.status(204).end();
    } catch (error) {
      sendPortfolioError(res, error);
    }
  });

  app.post("/api/investments/portfolio", requireAuth, async (req, res) => {
    const input = z.object({
      ticker: z.string().trim().regex(/^[A-Za-z]{4}[0-9]{1,2}$/),
      quantity: z.coerce.number().positive().finite(),
      averagePrice: z.coerce.number().positive().finite(),
      purchaseDate: z.string().date().optional(),
    }).safeParse(req.body);

    if (!input.success) {
      return res.status(400).json({
        error: "Informe um ticker brasileiro e valores positivos para quantidade e preço médio.",
      });
    }

    try {
      const transaction = await storage.createTransaction({
        userId: req.userId!,
        ticker: normalizeTicker(input.data.ticker),
        transactionType: "buy",
        quantity: input.data.quantity,
        price: input.data.averagePrice,
        operationDate: input.data.purchaseDate || new Date().toISOString().slice(0, 10),
      });
      res.status(201).json(transaction);
    } catch (error) {
      sendPortfolioError(res, error);
    }
  });

  app.delete("/api/investments/portfolio/:id", requireAuth, async (req, res) => {
    res.status(410).json({
      error: "ENDPOINT_RETIRED",
      message: "Exclua as movimentações do ativo para atualizar sua posição.",
    });
  });

  app.get("/api/investments/reports", requireAuth, async (req, res) => {
    try {
      const reports = await getLatestReports(req.userId!);
      res.json({ reports, source: "Yahoo Finance" });
    } catch (error) {
      sendMarketDataError(res, "atualizar relatórios", error);
    }
  });

  app.get("/api/investments/reports/:ticker", requireAuth, async (req, res) => {
    const ticker = normalizeTicker(req.params.ticker);
    if (!isSupportedReportTicker(ticker)) {
      return res.status(404).json({ error: "Relatório não disponível para esse ativo." });
    }

    try {
      const reports = await ensureReports(req.userId!, ticker);
      res.json({
        ticker,
        latest: reports[0],
        history: reports,
        source: "Yahoo Finance",
      });
    } catch (error) {
      sendMarketDataError(res, "atualizar relatório", error);
    }
  });

  app.post("/api/investments/reports/:ticker/refresh", requireAuth, async (req, res) => {
    const ticker = normalizeTicker(req.params.ticker);
    if (!isSupportedReportTicker(ticker)) {
      return res.status(404).json({ error: "Relatório não disponível para esse ativo." });
    }

    try {
      const report = await generateReport(req.userId!, ticker);
      res.status(201).json(report);
    } catch (error) {
      sendMarketDataError(res, "gerar relatório", error);
    }
  });

  app.post("/api/investments/reports/:ticker/delivery", requireAuth, async (req, res) => {
    const ticker = normalizeTicker(req.params.ticker);
    if (!isSupportedReportTicker(ticker)) {
      return res.status(404).json({ error: "Relatório não disponível para esse ativo." });
    }

    const input = reportDeliveryInputSchema.safeParse(req.body);
    if (!input.success) {
      return res.status(400).json({ error: "Informe um e-mail ou WhatsApp válido para receber a análise." });
    }

    const { channel, contact, useRegisteredContact } = input.data;
    if (channel === "email" && !z.string().email().safeParse(contact).success) {
      return res.status(400).json({ error: "Informe um e-mail válido." });
    }
    if (channel === "whatsapp" && !useRegisteredContact && !isPhoneNumber(contact)) {
      return res.status(400).json({ error: "Informe um número de WhatsApp válido." });
    }
    if (channel === "whatsapp" && useRegisteredContact && contact !== "registered") {
      return res.status(400).json({ error: "Confirme o uso do WhatsApp cadastrado." });
    }

    try {
      const request = await storage.createReportDeliveryRequest({
        userId: req.userId!,
        ticker,
        channel,
        contact,
        useRegisteredContact,
      });
      res.status(201).json({
        request: {
          id: request.id,
          ticker: request.ticker,
          channel: request.channel,
          status: request.status,
          requestedAt: request.requestedAt,
        },
      });
    } catch (error) {
      sendInternalError(res, "registrar entrega da análise", error);
    }
  });

  return httpServer;
}

type MarketQuote = {
  ticker: string;
  companyName: string;
  price: number;
  changePercent: number;
  previousClose: number | null;
  high52Week: number | null;
  low52Week: number | null;
  volume: number | null;
  updatedAt: string;
  history: Array<{ date: string; close: number }>;
};

const REPORT_TICKERS = new Set(["BBDC3", "BBAS3"]);
const transactionInputSchema = z.object({
  ticker: z.string().trim().regex(/^[A-Za-z]{4}[0-9]{1,2}$/),
  transactionType: z.enum(["buy", "sell"]),
  quantity: z.coerce.number().positive().finite(),
  price: z.coerce.number().positive().finite(),
  operationDate: z.string().date(),
});
const reportDeliveryInputSchema = z.object({
  channel: z.enum(["email", "whatsapp"]),
  contact: z.string().trim().min(1).max(320),
  useRegisteredContact: z.boolean().default(false),
});

function normalizeTicker(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function isSupportedReportTicker(ticker: string): boolean {
  return REPORT_TICKERS.has(ticker);
}

function isPhoneNumber(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

async function fetchQuote(ticker: string): Promise<MarketQuote> {
  const symbol = `${ticker}.SA`;
  let response: globalThis.Response;
  try {
    response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=6mo&interval=1d&events=div%2Csplits`,
      {
        headers: { "User-Agent": "TechMoney/1.0 market-data" },
        signal: AbortSignal.timeout(8_000),
      },
    );
  } catch (error) {
    console.error(`[investments] market data request failed for ${ticker}`, error);
    throw new Error("MARKET_DATA_UNAVAILABLE");
  }
  if (!response.ok) {
    console.error(`[investments] market data returned ${response.status} for ${ticker}`);
    throw new Error("MARKET_DATA_UNAVAILABLE");
  }

  let payload: {
    chart?: {
      result?: Array<{
        meta?: Record<string, unknown>;
        timestamp?: number[];
        indicators?: { quote?: Array<{ close?: Array<number | null> }> };
      }>;
      error?: { description?: string };
    };
  };
  try {
    payload = await response.json() as typeof payload;
  } catch (error) {
    console.error(`[investments] invalid market data response for ${ticker}`, error);
    throw new Error("MARKET_DATA_UNAVAILABLE");
  }
  const result = payload.chart?.result?.[0];
  const meta = result?.meta;
  const price = numberValue(meta?.regularMarketPrice);
  if (!result || !meta || price === null) {
    console.error(`[investments] quote not found for ${ticker}`, payload.chart?.error);
    throw new Error("MARKET_DATA_UNAVAILABLE");
  }

  const previousClose = numberValue(meta.chartPreviousClose ?? meta.previousClose);
  const changePercent = previousClose && previousClose !== 0
    ? ((price - previousClose) / previousClose) * 100
    : 0;
  const closes = result.indicators?.quote?.[0]?.close || [];
  const history = (result.timestamp || [])
    .map((timestamp, index) => {
      const close = numberValue(closes[index]);
      return close === null
        ? null
        : { date: new Date(timestamp * 1000).toISOString().slice(0, 10), close };
    })
    .filter((item): item is { date: string; close: number } => item !== null);

  return {
    ticker,
    companyName: String(meta.longName || meta.shortName || ticker),
    price,
    changePercent,
    previousClose,
    high52Week: numberValue(meta.fiftyTwoWeekHigh),
    low52Week: numberValue(meta.fiftyTwoWeekLow),
    volume: numberValue(meta.regularMarketVolume),
    updatedAt: new Date((numberValue(meta.regularMarketTime) || Date.now() / 1000) * 1000).toISOString(),
    history,
  };
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function getQuotesForTickers(tickers: string[]): Promise<Map<string, MarketQuote>> {
  const uniqueTickers = Array.from(new Set(tickers));
  const entries = await Promise.all(uniqueTickers.map(async (ticker) => {
    try {
      return [ticker, await fetchQuote(ticker)] as const;
    } catch {
      return [ticker, null] as const;
    }
  }));
  return new Map(entries.filter((entry): entry is [string, MarketQuote] => entry[1] !== null));
}

async function getLatestReports(userId: string): Promise<InvestmentReport[]> {
  const settled = await Promise.allSettled(
    Array.from(REPORT_TICKERS).map((ticker) => ensureReports(userId, ticker).then(([latest]) => latest)),
  );
  const reports = settled
    .filter((result): result is PromiseFulfilledResult<InvestmentReport> => result.status === "fulfilled")
    .map((result) => result.value)
    .filter((report): report is InvestmentReport => Boolean(report));
  if (reports.length === 0) throw new Error("MARKET_DATA_UNAVAILABLE");
  return reports;
}

async function ensureReports(userId: string, ticker: string): Promise<InvestmentReport[]> {
  const existing = await storage.listReports(userId, ticker);
  const latest = existing[0];
  const isFresh = latest && Date.now() - new Date(latest.generatedAt).getTime() < 6 * 60 * 60 * 1000;
  if (isFresh) return existing;

  try {
    await generateReport(userId, ticker);
    return storage.listReports(userId, ticker);
  } catch (error) {
    if (existing.length) return existing;
    throw error;
  }
}

async function generateReport(userId: string, ticker: string): Promise<InvestmentReport> {
  const quote = await fetchQuote(ticker);
  const trend = quote.changePercent >= 1 ? "positivo" : quote.changePercent <= -1 ? "negativo" : "estável";
  const signal = quote.changePercent >= 1
    ? "Acompanhamento positivo"
    : quote.changePercent <= -1
      ? "Atenção recomendada"
      : "Movimento estável";
  const rangeText = quote.low52Week && quote.high52Week
    ? `A cotação está entre R$ ${quote.low52Week.toFixed(2)} e R$ ${quote.high52Week.toFixed(2)} no intervalo de 52 semanas.`
    : "O histórico de 52 semanas não foi informado pela fonte.";
  return storage.createReport({
    userId,
    ticker,
    companyName: quote.companyName,
    price: quote.price,
    changePercent: quote.changePercent,
    signal,
    summary: `O ${ticker} apresenta movimento ${trend}, com cotação de R$ ${quote.price.toFixed(2)} e variação diária de ${quote.changePercent.toFixed(2)}%. ${rangeText}`,
    strengths: [
      "Dados de mercado atualizados diretamente da Yahoo Finance.",
      quote.changePercent >= 0
        ? "A variação mais recente não indica pressão vendedora imediata."
        : "A empresa mantém liquidez de negociação para acompanhamento contínuo.",
    ],
    risks: [
      "Variações de curto prazo podem ocorrer com mudanças nos juros e no cenário macroeconômico.",
      quote.high52Week && quote.price < quote.high52Week * 0.85
        ? "A cotação está distante da máxima de 52 semanas, exigindo acompanhamento do motivo."
        : "O preço deve ser analisado junto aos fundamentos e ao perfil de risco do investidor.",
    ],
    outlook: "Use esta leitura como ponto de partida e combine-a com seus objetivos, diversificação e tolerância a risco. Ela não constitui recomendação de investimento.",
    source: "Yahoo Finance",
  });
}

function sendMarketDataError(res: Response, action: string, error: unknown) {
  console.error(`[investments] failed to ${action}`, error);
  res.status(502).json({
    error: "MARKET_DATA_UNAVAILABLE",
    message: "Não foi possível atualizar os dados de mercado agora. Tente novamente em instantes.",
  });
}

function sendInternalError(res: Response, action: string, error: unknown) {
  console.error(`[investments] failed to ${action}`, error);
  res.status(500).json({
    error: "INVESTMENTS_UNAVAILABLE",
    message: "Não foi possível concluir esta ação agora. Tente novamente em instantes.",
  });
}

function sendPortfolioError(res: Response, error: unknown) {
  if (error instanceof PortfolioValidationError) {
    return res.status(400).json({ error: error.message });
  }
  sendInternalError(res, "salvar movimentação", error);
}
