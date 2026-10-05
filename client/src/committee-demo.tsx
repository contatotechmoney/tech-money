import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HermesAnalysisPanel } from "./components/hermes-analysis-panel";
import { createCommitteePreview, type PreviewScenario } from "./lib/committee-preview";
import { Button } from "./components/ui/button";
import "./index.css";

function Demo() {
  const [scenario, setScenario] = useState<PreviewScenario>("success");
  const [session, setSession] = useState(() => ({ engine: createCommitteePreview(), cache: new QueryClient() }));
  function restart(next = scenario) {
    session.cache.clear();
    setScenario(next);
    setSession({ engine: createCommitteePreview(next), cache: new QueryClient() });
  }
  return <main className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
    <header className="space-y-2"><p className="text-sm font-medium text-primary">TECH MONEY · INVESTIMENTOS</p><h1 className="text-2xl font-semibold">Teste do módulo de análise</h1><p className="text-sm text-muted-foreground">1. Escolha a ação e o modelo. 2. Confira o preço. 3. Confirme e acompanhe o saldo fictício.</p></header>
    <QueryClientProvider key={session.engine.transport.scope} client={session.cache}>
      <HermesAnalysisPanel preview={session.engine.transport} />
    </QueryClientProvider>
    <section className="space-y-3 rounded-lg border p-4"><h2 className="font-medium">Controles da demonstração</h2><label className="block space-y-2 text-sm">Cenário de teste<select className="block w-full rounded-md border bg-background p-3" value={scenario} onChange={e => restart(e.target.value as PreviewScenario)}><option value="success">Análise concluída</option><option value="incomplete">Resposta incompleta</option><option value="limit">Limite de processamento</option><option value="uncertain">Consumo não confirmado</option></select></label><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => restart()}>Reiniciar teste</Button><Button variant="outline" onClick={() => session.engine.reprice()}>Alterar preço fictício</Button></div><p className="text-xs text-muted-foreground">Alterar o cenário reinicia o teste. Para testar preço desatualizado, abra a confirmação, volte, altere o preço e tente confirmar: a oferta antiga será recusada.</p></section>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Demo />);
