import type {B3Position} from './b3-position-preview';
export const B3_XLSX_LIMIT=2_000_000;
export type StatementPosition=B3Position&{sheet:string;row:number;nature:string;valuation:string};
export type SheetPreview={sheet:string;count:number;total:number|null;declaredTotal:number|null;matches:boolean|null};
export type ExcelPreview={positions:StatementPosition[];total:number|null;sheets:SheetPreview[];warnings:string[]};
type Sheet={sheet:string;data:unknown[][]};
const norm=(v:unknown)=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
// Bound decompression before handing the workbook to the local XLSX reader.
export function checkXlsxArchive(buffer:ArrayBuffer){
 if(buffer.byteLength>B3_XLSX_LIMIT)throw Error('O limite para Excel é 2 MB.');
 const v=new DataView(buffer);let end=-1;
 for(let i=buffer.byteLength-22;i>=Math.max(0,buffer.byteLength-65557);i--)if(v.getUint32(i,true)===0x06054b50){end=i;break;}
 if(end<0)throw Error('Arquivo XLSX inválido.');
 const count=v.getUint16(end+10,true),size=v.getUint32(end+12,true);let offset=v.getUint32(end+16,true),expanded=0;
 if(count>200||offset+size>end||v.getUint16(end+4,true)||v.getUint16(end+6,true))throw Error('Estrutura Excel não suportada.');
 for(let i=0;i<count;i++){
  if(offset+46>end||v.getUint32(offset,true)!==0x02014b50)throw Error('Arquivo XLSX inválido.');
  if(v.getUint16(offset+8,true)&1)throw Error('Arquivo protegido por senha não é aceito.');
  expanded+=v.getUint32(offset+24,true);if(expanded>8_000_000)throw Error('Conteúdo descompactado excede o limite.');
  const nameLength=v.getUint16(offset+28,true),extra=v.getUint16(offset+30,true),comment=v.getUint16(offset+32,true);
  const name=new TextDecoder().decode(new Uint8Array(buffer,offset+46,nameLength));
  if(/vbaproject|externallinks/i.test(name))throw Error('Use um XLSX sem macros ou vínculos externos.');
  offset+=46+nameLength+extra+comment;
 }
 if(offset!==v.getUint32(end+16,true)+size)throw Error('Arquivo XLSX inconsistente.');
}
function amount(v:unknown,required=false):number|null{
 if(v===null||v===undefined||v===''||v==='-'||v==='—'){if(required)throw Error('Quantidade ausente.');return null;}
 let n:number;
 if(typeof v==='number')n=v;
 else if(typeof v==='string'&&/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,8})?$/.test(v.trim()))n=Number(v.trim().replace(/\./g,'').replace(',','.'));
 else throw Error('Número inválido.');
 if(!Number.isFinite(n)||n<0||n>1e12)throw Error('Número fora do limite.');return n;
}
export function previewB3Workbook(sheets:Sheet[]):ExcelPreview{
 if(!sheets.length||sheets.length>8)throw Error('Quantidade de abas não suportada.');
 const positions:StatementPosition[]=[],summaries:SheetPreview[]=[],warnings:string[]=[],names=new Set<string>();
 for(const sheet of sheets){
  const type=norm(sheet.sheet);if(!['acoes','emprestimos','renda fixa','tesouro direto'].includes(type))throw Error('Aba não reconhecida. Este leitor aceita Acoes, Empréstimos, Renda Fixa e Tesouro Direto.');
  if(names.has(type))throw Error('Abas equivalentes repetidas.');names.add(type);
  if(sheet.data.length>2005)throw Error('Use até 2.000 posições por arquivo.');
  const headers=(sheet.data[0]??[]).map(norm);const nonempty=headers.filter(Boolean);
  if(new Set(nonempty).size!==nonempty.length)throw Error('Cabeçalhos repetidos.');
  const col=(name:string,required=false)=>{const i=headers.indexOf(norm(name));if(required&&i<0)throw Error(`Coluna ausente: ${name}.`);return i;};
  const p=col('Produto',true),inst=col('Instituição',true),q=col('Quantidade',true),nature=col('Natureza');
  let val=col('Valor Atualizado'),price=col('Preço de Fechamento'),valuation='Valor Atualizado';
  if(type==='renda fixa'){val=col('Valor Atualizado CURVA',true);price=col('Preço Atualizado CURVA');valuation='CURVA';warnings.push('Renda Fixa: exibimos CURVA. MTM e FECHAMENTO não são somados à mesma posição.');}
  if(val<0)throw Error('Coluna de valor atualizado ausente.');
  let inFooter=false,totalLabel=false,declared:number|null=null;const start=positions.length;
  for(let index=1;index<sheet.data.length;index++){
   const row=sheet.data[index];if(row.every(v=>v===null||v===undefined||v===''))continue;
   try{
    if(row.some(v=>norm(v)==='total')){
     if(norm(row[val])!=='total'||totalLabel)throw Error('Total da aba não reconhecido.');
     totalLabel=true;inFooter=true;continue;
    }
    if(inFooter){if(declared!==null||row[p]||row[inst]||row[q])throw Error('Linha inesperada após o total.');declared=amount(row[val],true);continue;}
    const product=String(row[p]??'').trim(),institution=String(row[inst]??'').trim();
    if(!product||!institution||product.length>250||institution.length>250)throw Error('Produto ou instituição inválidos.');
    const n=nature<0?'':String(row[nature]??'').trim();
    if(type==='emprestimos'&&!['doador','tomador'].includes(norm(n)))throw Error('Natureza do empréstimo não reconhecida.');
    positions.push({sheet:sheet.sheet,row:index+1,product,institution,quantity:amount(row[q],true)!,price:price<0?null:amount(row[price]),value:amount(row[val]),nature:n,valuation});
   }catch(e){throw Error(`Aba ${sheet.sheet}, linha ${index+1}: ${(e as Error).message}`);}
  }
  const subset=positions.slice(start),total=subset.every(p=>p.value!==null)?subset.reduce((sum,p)=>sum+p.value!,0):null;
  const matches=total!==null&&declared!==null?Math.abs(total-declared)<=0.011:null;
  if(matches===false)warnings.push(`Aba ${sheet.sheet}: soma das linhas diverge do total declarado. Confira o arquivo original.`);
  summaries.push({sheet:sheet.sheet,count:subset.length,total,declaredTotal:declared,matches});
 }
 if(!positions.length||positions.length>2000)throw Error('O arquivo deve conter entre 1 e 2.000 posições.');
 if(positions.some(p=>p.nature))warnings.push('Empréstimos são apresentados separadamente, com sua natureza. Linhas do mesmo ativo não são consolidadas; esta soma não calcula patrimônio líquido nem risco.');
 return {positions,total:positions.every(p=>p.value!==null)?positions.reduce((s,p)=>s+p.value!,0):null,sheets:summaries,warnings};
}
