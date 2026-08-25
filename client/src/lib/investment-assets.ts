export const INVESTMENT_ASSETS = [
  {
    ticker: "BBDC3",
    company: "Banco Bradesco S.A.",
    symbol: "BBDC3.SA",
  },
  {
    ticker: "BBAS3",
    company: "Banco do Brasil S.A.",
    symbol: "BBAS3.SA",
  },
] as const;

export type InvestmentTicker = (typeof INVESTMENT_ASSETS)[number]["ticker"];