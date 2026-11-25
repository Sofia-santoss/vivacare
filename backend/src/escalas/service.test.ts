import {describe,expect,it,vi} from 'vitest';
import {EscalasService} from './service.js';
import type {RepositorioEscalas} from './repository.js';
const escala={id:'1',setorId:'2',setorNome:'UTI',equipeId:'3',equipeNome:'A',turnoId:'4',turnoNome:'Noite',horaInicio:'22:00:00',horaFim:'06:00:00',data:'2026-11-12',observacoes:null,status:'PLANEJADA' as const,criadoEm:new Date(),atualizadoEm:new Date()};
function repo():RepositorioEscalas{return {listar:vi.fn().mockResolvedValue({data:[escala],total:1}),buscar:vi.fn().mockResolvedValue(escala),membros:vi.fn().mockResolvedValue([]),criar:vi.fn().mockResolvedValue(escala),atualizar:vi.fn().mockResolvedValue(escala),cancelar:vi.fn().mockResolvedValue({...escala,status:'CANCELADA'}),adicionar:vi.fn().mockResolvedValue(true),remover:vi.fn().mockResolvedValue(false)};}
describe('EscalasService',()=>{
 it('cria e edita escala',async()=>{const r=repo(),s=new EscalasService(r);await expect(s.criar('10','7',{setorId:'2',equipeId:'3',turnoId:'4',data:'2026-11-12'})).resolves.toEqual(escala);await expect(s.atualizar('10','7','1',{data:'2026-11-13'})).resolves.toEqual(escala);expect(r.criar).toHaveBeenCalledWith('10','7',expect.objectContaining({equipeId:'3'}),undefined);});
 it('cancela sem remover a escala',async()=>{const r=repo(),s=new EscalasService(r);await expect(s.cancelar('10','7','1')).resolves.toMatchObject({status:'CANCELADA'});expect(r.cancelar).toHaveBeenCalledWith('10','7','1',undefined);});
 it('inclui profissionais e delega remoção lógica',async()=>{const r=repo(),s=new EscalasService(r);await expect(s.adicionar('10','7','1',[{usuarioId:'8',funcao:null}])).resolves.toEqual([]);await expect(s.remover('10','7','1','8')).rejects.toMatchObject({code:'SCHEDULE_MEMBER_NOT_FOUND'});expect(r.remover).toHaveBeenCalledWith('10','7','1','8',undefined);});
 it('expõe somente ausência de escala no escopo do hospital',async()=>{const r=repo();vi.mocked(r.buscar).mockResolvedValue(null);await expect(new EscalasService(r).buscar('10','999')).rejects.toMatchObject({status:404});});
});
