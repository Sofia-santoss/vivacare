import {describe,expect,it} from 'vitest';
import {validarAtualizacao,validarCriacao,validarProfissionais} from './validacao.js';
describe('validação de escalas',()=>{
 it('valida criação e edição com data civil',()=>{expect(validarCriacao({setorId:'1',equipeId:'2',turnoId:'3',data:'2026-11-12'}).equipeId).toBe('2');expect(validarAtualizacao({data:'2026-11-13'}).data).toBe('2026-11-13');});
 it('rejeita datas inválidas',()=>expect(()=>validarCriacao({setorId:'1',equipeId:'2',turnoId:'3',data:'2026-02-30'})).toThrow());
 it('rejeita profissionais repetidos e id malformado',()=>{expect(()=>validarProfissionais({profissionais:[{usuarioId:'1'},{usuarioId:'1'}]})).toThrow(/duplicado/i);expect(()=>validarProfissionais({profissionais:[{usuarioId:'0'}]})).toThrow();});
});
