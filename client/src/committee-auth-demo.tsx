import {useEffect,useMemo} from "react";
import {createRoot} from "react-dom/client";
import {ClerkProvider,SignIn,useAuth,UserButton} from "@clerk/react";
import {QueryClient,QueryClientProvider,useQuery} from "@tanstack/react-query";
import {getQueryFn} from "./lib/queryClient";
import {AuthenticatedCommitteeSimulation} from "./components/authenticated-committee-simulation";
import "./index.css";

function Session() {
  const session=useQuery<{userId:string}>({queryKey:["/api/auth/session"],retry:false});
  const status=useQuery<{available:boolean}>({queryKey:["/api/investments/simulation/status"],retry:false});
  if(session.isPending || status.isPending) return <p>Conferindo sua sessão…</p>;
  if(session.isError || status.isError) return <p role="alert">Não foi possível validar a sessão no servidor. Entre novamente e confira o ambiente de login.</p>;
  return <><div className="flex items-center justify-between rounded-lg border p-4"><p>Sessão verificada pelo servidor.</p><UserButton/></div>{status.data.available?<AuthenticatedCommitteeSimulation/>:<section className="space-y-3 rounded-lg border p-4"><h2 className="font-semibold">Sua conta ainda não está autorizada para esta simulação.</h2><p>O operador precisa autorizar esta identidade no ambiente de desenvolvimento. Entrar não concede saldo automaticamente.</p><p className="break-all text-sm">Identificador da sua conta: <code>{session.data.userId}</code></p></section>}</>;
}
function Authenticated() {
  const {isLoaded,isSignedIn,userId}=useAuth();
  const cache=useMemo(()=>new QueryClient({defaultOptions:{queries:{queryFn:getQueryFn({on401:"throw"}),retry:false,refetchOnWindowFocus:false}}}),[userId]);
  useEffect(()=>()=>{void cache.cancelQueries();cache.clear();},[cache]);
  if(!isLoaded) return <p>Carregando acesso…</p>;
  if(!isSignedIn) return <SignIn routing="hash" forceRedirectUrl="/committee-auth-demo.html"/>;
  return <QueryClientProvider key={userId} client={cache}><Session/></QueryClientProvider>;
}
const key=import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
createRoot(document.getElementById("root")!).render(<main className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8"><header className="space-y-2"><p className="text-sm font-medium text-primary">TECH MONEY · AMBIENTE ISOLADO</p><h1 className="text-2xl font-semibold">Teste de acesso e análise</h1><p>Login real de desenvolvimento, saldo e resultados fictícios. Sem modelos pagos, banco de clientes ou envio de mensagens.</p></header>{key?.startsWith("pk_test_")?<ClerkProvider publishableKey={key}><Authenticated/></ClerkProvider>:<p role="alert">Configure uma instância de desenvolvimento do login antes de iniciar este teste.</p>}</main>);
