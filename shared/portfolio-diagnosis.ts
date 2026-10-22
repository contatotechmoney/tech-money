import type {StatementPosition} from './b3-xlsx-preview';

/** Arithmetic on a reviewed snapshot only. Loan lines never enter the allocation denominator. */
export function portfolioDiagnosis(positions:StatementPosition[]){
 const supported=new Set(['Acoes','Renda Fixa','Tesouro Direto']);
 const eligible=positions.filter(p=>supported.has(p.sheet));
 const valued=eligible.filter(p=>p.value!==null&&Number.isFinite(p.value)&&p.value>=0);
 const total=valued.reduce((sum,p)=>sum+p.value!,0);
 const group=(key:(p:StatementPosition)=>string)=>{
  const values=new Map<string,number>();
  for(const p of valued){const label=key(p);values.set(label,(values.get(label)??0)+p.value!);}
  return Array.from(values).map(([label,value])=>({label,value,weight:total>0?value/total:null})).sort((a,b)=>b.value-a.value||a.label.localeCompare(b.label));
 };
 const products=group(p=>`${p.sheet} · ${p.product.trim()}`);
 return {total,eligibleCount:eligible.length,valuedCount:valued.length,missingValues:eligible.length-valued.length,
  loans:positions.filter(p=>p.sheet==='Empréstimos'),unsupportedCount:positions.filter(p=>!supported.has(p.sheet)&&p.sheet!=='Empréstimos').length,
  classes:group(p=>p.sheet==='Acoes'?'Ações':p.sheet),institutions:group(p=>p.institution.trim()),products,
  topThreeWeight:total>0?products.slice(0,3).reduce((sum,p)=>sum+p.value,0)/total:null};
}
