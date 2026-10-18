import {Route,Switch,Redirect} from 'wouter';
import {QueryClientProvider} from '@tanstack/react-query';
import {queryClient} from '@/lib/queryClient';
import {LanguageProvider} from '@/contexts/LanguageContext';
import {TooltipProvider} from '@/components/ui/tooltip';
import {Toaster} from '@/components/ui/toaster';
import InvestmentLayout from '@/components/investment-layout';
import Agents from '@/pages/ai-agents';
import Reports from '@/pages/investment-reports';
import Report from '@/pages/investment-report';
import Portfolio from '@/pages/investment-portfolio';
import PortfolioSimulation from '@/pages/portfolio-simulation';
import Suitability from '@/pages/suitability';
import {MigrationAuthProvider,useAuth} from './auth';
function Portal(){const {isLoaded,isSignedIn}=useAuth();if(!isLoaded)return <main className="p-8">Conferindo seu acesso…</main>;if(!isSignedIn)return <main className="mx-auto max-w-xl p-8"><h1 className="text-2xl font-bold">Entre com seu novo acesso</h1><p className="my-4">Esta prévia exige o login Supabase e o vínculo exclusivo já confirmado.</p><a className="underline" href="/migration/login">Receber link de acesso</a></main>;
return <InvestmentLayout><div role="status" className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><strong>Prévia da migração · histórico e simulações fictícias</strong><p>Histórico restaurado no Supabase. Você já pode iniciar simulações com dados fictícios, sem modelos externos, tokens ou créditos. Alterações na carteira e no perfil, cobranças e análises reais permanecem bloqueadas.</p><a href="https://invest.techmoney.com.br/investments/agents" className="underline">Abrir portal atual</a></div><Switch>
<Route path="/investments/agents/:ticker">{params=><Report ticker={params.ticker}/>}</Route><Route path="/investments/agents" component={Agents}/><Route path="/investments/reports" component={Reports}/><Route path="/investments/portfolio/simulation" component={PortfolioSimulation}/><Route path="/investments/portfolio" component={Portfolio}/><Route path="/investments/suitability" component={Suitability}/><Route path="/investments/portfolio/pilot"><p>O piloto está preservado. A preparação e a execução real permanecem bloqueadas durante a migração.</p></Route><Route path="/investments/:rest*"><p>Esta função ainda está em validação. Nenhuma operação real está disponível nesta prévia.</p></Route><Route><Redirect to="/investments/agents"/></Route></Switch></InvestmentLayout>}
export default function App(){return <QueryClientProvider client={queryClient}><LanguageProvider><TooltipProvider><Toaster/><MigrationAuthProvider><Portal/></MigrationAuthProvider></TooltipProvider></LanguageProvider></QueryClientProvider>}
