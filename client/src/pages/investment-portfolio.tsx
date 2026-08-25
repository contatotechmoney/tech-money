import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowUpFromLine, BriefcaseBusiness, Loader2, Pencil, Plus, RefreshCw, Save, Trash2, TrendingDown, TrendingUp, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiRequest } from "@/lib/queryClient";

type Quote = { price: number; changePercent: number; companyName: string; updatedAt: string };
type TransactionType = "buy" | "sell";
type PortfolioTransaction = {
  id: string;
  ticker: string;
  transactionType: TransactionType;
  quantity: number;
  price: number;
  operationDate: string;
  realizedProfit: number | null;
  quantityAfter: number;
  averagePriceAfter: number;
};
type PortfolioItem = {
  id: string;
  ticker: string;
  quantity: number;
  averagePrice: number;
  investedValue: number;
  currentValue: number | null;
  realizedProfit: number;
  returnValue: number | null;
  returnPercent: number | null;
  quote?: Quote;
};
type PortfolioResponse = {
  items: PortfolioItem[];
  transactions: PortfolioTransaction[];
  summary: {
    totalInvested: number;
    totalCurrent: number | null;
    realizedProfit: number;
    unrealizedReturnValue: number | null;
    returnValue: number | null;
    returnPercent: number | null;
  };
  source: string;
  updatedAt: string;
};

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 6 });
const today = () => new Date().toISOString().slice(0, 10);

