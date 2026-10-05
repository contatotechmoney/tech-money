import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Wallet = { available: number; reserved: number; entries: { kind: string; delta: number; reason: string; createdAt: string }[] };
const labels: Record<string,string> = { grant: "Créditos concedidos", reserve: "Reserva de análise", consume: "Estudo concluído", refund: "Créditos devolvidos" };
export default function Credits() {
  const wallet = useQuery<Wallet>({ queryKey: ["/api/investments/credits"], retry: false });
  return <div className="mx-auto max-w-4xl space-y-6 py-8">
    <h1 className="text-3xl font-bold">Créditos para análises</h1>
    <p className="text-muted-foreground">Antes de solicitar uma análise, você verá o custo em créditos. Os planos e a compra de créditos estão em preparação.</p>
    <Card><CardHeader><CardTitle>Sua carteira</CardTitle></CardHeader><CardContent className="space-y-4">
      {wallet.isLoading ? <p role="status">Consultando créditos…</p> : wallet.isError ? <div role="alert"><p>A carteira ainda não está disponível. Nenhuma cobrança foi realizada.</p><Button variant="outline" onClick={() => wallet.refetch()}>Consultar novamente</Button></div> : <>
        <div className="grid grid-cols-2 gap-4"><p><strong className="block text-3xl">{wallet.data?.available ?? 0}</strong>Disponíveis</p><p><strong className="block text-3xl">{wallet.data?.reserved ?? 0}</strong>Reservados</p></div>
        <p className="text-sm text-muted-foreground">Uma solicitação sem confirmação mantém a reserva para evitar cobrança duplicada. Falhas confirmadas devolvem os créditos. A conclusão do estudo informativo consome os créditos e não representa aprovação de uma recomendação.</p>
      </>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Movimentações recentes</CardTitle></CardHeader><CardContent>
      {!wallet.data?.entries.length ? <p className="text-muted-foreground">Ainda não há movimentações para mostrar.</p> : <ul className="space-y-4">{wallet.data.entries.map((e,i) => <li key={i} className="border-b pb-3"><p className="font-medium">{labels[e.kind] ?? e.kind} · {e.delta > 0 ? "+" : ""}{e.delta} créditos</p><p className="text-sm">{e.reason}</p><time className="text-xs text-muted-foreground">{new Date(e.createdAt).toLocaleString("pt-BR")}</time></li>)}</ul>}
    </CardContent></Card>
  </div>;
}
