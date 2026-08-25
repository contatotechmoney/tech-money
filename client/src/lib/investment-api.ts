import { useQuery } from "@tanstack/react-query";
import type { InvestmentTicker } from "./investment-assets";

export interface InvestmentHistoryPoint {
  date: string;
  close: number;
}

export interface InvestmentQuote {
  ticker: InvestmentTicker;
  symbol: string;
  company: string;
  currency: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  asOf: string;
  history: InvestmentHistoryPoint[];
}

export interface PortfolioHolding {
  id: string;
  userId: string;
  ticker: InvestmentTicker;
  quantity: number;
  averagePrice: number;
  createdAt: string;
}

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error || "Não foi possível carregar os dados.");
  }
  return response.status === 204 ? (undefined as T) : response.json() as Promise<T>;
}

export function useInvestmentQuotes(tickers: InvestmentTicker[] = ["BBDC3", "BBAS3"]) {
  const query = tickers.join(",");
  return useQuery({
    queryKey: ["investment-quotes", query],
    queryFn: () => requestJson<{ quotes: InvestmentQuote[] }>(
      `/api/investments/quotes?symbols=${encodeURIComponent(query)}`,
    ),
    staleTime: 60_000,
    refetchInterval: 300_000,
  });
}

export function usePortfolioHoldings() {
  return useQuery({
    queryKey: ["investment-portfolio"],
    queryFn: () => requestJson<{ holdings: PortfolioHolding[] }>(
      "/api/investments/portfolio",
    ),
  });
}

export function createPortfolioHolding(input: {
  ticker: InvestmentTicker;
  quantity: number;
  averagePrice: number;
}) {
  return requestJson<{ holding: PortfolioHolding }>(
    "/api/investments/portfolio",
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function deletePortfolioHolding(id: string) {
  return requestJson<void>(`/api/investments/portfolio/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function formatQuoteDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}