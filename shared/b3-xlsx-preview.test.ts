import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkXlsxArchive,previewB3Workbook} from './b3-xlsx-preview';
const stock={sheet:'Acoes',data:[['Produto','Instituição','Conta','Quantidade','Preço de Fechamento','Valor Atualizado'],['Ativo fictício','Instituição teste','PRIVATE',2,10,20],[],[null,null,null,null,null,'Total'],[null,null,null,null,null,20]]};
test('typed numbers and declared totals, without copying account identifiers',()=>{
 const p=previewB3Workbook([stock]);assert.equal(p.total,20);assert.equal(p.sheets[0].matches,true);assert.equal(p.positions[0].row,2);assert.equal(JSON.stringify(p).includes('PRIVATE'),false);
});
test('loans remain separate rows and preserve lending nature',()=>{
 const p=previewB3Workbook([{sheet:'Empréstimos',data:[['Produto','Instituição','Natureza','Quantidade','Valor Atualizado'],['Ativo','Banco','Doador',2,20],['Ativo','Banco','Doador',3,30]]}]);
 assert.equal(p.positions.length,2);assert.equal(p.total,50);assert.equal(p.positions[1].nature,'Doador');assert.ok(p.warnings.length);
});
test('fixed income uses CURVA once, missing values stay unknown',()=>{
 const p=previewB3Workbook([{sheet:'Renda Fixa',data:[['Produto','Instituição','Quantidade','Valor Atualizado CURVA','Valor Atualizado MTM','Valor Atualizado FECHAMENTO'],['Título','Banco',1,100,110,100]]}]);
 assert.equal(p.total,100);assert.equal(p.positions[0].price,null);assert.equal(p.positions[0].valuation,'CURVA');
});
test('mismatched footer remains visible; unsupported layouts and malformed files reject',()=>{
 const bad=structuredClone(stock);bad.data[4][5]=99;assert.equal(previewB3Workbook([bad]).sheets[0].matches,false);
 assert.throws(()=>previewB3Workbook([{sheet:'Movimentações',data:stock.data}]));
 assert.throws(()=>previewB3Workbook([{sheet:'Acoes',data:[['Produto','Instituição','Quantidade','Valor Atualizado'],['Ativo','Banco',-2,20]]}]));
 assert.throws(()=>checkXlsxArchive(new ArrayBuffer(10)));
 assert.throws(()=>checkXlsxArchive(new ArrayBuffer(2000001)));
});
