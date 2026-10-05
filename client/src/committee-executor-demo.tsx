import React, {useEffect, useState} from "react";
import {createRoot} from "react-dom/client";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {HermesAnalysisPanel, type AnalysisPreviewTransport} from "./components/hermes-analysis-panel";
import "./index.css";

async function request(method: "GET" | "POST", path: string, data?: unknown) {
  if(!/^\/(?:api\/investments\/(?:analysis-options|credits|analyses(?:\/[a-f0-9-]+)?)|reset|diagnostics)$/.test(path)) throw Error("Rota local inválida.");
  const response=await fetch("/local-committee"+path,{method,headers:{"Content-Type":"application/json","X-Committee-Demo":"offline-only"},...(data===undefined ? {} : {body:JSON.stringify(data)})});
  const body=await response.json();
  if(!response.ok) throw Error((body.code ? body.code+": " : "")+(body.error || "Falha no teste local."));
  if(body.status === "running") {
    const diagnostic=await request("GET","/diagnostics");
    if(diagnostic.lastResult?.outcome === "USAGE_UNVERIFIED") body.simulation={stage:0,total:21,blockedReason:"Consumo incerto. A reserva permanece até conferência; nenhuma nova execução foi iniciada."};
  }
  return body;
}
function Demo() {
  const [session,setSession]=useState(()=>({cache:new QueryClient(),transport:{scope:crypto.randomUUID(),request} as AnalysisPreviewTransport}));
  const [scenario,setScenario]=useState("success"), [error,setError]=useState("");
  const [diagnostics,setDiagnostics]=useState<{executions:number;lastResult?:{network_calls:number;settled_responses:number;outcome:string}}>();
  const [busy,setBusy]=useState(false);
  useEffect(()=>{let active=true;void request("GET","/diagnostics").then(d=>{if(active)setScenario(d.scenario);}).catch(()=>{if(active)setError("O servidor de teste local não está disponível.");});return()=>{active=false;};},[]);
  async function reset(next:string) {
    setBusy(true);setError("");
    try {await request("POST","/reset",{scenario:next});session.cache.clear();setScenario(next);setDiagnostics(undefined);setSession({cache:new QueryClient(),transport:{scope:crypto.randomUUID(),request}});}
    catch {setError("O servidor de teste local não está disponível.");}
    finally {setBusy(false);}
  }
  return <main className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8"><header className="space-y-2"><p className="text-sm font-medium text-primary">TECH MONEY · TESTE LOCAL COMPLETO</p><h1 className="text-2xl font-semibold">Da confirmação ao comitê</h1><p>Escolha a ação, confira os 2 créditos fictícios e confirme. O painel envia a solicitação ao servidor local, que executa 21 etapas simuladas no Python.</p><p className="text-sm text-muted-foreground">Nenhum modelo pago é chamado. Saldo, preços e resultados são fictícios. Esta tela não valida login, pagamento ou uma análise financeira real.</p></header>
    <QueryClientProvider key={session.transport.scope} client={session.cache}><HermesAnalysisPanel preview={session.transport}/></QueryClientProvider>
    <section className="space-y-3 rounded-lg border p-4"><h2 className="font-medium">Experimente os cenários</h2><select aria-label="Cenário do executor" className="w-full border rounded p-3 bg-background" disabled={busy} value={scenario} onChange={e=>void reset(e.target.value)}><option value="success">Concluir as 21 etapas</option><option value="truncated">Resposta incompleta: devolver créditos</option><option value="budget_exhausted">Limite interno: devolver créditos</option><option value="unknown_usage">Consumo incerto: manter reserva</option></select><p className="text-sm">Mudar o cenário reinicia apenas este saldo de demonstração.</p><button disabled={busy} className="border rounded p-2" onClick={()=>void reset(scenario)}>Reiniciar teste</button>{" "}<button className="border rounded p-2" onClick={()=>void request("GET","/diagnostics").then(setDiagnostics).catch(()=>setError("Não foi possível conferir o executor."))}>Conferir executor</button>{error&&<p role="alert">{error}</p>}{diagnostics&&<p role="status">Execuções Python: {diagnostics.executions}. Chamadas externas: {diagnostics.lastResult?.network_calls ?? "aguardando"}. Etapas concluídas: {diagnostics.lastResult?.settled_responses ?? 0}. Resultado: {diagnostics.lastResult?.outcome ?? "aguardando confirmação"}.</p>}</section>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Demo/>);
