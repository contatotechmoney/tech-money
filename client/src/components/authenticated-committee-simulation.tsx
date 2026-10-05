import {useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {apiRequest} from "@/lib/queryClient";
import {Button} from "@/components/ui/button";
import {HermesAnalysisPanel, type AnalysisPreviewTransport} from "./hermes-analysis-panel";

export function AuthenticatedCommitteeSimulation() {
  const status=useQuery<{available:boolean}>({queryKey:["/api/investments/simulation/status"],retry:false});
  const [transport,setTransport]=useState<AnalysisPreviewTransport>();
  if(!status.data?.available) return null;
  function enter() {
    const prefix="/api/investments/simulation";
    const request:AnalysisPreviewTransport["request"]=async(method,path,data)=>{
      if(!/^\/(?:api\/investments\/(?:analysis-options|credits|analyses(?:\/[a-f0-9-]+)?)|diagnostics)$/.test(path)) throw Error("Rota de simulação inválida.");
      const body=await (await apiRequest(method,prefix+path,data)).json();
      if(body.status === "running") {
        const diagnostic=await request("GET","/diagnostics") as {lastResult?:{outcome:string}};
        if(diagnostic.lastResult?.outcome === "USAGE_UNVERIFIED") body.simulation={stage:0,total:21,blockedReason:"Consumo incerto: reserva mantida até conferência."};
      }
      return body;
    };
    setTransport({scope:crypto.randomUUID(),request});
  }
  return <section className="space-y-4 rounded-lg border border-primary/30 p-4"><h2 className="font-semibold">Ambiente de teste da sua conta</h2><p className="text-sm text-muted-foreground">Simulação restrita ao desenvolvimento: créditos e resultados fictícios, separados da carteira real. Nenhuma chamada a modelos pagos.</p>{transport?<><HermesAnalysisPanel preview={transport}/><Button variant="outline" onClick={()=>setTransport(undefined)}>Fechar simulação</Button></>:<Button variant="outline" onClick={enter}>Testar com saldo fictício</Button>}</section>;
}
