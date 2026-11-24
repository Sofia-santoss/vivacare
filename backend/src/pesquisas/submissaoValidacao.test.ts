import {describe,expect,it} from 'vitest';
import {validarChaveIdempotencia,validarCodigoPublico,validarSubmissao} from './submissaoValidacao.js';
describe('validação da submissão pública',()=>{
 it('aceita código público, chave e respostas tipadas',()=>{
  expect(validarCodigoPublico('2fd921e4-8258-4ce0-a8d0-685d3915dc6c')).toBe('2fd921e4-8258-4ce0-a8d0-685d3915dc6c');
  expect(validarChaveIdempotencia('4a000001-0000-4000-8000-000000000000')).toBe('4a000001-0000-4000-8000-000000000000');
  expect(validarSubmissao({notaNps:9,respostas:[{perguntaId:'12',valor:'bom'},{perguntaId:'13',valor:false}]}).respostas).toHaveLength(2);
  expect(validarSubmissao({nps:10,answers:[{questionId:'12',value:5}]})).toEqual({notaNps:10,respostas:[{perguntaId:'12',valor:5}]});
 });
 it('rejeita tentativa de transmitir identidade ou contato',()=>{
  expect(()=>validarSubmissao({notaNps:9,respostas:[],telefone:'11999999999'})).toThrow(/anônimas/i);
  expect(()=>validarSubmissao({notaNps:9,respostas:[{perguntaId:'1',valor:'x',email:'x@example.test'}]})).toThrow();
 });
 it('exige chave de idempotência e nota NPS válida',()=>{
  expect(()=>validarChaveIdempotencia(undefined)).toThrow();
  expect(()=>validarChaveIdempotencia('guessable-request-key')).toThrow();
  expect(()=>validarSubmissao({notaNps:11,respostas:[]})).toThrow();
 });
});
