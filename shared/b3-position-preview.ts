// Position snapshots are not trade history, cost basis, or investment advice.
export type B3Position = { product:string; institution:string; quantity:number; price:number|null; value:number|null };
export const B3_FILE_LIMIT=200_000;
const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
function rows(text:string):string[][] {
 const first=text.split(/\r?\n/,1)[0];
 const delimiter=first.includes(';')?';':',';
 const out:string[][]=[];let row:string[]=[],cell='',quoted=false,closed=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}
  if(c==='"'){if(cell||closed)throw Error('CSV com aspas inválidas.');quoted=true;continue;}
  if(c===delimiter||c==='\n'||c==='\r'){
   row.push(cell.trim());cell='';closed=false;
   if(c!==delimiter){if(row.some(Boolean))out.push(row);row=[];if(c==='\r'&&text[i+1]==='\n')i++;}
   if(out.length>2001)throw Error('Use um arquivo com até 2.000 posições.');
  }else{if(closed&&c!==' ')throw Error('CSV com conteúdo após aspas.');cell+=c;}
 }
 if(quoted)throw Error('CSV com aspas não fechadas.');
 row.push(cell.trim());if(row.some(Boolean))out.push(row);return out;
}
function numberBR(raw:string,optional=false):number|null{
 const s=raw.trim().replace(/^R\$\s*/,'');
 if(optional&&['','-','—'].includes(s))return null;
 if(!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,8})?$/.test(s))throw Error('Número fora do padrão brasileiro.');
 const n=Number(s.replace(/\./g,'').replace(',','.'));
 if(!Number.isFinite(n)||n<0||n>1e12)throw Error('Número fora do limite aceito.');return n;
}
export function previewB3Positions(input:string):{positions:B3Position[]; total:number|null}{
 if(new TextEncoder().encode(input).length>B3_FILE_LIMIT)throw Error('O limite é 200 KB.');
 const data=rows(input.replace(/^\uFEFF/,''));if(data.length<2)throw Error('Inclua o cabeçalho e pelo menos uma posição.');
 const header=data.shift()!.map(normalize);
 if(new Set(header).size!==header.length)throw Error('Há colunas repetidas.');
 const column=(names:string[],required=true)=>{const matches=header.map((h,i)=>names.includes(h)?i:-1).filter(i=>i>=0);if(matches.length>1)throw Error('Há colunas equivalentes; mantenha apenas uma por campo.');if(required&&!matches.length)throw Error('Colunas necessárias: Produto, Instituição e Quantidade.');return matches[0]??-1;};
 const p=column(['produto']),inst=column(['instituicao']),q=column(['quantidade']);
 const price=column(['preco atualizado','preco unitario'],false),value=column(['valor atualizado','valor total'],false);
 const seen=new Set<string>();
 const positions=data.map((r,index)=>{
  try{
   if(r.length!==header.length)throw Error('Quantidade de colunas diferente do cabeçalho.');
   const product=r[p],institution=r[inst];
   if(!product||!institution||product.length>250||institution.length>250)throw Error('Produto ou instituição ausente ou longo demais.');
   if(r.some(v=>/^[=+@]/.test(v)))throw Error('Conteúdo de fórmula não é aceito.');
   const key=normalize(product)+'\u0000'+normalize(institution);
   if(seen.has(key))throw Error('Produto e instituição repetidos; confira antes de consolidar.');seen.add(key);
   return {product,institution,quantity:numberBR(r[q])!,price:price<0?null:numberBR(r[price],true),value:value<0?null:numberBR(r[value],true)};
  }catch(e){throw Error(`Linha ${index+2}: ${(e as Error).message}`);}
 });
 if(positions.length>2000)throw Error('Use até 2.000 posições.');
 return {positions,total:positions.every(p=>p.value!==null)?positions.reduce((s,p)=>s+p.value!,0):null};
}
