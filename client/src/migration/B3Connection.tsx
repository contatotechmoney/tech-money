import {useEffect,useState} from 'react';
import {Link} from 'wouter';
import './portfolio-diagnosis.css';
export default function B3Connection(){
 const [ready,setReady]=useState(false),[error,setError]=useState(false);
 useEffect(()=>{let active=true;fetch('/api/investments/b3/connection',{credentials:'same-origin',cache:'no-store'}).then(async r=>{if(!r.ok)throw Error();const d=await r.json();if(d.state!=='awaiting_business_access'||d.automaticImportEnabled!==false||d.connected!==false)throw Error();if(active)setReady(true);}).catch(()=>{if(active)setError(true);});return()=>{active=false;};},[]);
 return <section className="diagnosis-page space-y-5"><div className="diagnosis-toolbar"><div><p className="diagnosis-eyebrow">DADOS DA CARTEIRA</p><h1 className="text-2xl font-bold">Conexão com a B3</h1></div><nav aria-label="Dados da carteira" className="diagnosis-actions"><Link href="/investments/portfolio/diagnosis">Ver diagnóstico</Link><Link href="/investments/portfolio/import-b3">Importar Excel</Link></nav></div>
  <section className="diagnosis-hero"><p className="diagnosis-eyebrow">INTEGRAÇÃO EM PREPARAÇÃO</p><h2 className="diagnosis-title">Sua posição, com autorização e conferência</h2><p className="diagnosis-subtitle">A conexão automática usará as APIs oficiais da B3. Ela ainda não está ativa no Invest. Enquanto isso, você pode importar o Excel original, conferir os valores e salvar o extrato na sua área privada.</p></section>
  <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">{error?'Não foi possível confirmar o estado da integração. Nenhuma conexão ou importação foi iniciada.':ready?'Não conectado · Aguardando habilitação empresarial e homologação com a B3.':'Conferindo disponibilidade da conexão…'}</div>
  <div className="diagnosis-connection-steps">{[
   ['1','Autorizar na B3','Quando a integração estiver habilitada, você autorizará o compartilhamento no ambiente oficial da B3. O Invest não pedirá sua senha da B3.'],
   ['2','Conferir a posição','A posição recebida mostrará a data de referência e uma prévia dos ativos. Atualização automática não significa cotação em tempo real.'],
   ['3','Confirmar antes de salvar','Você conferirá os dados antes de incorporá-los à carteira. Importar não autoriza os agentes e não debita créditos de análise.']
  ].map(([step,title,text])=><article key={step}><span className="diagnosis-eyebrow">ETAPA {step}</span><h2>{title}</h2><p>{text}</p></article>)}</div>
  <section className="diagnosis-card"><h2 className="diagnosis-section-title">O que falta para ativar</h2><p className="text-sm leading-7 text-slate-600">A Tech Money precisa obter a licença empresarial, o pacote de acesso e validar a integração no ambiente de certificação da B3. Depois, cada cliente deverá autorizar seu próprio compartilhamento. Não há sincronização, coleta de CPF ou contratação nesta tela.</p><div className="mt-4 flex flex-wrap gap-3"><Link className="rounded-lg bg-teal-800 px-4 py-3 text-sm font-semibold text-white" href="/investments/portfolio/import-b3">Usar extrato Excel agora</Link><a className="rounded-lg border px-4 py-3 text-sm" href="https://developers.b3.com.br/apis/api-area-do-investidor?taggroup=Tipo" target="_blank" rel="noreferrer">Conhecer as APIs oficiais da B3 ↗</a></div></section>
 </section>;
}
