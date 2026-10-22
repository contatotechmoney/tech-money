import {Route,Switch,Redirect,useLocation} from 'wouter';
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
import B3Import from './B3Import';
import PortfolioDiagnosis from './PortfolioDiagnosis';
import B3Connection from './B3Connection';
import {MigrationAuthProvider,useAuth} from './auth';
const finalPortal=window.location.hostname==='invest.techmoney.com.br';
function Portal(){const [location]=useLocation();const focusedPortfolio=location.includes('/portfolio/diagnosis')||location.endsWith('/portfolio/b3');const {isLoaded,isSignedIn}=useAuth();if(!isLoaded)return <main className="p-8">Conferindo seu acesso…</main>;if(!isSignedIn)return <main className="mx-auto max-w-xl p-8"><h1 className="text-2xl font-bold">Entre com seu novo acesso</h1><p className="my-4">Entre pelo link enviado ao seu e-mail autorizado. Seu histórico e vínculo exclusivo estão preservados.</p><a className="underline" href="/migration/login">Receber link de acesso</a></main>;
return <InvestmentLayout><div role="status" className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-teal-200 bg-teal-50 px-4 py-2 text-sm text-teal-950"><span><strong>{finalPortal?'Invest · acesso exclusivo':'Prévia do Invest'}</strong> · Análises reais bloqueadas · Sem débito de créditos</span>{!finalPortal&&<a href="https://invest.techmoney.com.br/investments/agents" className="underline">Abrir portal atual</a>}</div>{!focusedPortfolio&&<nav aria-label="Carteira e extratos" className="mb-5 flex flex-wrap gap-3 text-sm font-medium"><a className="rounded-lg border bg-white px-4 py-2" href="/investments/portfolio/import-b3">Extratos da B3</a><a className="rounded-lg border border-teal-300 bg-teal-50 px-4 py-2 text-teal-900" href="/investments/portfolio/diagnosis">Diagnóstico da carteira · sem créditos</a><a className="rounded-lg border bg-white px-4 py-2" href="/investments/portfolio/b3">Conexão B3</a></nav>}<Switch>
<Route path="/investments/agents/:ticker">{params=><Report ticker={params.ticker}/>}</Route><Route path="/investments/agents" component={Agents}/><Route path="/investments/reports" component={Reports}/><Route path="/investments/portfolio/simulation" component={PortfolioSimulation}/><Route path="/investments/portfolio/b3" component={B3Connection}/><Route path="/investments/portfolio/diagnosis" component={PortfolioDiagnosis}/><Route path="/investments/portfolio/import-b3" component={B3Import}/><Route path="/investments/portfolio" component={Portfolio}/><Route path="/investments/suitability" component={Suitability}/><Route path="/investments/portfolio/pilot"><p>O piloto está preservado. A preparação e a execução real permanecem bloqueadas durante a migração.</p></Route><Route path="/investments/:rest*"><p>Esta função ainda está em validação. Nenhuma operação real está disponível nesta prévia.</p></Route><Route><Redirect to="/investments/agents"/></Route></Switch></InvestmentLayout>}
export default function App(){return <QueryClientProvider client={queryClient}><LanguageProvider><TooltipProvider><Toaster/><MigrationAuthProvider><Portal/></MigrationAuthProvider></TooltipProvider></LanguageProvider></QueryClientProvider>}