export default function InvestmentPortfolio() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [transactionType, setTransactionType] = useState<TransactionType>("buy");
  const [ticker, setTicker] = useState("");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [operationDate, setOperationDate] = useState(today);
  const [editingId, setEditingId] = useState<string | null>(null);

  const portfolioQuery = useQuery<PortfolioResponse>({
    queryKey: ["/api/investments/portfolio"],
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const saveTransaction = useMutation({
    mutationFn: async () => {
      const path = editingId
        ? `/api/investments/portfolio/transactions/${editingId}`
        : "/api/investments/portfolio/transactions";
      const response = await apiRequest(editingId ? "PATCH" : "POST", path, {
        ticker, transactionType, quantity, price, operationDate,
      });
      return response.json();
    },
    onSuccess: () => {
      resetForm();
      void queryClient.invalidateQueries({ queryKey: ["/api/investments/portfolio"] });
    },
  });

  const deleteTransaction = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/investments/portfolio/transactions/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["/api/investments/portfolio"] }),
  });

  const data = portfolioQuery.data;
  const error = saveTransaction.error || deleteTransaction.error || portfolioQuery.error;
  const canSubmit = /^[A-Za-z]{4}[0-9]{1,2}$/.test(ticker.trim()) &&
    Number(quantity) > 0 && Number(price) > 0 && Boolean(operationDate);

  function resetForm() {
    setEditingId(null);
    setTransactionType("buy");
    setTicker("");
    setQuantity("");
    setPrice("");
    setOperationDate(today());
  }

  function editTransaction(transaction: PortfolioTransaction) {
    setEditingId(transaction.id);
    setTransactionType(transaction.transactionType);
    setTicker(transaction.ticker);
    setQuantity(String(transaction.quantity));
    setPrice(String(transaction.price));
    setOperationDate(transaction.operationDate);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary">
            <BriefcaseBusiness className="h-3.5 w-3.5" />{t("investmentArea")}
          </div>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{t("portfolioTitle")}</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">{t("portfolioDescription")}</p>
        </div>
        {data && <div className="flex items-center gap-2 text-xs text-muted-foreground"><RefreshCw className="h-3.5 w-3.5" />{t("updatedAt")} {formatDateTime(data.updatedAt)}</div>}
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{getErrorMessage(error, t("marketDataError"))}</AlertDescription></Alert>}

      <Card>
        <CardHeader>
          <CardTitle>{editingId ? t("editTransaction") : t("addTransaction")}</CardTitle>
          <CardDescription>{t("transactionFormDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2 lg:grid-cols-[1fr_1.2fr_1fr_1fr_1fr_auto]" onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) saveTransaction.mutate();
          }}>
            <label className="space-y-2 text-sm font-medium">{t("operationType")}
              <Select value={transactionType} onValueChange={(value: TransactionType) => setTransactionType(value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="buy">{t("buy")}</SelectItem><SelectItem value="sell">{t("sell")}</SelectItem></SelectContent>
              </Select>
            </label>
            <label className="space-y-2 text-sm font-medium">{t("ticker")}
              <Input value={ticker} onChange={(event) => setTicker(event.target.value.toUpperCase())} placeholder="BBDC3" maxLength={6} />
            </label>
            <label className="space-y-2 text-sm font-medium">{t("quantity")}
              <Input type="number" min="0.000001" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="100" />
            </label>
            <label className="space-y-2 text-sm font-medium">{t("price")}
              <Input type="number" min="0.0001" step="0.0001" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="15,20" />
            </label>
            <label className="space-y-2 text-sm font-medium">{t("operationDate")}
              <Input type="date" value={operationDate} onChange={(event) => setOperationDate(event.target.value)} />
            </label>
            <div className="flex items-end gap-2">
              <Button type="submit" className="flex-1" disabled={!canSubmit || saveTransaction.isPending}>
                {saveTransaction.isPending ? <Loader2 className="animate-spin" /> : editingId ? <Save /> : <Plus />}
                {editingId ? t("saveChanges") : t("addTransaction")}
              </Button>
              {editingId && <Button type="button" variant="outline" size="icon" onClick={resetForm} aria-label={t("cancel")}><X /></Button>}
            </div>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">{t("averageCostHint")}</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard label={t("investedValue")} value={currency.format(data?.summary.totalInvested ?? 0)} />
        <SummaryCard label={t("currentValue")} value={data?.summary.totalCurrent === null ? "—" : currency.format(data?.summary.totalCurrent ?? 0)} />
        <SummaryCard label={t("realizedProfit")} value={currency.format(data?.summary.realizedProfit ?? 0)} detail={t("fromSales")} positive={(data?.summary.realizedProfit ?? 0) >= 0} />
        <SummaryCard label={t("portfolioReturn")} value={data?.summary.returnValue === null ? "—" : currency.format(data?.summary.returnValue ?? 0)} detail={data?.summary.returnPercent === null ? t("quoteUnavailable") : formatPercent(data?.summary.returnPercent ?? 0)} positive={data?.summary.returnValue === null ? undefined : (data?.summary.returnValue ?? 0) >= 0} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("yourAssets")}</CardTitle>
          <CardDescription>{data ? `${t("quoteSource")}: ${data.source}` : t("loading")}</CardDescription>
        </CardHeader>
        <CardContent>
          {portfolioQuery.isLoading ? <Loading /> : !data?.items.length ? <EmptyPortfolio text={t("emptyPortfolio")} description={t("emptyPortfolioDescription")} /> : (
            <div className="space-y-3">
              {data.items.map((item) => (
                <div key={item.id} className="flex flex-col gap-4 rounded-lg border p-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#1b4d3e] text-xs font-bold text-white">{item.ticker.slice(0, 2)}</div>
                    <div>
                      <div className="flex items-center gap-2"><p className="font-semibold">{item.ticker}</p>{item.quote && <Badge variant="outline" className={item.quote.changePercent >= 0 ? "border-emerald-200 text-emerald-700" : "border-red-200 text-red-700"}>{formatPercent(item.quote.changePercent)}</Badge>}</div>
                      <p className="text-sm text-muted-foreground">{item.quote?.companyName || t("quoteUnavailable")}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{number.format(item.quantity)} {t("shares")} · {t("averagePrice")}: {currency.format(item.averagePrice)}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-right text-sm md:min-w-[300px]">
                    <span className="text-muted-foreground">{t("currentValue")}</span><span className="font-semibold">{item.currentValue === null ? "—" : currency.format(item.currentValue)}</span>
                    <span className="text-muted-foreground">{t("realizedProfit")}</span><span className={item.realizedProfit >= 0 ? "font-semibold text-emerald-700" : "font-semibold text-red-700"}>{currency.format(item.realizedProfit)}</span>
                    <span className="text-muted-foreground">{t("portfolioReturn")}</span><span className={item.returnValue !== null && item.returnValue >= 0 ? "font-semibold text-emerald-700" : "font-semibold text-red-700"}>{item.returnValue === null ? "—" : `${currency.format(item.returnValue)} (${formatPercent(item.returnPercent || 0)})`}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("transactionHistory")}</CardTitle><CardDescription>{t("transactionHistoryDescription")}</CardDescription></CardHeader>
        <CardContent>
          {!data?.transactions.length ? <EmptyPortfolio text={t("emptyHistory")} description={t("emptyHistoryDescription")} /> : (
            <Table>
              <TableHeader><TableRow><TableHead>{t("operationDate")}</TableHead><TableHead>{t("ticker")}</TableHead><TableHead>{t("operationType")}</TableHead><TableHead className="text-right">{t("quantity")}</TableHead><TableHead className="text-right">{t("price")}</TableHead><TableHead className="text-right">{t("realizedProfit")}</TableHead><TableHead className="text-right">{t("actions")}</TableHead></TableRow></TableHeader>
              <TableBody>{data.transactions.map((transaction) => (
                <TableRow key={transaction.id}>
                  <TableCell>{formatDate(transaction.operationDate)}</TableCell>
                  <TableCell className="font-semibold">{transaction.ticker}</TableCell>
                  <TableCell><Badge variant="outline" className={transaction.transactionType === "buy" ? "border-blue-200 text-blue-700" : "border-amber-200 text-amber-700"}>{transaction.transactionType === "buy" ? <ArrowDownToLine className="mr-1 inline h-3.5 w-3.5" /> : <ArrowUpFromLine className="mr-1 inline h-3.5 w-3.5" />}{transaction.transactionType === "buy" ? t("buy") : t("sell")}</Badge></TableCell>
                  <TableCell className="text-right">{number.format(transaction.quantity)}</TableCell>
                  <TableCell className="text-right">{currency.format(transaction.price)}</TableCell>
                  <TableCell className={`text-right ${transaction.realizedProfit === null ? "text-muted-foreground" : transaction.realizedProfit >= 0 ? "text-emerald-700" : "text-red-700"}`}>{transaction.realizedProfit === null ? "—" : currency.format(transaction.realizedProfit)}</TableCell>
                  <TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => editTransaction(transaction)} aria-label={t("edit")}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => deleteTransaction.mutate(transaction.id)} disabled={deleteTransaction.isPending} aria-label={t("removeTransaction")}><Trash2 className="h-4 w-4" /></Button></div></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value, detail, positive }: { label: string; value: string; detail?: string; positive?: boolean }) {
  return <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className={`mt-2 text-2xl font-bold ${positive === undefined ? "text-foreground" : positive ? "text-emerald-700" : "text-red-700"}`}>{value}</p>{detail && <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">{positive ? <TrendingUp className="h-3 w-3 text-emerald-600" /> : <TrendingDown className="h-3 w-3 text-red-600" />}{detail}</p>}</CardContent></Card>;
}

function Loading() { return <div className="flex min-h-40 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 animate-spin" />Carregando...</div>; }
function EmptyPortfolio({ text, description }: { text: string; description: string }) { return <div className="flex min-h-32 flex-col items-center justify-center rounded-lg border border-dashed text-center"><BriefcaseBusiness className="mb-3 h-8 w-8 text-primary/60" /><p className="font-medium">{text}</p><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>; }
function formatPercent(value: number) { return `${value >= 0 ? "+" : ""}${value.toFixed(2).replace(".", ",")}%`; }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
function formatDate(value: string) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(`${value}T12:00:00`)); }
function getErrorMessage(error: Error, fallback: string) { try { const parsed = JSON.parse(error.message.replace(/^\d+:\s*/, "")) as { error?: string; message?: string }; return parsed.error || parsed.message || fallback; } catch { return fallback; } }