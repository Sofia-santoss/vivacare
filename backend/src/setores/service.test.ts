import { describe, expect, it, vi } from 'vitest';
import type { RepositorioSetores } from './repository.js';
import { SetoresService } from './service.js';
import type { Setor } from './types.js';

const setor: Setor = { id: '7', hospitalId: '2', nome: 'UTI', descricao: null, ativo: true, criadoEm: new Date('2026-01-01T00:00:00.000Z') };
function makeRepository(overrides: Partial<RepositorioSetores> = {}) {
  return {
    listar: vi.fn(async () => ({ data: [setor], page: 1, pageSize: 25, total: 1 })),
    buscarNoEscopo: vi.fn(async () => setor),
    criarNoHospital: vi.fn(async () => setor),
    atualizarNoEscopo: vi.fn(async () => setor),
    alterarStatusNoEscopo: vi.fn(async () => ({ ...setor, ativo: false })),
    ...overrides,
  } as unknown as RepositorioSetores;
}

describe('SetoresService', () => {
  it('preserva o escopo atribuído e descarta IDs de setor inválidos', async () => {
    const repository = makeRepository();
    const service = new SetoresService(repository);
    await service.listar('2', ['7', '8', 'invalid'], {}, { page: 1, pageSize: 25 });
    await service.buscar('7', '2', ['7', '8']);
    expect(repository.listar).toHaveBeenCalledWith('2', ['7', '8'], {}, { page: 1, pageSize: 25 });
    expect(repository.buscarNoEscopo).toHaveBeenCalledWith('7', '2', ['7', '8']);
  });

  it('preserva o escopo hospitalar explícito dos perfis com essa permissão', async () => {
    const repository = makeRepository();
    const service = new SetoresService(repository);
    await service.listar('2', null, {}, { page: 1, pageSize: 25 });
    await service.buscar('99', '2', null);
    expect(repository.listar).toHaveBeenCalledWith('2', null, {}, { page: 1, pageSize: 25 });
    expect(repository.buscarNoEscopo).toHaveBeenCalledWith('99', '2', null);
  });

  it('não retorna setor fora do escopo atribuído', async () => {
    const repository = makeRepository({ buscarNoEscopo: vi.fn(async () => null) });
    await expect(new SetoresService(repository).buscar('88', '2', ['7']))
      .rejects.toMatchObject({ status: 404, code: 'SECTOR_NOT_FOUND' });
  });

  it('converte duplicidade da constraint de hospital e nome', async () => {
    const input = { nome: 'UTI', descricao: null };
    const repository = makeRepository({ criarNoHospital: vi.fn(async () => {
      throw Object.assign(new Error('duplicate key'), { code: '23505', constraint: 'uq_setor_hospital_nome' });
    }) });
    await expect(new SetoresService(repository).criar(input, '2', '12'))
      .rejects.toMatchObject({ status: 409, code: 'DUPLICATE_SECTOR' });
    expect(repository.criarNoHospital).toHaveBeenCalledWith('2', '12', input);
  });

  it('altera status sem expor operação de exclusão física', async () => {
    const repository = makeRepository();
    await expect(new SetoresService(repository).alterarStatus('7', false, '2', '12', ['7']))
      .resolves.toMatchObject({ ativo: false });
    expect(repository.alterarStatusNoEscopo).toHaveBeenCalledWith('7', '2', '12', false, ['7']);
    expect(repository).not.toHaveProperty('excluir');
  });
});
