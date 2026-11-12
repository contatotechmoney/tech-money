import {test} from 'node:test';
import assert from 'node:assert/strict';
import {previewB3Positions} from './b3-position-preview';
test('Brazilian positions retain statement values without inventing cost basis',()=>{
 const r=previewB3Positions('\uFEFFProduto;Instituição;Quantidade;Preço Atualizado;Valor Atualizado\r\n"Ativo; fictício";Banco exemplo;1.234,5;10,00;12.345,00');
 assert.equal(r.positions[0].quantity,1234.5);assert.equal(r.total,12345);assert.equal(r.positions[0].product,'Ativo; fictício');assert.equal('averagePrice' in r.positions[0],false);
});
test('missing valuations stay unknown, not zero or quantity times price',()=>{
 assert.equal(previewB3Positions('Produto;Instituição;Quantidade;Preço Atualizado\nExemplo;Banco;2;3,00').total,null);
});
test('rejects malformed, ambiguous, repeated and oversized input',()=>{
 for(const s of ['Produto;Instituição;Quantidade\nA;B;1\nA;B;2','Produto;Instituição;Quantidade\nA;B;-1','Produto;Instituição;Quantidade\nA;B;1.2','Produto;Instituição;Quantidade\nA;B;1;2','Produto;Instituição;Quantidade\n"A;B;1','Produto;Produto;Quantidade\nA;B;1','Produto;Instituição;Quantidade\n=CMD();B;1'])assert.throws(()=>previewB3Positions(s));
 assert.throws(()=>previewB3Positions('x'.repeat(200001)));
});
