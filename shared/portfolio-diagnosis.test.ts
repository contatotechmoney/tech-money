import {test} from 'node:test';
import assert from 'node:assert/strict';
import {portfolioDiagnosis} from './portfolio-diagnosis';
import type {StatementPosition} from './b3-xlsx-preview';
const p=(sheet:string,product:string,value:number|null,institution='Corretora'):StatementPosition=>({sheet,product,value,institution,row:2,quantity:1,price:value,nature:sheet==='Empréstimos'?'Doador':'',valuation:sheet==='Renda Fixa'?'CURVA':'Valor Atualizado'});
test('excludes loans from allocation even when the same product appears twice',()=>{
 const d=portfolioDiagnosis([p('Acoes','ABC',100),p('Empréstimos','ABC',200),p('Tesouro Direto','Tesouro',50),p('Renda Fixa','CDB',50)]);
 assert.equal(d.total,200);assert.equal(d.loans.length,1);assert.equal(d.products[0].weight,.5);assert.equal(d.topThreeWeight,1);
});
test('groups matching descriptions across institutions without treating an institution as issuer',()=>{
 const d=portfolioDiagnosis([p('Acoes','ABC',60,'A'),p('Acoes','ABC',40,'B'),p('Tesouro Direto','Tesouro',100,'B')]);
 assert.equal(d.products.length,2);assert.equal(d.products.find(p=>p.label==='Acoes · ABC')?.weight,.5);assert.equal(d.institutions.find(p=>p.label==='B')?.value,140);
});
test('reports missing, unsupported and zero denominators instead of NaN percentages',()=>{
 const d=portfolioDiagnosis([p('Acoes','ABC',null),p('Renda Fixa','CDB',0),p('Desconhecida','X',500)]);
 assert.equal(d.total,0);assert.equal(d.missingValues,1);assert.equal(d.unsupportedCount,1);assert.equal(d.topThreeWeight,null);assert.equal(d.products[0].weight,null);
});
test('top-three concentration is based on grouped products, not the count of rows',()=>{
 const d=portfolioDiagnosis([p('Acoes','A',25),p('Acoes','B',25),p('Acoes','C',25),p('Acoes','D',25)]);
 assert.equal(d.topThreeWeight,.75);assert.equal(d.classes[0].weight,1);
});
