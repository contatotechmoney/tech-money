import {useEffect,useState} from 'react';
import {Link} from 'wouter';
import {B3_FILE_LIMIT,previewB3Positions} from '@shared/b3-position-preview';
import {B3_XLSX_LIMIT,checkXlsxArchive,previewB3Workbook,type ExcelPreview} from '@shared/b3-xlsx-preview';
type Preview=ReturnType<typeof previewB3Positions>|ExcelPreview;
const money=(n:number|null)=>n===null?'Não informado':n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export default function B3Import(){
 const [preview,setPreview]=useState<Preview|null>(null),[error,setError]=useState(''),[date,setDate]=useState(''),[checked,setChecked]=useState(false),[loading,setLoading]=useState(false);
 const [dateText,setDateText]=useState('');
 const [history,setHistory]=useState<{id:string;statement_date:string;position_count:number}[]>([]);
 const [savingEnabled,setSavingEnabled]=useState(false),[saving,setSaving]=useState(false),[saved,setSaved]=useState('');
 useEffect(()=>{let active=true;fetch('/api/investments/statement-imports',{credentials:'same-origin',cache:'no-store'}).then(async r=>r.ok?r.json():null).then(d=>{if(active){setSavingEnabled(d?.savingEnabled===true);setHistory(Array.isArray(d?.imports)?d.imports:[]);}}).catch(()=>{});return()=>{active=false;};},[]);
 async function reopen(id:string){
  setLoading(true);setError('');
  try{const r=await fetch('/api/investments/statement-imports/'+encodeURIComponent(id),{credentials:'same-origin',cache:'no-store'});const d=await r.json();if(!r.ok||!d.record?.payload)throw Error('Não foi possível reabrir o extrato salvo.');
   const p=d.record.payload;const positions=p.positions as ExcelPreview['positions'];
   const sheets=p.totals.map((t:{sheet:string;declaredTotal:number})=>{const rows=positions.filter(x=>x.sheet===t.sheet);const total=rows.every(x=>x.value!==null)?rows.reduce((sum,x)=>sum+x.value!,0):null;return {sheet:t.sheet,count:rows.length,total,declaredTotal:t.declaredTotal,matches:total===null?null:Math.abs(total-t.declaredTotal)<=0.011};});
   setPreview({positions,sheets,total:positions.every(x=>x.value!==null)?positions.reduce((sum,x)=>sum+x.value!,0):null,warnings:['Extrato reaberto da sua área privada. Empréstimos permanecem separados e Renda Fixa usa CURVA. Não há cálculo de preço médio ou análise real.']});setDate(p.statementDate);setDateText(p.statementDate.split('-').reverse().join('/'));setChecked(true);setSaved('Extrato reaberto do banco. Conferência e posição preservadas; nenhuma nova gravação ou análise foi executada.');
  }catch(e){setError((e as Error).message);}finally{setLoading(false);}
 }
 async function open(file:File|undefined){
  setPreview(null);setError('');setSaved('');setChecked(false);setDate('');setDateText('');if(!file)return;setLoading(true);
  try{
   if(file.name.toLowerCase().endsWith('.xlsx')){
    if(file.size>B3_XLSX_LIMIT)throw Error('O limite para Excel é 2 MB.');
    const buffer=await file.arrayBuffer();checkXlsxArchive(buffer);
    const {default:readExcel}=await import('read-excel-file/browser');
    let sheets;try{sheets=await readExcel(buffer);}catch{throw Error('Não foi possível ler o Excel. Use o XLSX original da B3, sem senha.');}
    setPreview(previewB3Workbook(sheets));
   }else if(file.name.toLowerCase().endsWith('.csv')){
    if(file.size>B3_FILE_LIMIT)throw Error('O limite para CSV é 200 KB.');
    const text=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());setPreview(previewB3Positions(text));
   }else throw Error('Use o Excel original (.xlsx) ou CSV UTF-8. PDF e XLS não são aceitos.');
  }catch(e){setError(e instanceof TypeError?'Arquivo não reconhecido. Confira o formato e a codificação.':(e as Error).message);}finally{setLoading(false);}
 }
 const excel=preview&&'sheets' in preview?preview:null;
 const totalsDiffer=excel?.sheets.some(s=>s.matches===false)??false;
 const totalsReady=!!excel&&excel.sheets.every(s=>s.matches===true);
 async function save(){
  if(!savingEnabled||!excel||!checked||!dateValid||!totalsReady||saving||saved)return;
  setSaving(true);setError('');
  try{const r=await fetch('/api/investments/statement-imports',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({format:'b3-xlsx-v1',statementDate:date,reviewed:true,positions:excel.positions,totals:excel.sheets.map(s=>({sheet:s.sheet,declaredTotal:s.declaredTotal}))})});
   const data=await r.json();if(!r.ok||data.saved!==true)throw Error(data.error==='STATEMENT_SAVING_BLOCKED'?'A gravação continua bloqueada. Sua prévia foi preservada.':'Não foi possível salvar. Confira os totais e tente novamente; nenhuma análise será iniciada.');
   setHistory(old=>[data.record,...old.filter(x=>x.id!==data.record.id)]);
   setSaved(data.duplicate?'Este extrato já estava salvo. Nenhuma cópia adicional foi criada.':'Posição salva após sua conferência. Histórico de operações, preço médio e análises reais não foram alterados.');
  }catch(e){setError((e as Error).message);}finally{setSaving(false);}
 }
 const today=new Date();const maxDate=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
 const dateValid=/^\d{4}-\d{2}-\d{2}$/.test(date)&&date>='1900-01-01'&&date<=maxDate&&Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date;
 return <section className="space-y-5">
  <Link href="/investments/portfolio" className="underline">Voltar à carteira</Link>
  <h1 className="text-3xl font-bold">Conferir extrato de posição da B3</h1>
  <p>Selecione o Excel original da B3. A leitura acontece neste navegador: o arquivo original não é enviado ao servidor. Somente após sua conferência e um clique em Salvar, quando a gravação estiver liberada, as posições exibidas serão enviadas à sua área privada. Elas não serão encaminhadas aos agentes. Não há consulta à B3 nem consumo de tokens.</p>
  <p>Excel (.xlsx): até 2 MB, nas abas Acoes, Empréstimos, Renda Fixa e Tesouro Direto. CSV UTF-8: até 200 KB. Máximo de 2.000 posições. Contas, CPF e números de contrato não aparecem na prévia.</p>
  <label className="block">Selecionar extrato Excel ou CSV<input className="block mt-2" type="file" accept=".xlsx,.csv" disabled={loading||saving} onChange={e=>{void open(e.target.files?.[0]);e.target.value='';}}/></label>
  {history.length>0&&<section className="rounded border bg-white p-4 space-y-2"><h2 className="text-xl font-semibold">Extratos salvos na sua conta</h2><p><Link className="font-semibold text-teal-800 underline" href="/investments/portfolio/diagnosis">Ver diagnóstico da carteira · sem consumo de créditos →</Link></p>{history.map(h=><p key={h.id}><button disabled={loading||saving} className="underline" onClick={()=>{void reopen(h.id);}}>Reabrir extrato de {h.statement_date.slice(0,10).split('-').reverse().join('/')} · {h.position_count} posições</button></p>)}</section>}
  {loading&&<p role="status">Conferindo arquivo…</p>}{error&&<p role="alert" className="text-red-700">{error}</p>}
  {preview&&<>
   <div className="rounded border bg-white p-4"><p>{preview.positions.length} posições · Soma dos valores das linhas: {money(preview.total)}</p><p>Valores da data do extrato, sem consolidação automática. Posição não reconstrói compras, vendas, preço médio ou rentabilidade.</p></div>
   {excel&&<><h2 className="text-xl font-semibold">Conferência por aba</h2><div className="overflow-x-auto"><table className="w-full bg-white text-left"><thead><tr>{['Aba','Posições','Soma das linhas','Total no Excel','Conferência'].map(h=><th className="p-2 border" key={h}>{h}</th>)}</tr></thead><tbody>{excel.sheets.map(s=><tr key={s.sheet}><td className="p-2 border">{s.sheet}</td><td className="p-2 border">{s.count}</td><td className="p-2 border">{money(s.total)}</td><td className="p-2 border">{money(s.declaredTotal)}</td><td className="p-2 border">{s.matches===true?'Confere':s.matches===false?'Divergência':'Sem total comparável'}</td></tr>)}</tbody></table></div>{excel.warnings.map(w=><p className="rounded border border-amber-300 bg-amber-50 p-3" key={w}>{w}</p>)}</>}
   <label className="block">Data da posição no extrato<input className="block border p-2" type="text" inputMode="numeric" placeholder="dd/mm/aaaa" maxLength={10} value={dateText} disabled={saving||!!saved} onChange={e=>{const value=e.target.value;setDateText(value);const m=value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);setDate(m?`${m[3]}-${m[2]}-${m[1]}`:'');setChecked(false);}}/></label><p>Informe dia, mês e ano completo, no formato dd/mm/aaaa, conforme a data exibida pela B3 ao gerar a posição. A data do nome do arquivo é a do download e pode ser diferente.</p>
   <div className="overflow-x-auto"><table className="w-full text-left bg-white"><thead><tr>{['Aba / linha','Produto','Instituição','Natureza / base','Quantidade','Preço do extrato','Valor do extrato'].map(t=><th className="p-2 border" key={t}>{t}</th>)}</tr></thead><tbody>{preview.positions.map((p,i)=><tr key={i}><td className="p-2 border">{'sheet' in p?`${p.sheet} / ${p.row}`:`CSV / ${i+2}`}</td><td className="p-2 border">{p.product}</td><td className="p-2 border">{p.institution}</td><td className="p-2 border">{'nature' in p?[p.nature,p.valuation].filter(Boolean).join(' / '):'Valor declarado'}</td><td className="p-2 border">{p.quantity.toLocaleString('pt-BR',{maximumFractionDigits:8})}</td><td className="p-2 border">{money(p.price)}</td><td className="p-2 border">{money(p.value)}</td></tr>)}</tbody></table></div>
   <label className="block"><input type="checkbox" checked={checked} disabled={!dateValid||totalsDiffer||saving||!!saved} onChange={e=>setChecked(e.target.checked)}/> Conferi a data, as quantidades e os valores com o extrato original.</label>
   <button disabled={!savingEnabled||!checked||!dateValid||!totalsReady||saving||!!saved} onClick={()=>{void save();}} className="rounded bg-slate-200 p-3 disabled:opacity-60">{saving?'Salvando posição…':savingEnabled?'Salvar posição conferida':'Salvar posições — bloqueado durante a migração'}</button>
   <p role="status">{saved|| (checked?'Conferência local marcada. Nenhum dado foi salvo.':totalsDiffer?'Há divergência nos totais. Confira antes de prosseguir.':'Confira todas as posições antes de qualquer futura gravação.')} Salvar registra apenas esta posição e não autoriza análises reais.</p>
   <button disabled={saving} className="underline" onClick={()=>{setPreview(null);setDate('');setDateText('');setChecked(false);setSaved('');}}>Descartar prévia</button>
  </>}
 </section>;
}
