import { describe, expect, it } from 'vitest';
import { PERMISSIONS, profileMayUsePermission } from './permissions.js';

describe('matriz de teto dos perfis oficiais', () => {
  it('permite ao SUPER_ADMIN usar as permissões administrativas conhecidas', () => {
    expect(profileMayUsePermission('SUPER_ADMIN', PERMISSIONS.usersCreate)).toBe(true);
    expect(profileMayUsePermission('SUPER_ADMIN', PERMISSIONS.permissionsManage)).toBe(true);
    expect(profileMayUsePermission('SUPER_ADMIN', PERMISSIONS.sectorsHospitalScope)).toBe(true);
  });

  it('limita ADMIN_SETOR a recursos associados e nega escopo hospitalar/administração de usuários', () => {
    expect(profileMayUsePermission('ADMIN_SETOR', PERMISSIONS.sectorsUpdate)).toBe(true);
    expect(profileMayUsePermission('ADMIN_SETOR', PERMISSIONS.teamsManageAssigned)).toBe(true);
    expect(profileMayUsePermission('ADMIN_SETOR', PERMISSIONS.schedulesManageAssigned)).toBe(true);
    expect(profileMayUsePermission('ADMIN_SETOR', PERMISSIONS.questionsUpdateAssigned)).toBe(true);
    expect(profileMayUsePermission('ADMIN_SETOR', PERMISSIONS.indicatorsReadAssigned)).toBe(true);
    expect(profileMayUsePermission('ADMIN_SETOR', PERMISSIONS.sectorsHospitalScope)).toBe(false);
    expect(profileMayUsePermission('ADMIN_SETOR', PERMISSIONS.usersCreate)).toBe(false);
    expect(profileMayUsePermission('ADMIN_SETOR', PERMISSIONS.shiftsUpdateHospital)).toBe(false);
    expect(profileMayUsePermission('ADMIN_SETOR', PERMISSIONS.indicatorsReadHospital)).toBe(false);
  });

  it('limita GESTAO a indicadores e nega qualquer operação administrativa', () => {
    expect(profileMayUsePermission('GESTAO', PERMISSIONS.indicatorsReadHospital)).toBe(true);
    expect(profileMayUsePermission('GESTAO', PERMISSIONS.usersUpdate)).toBe(false);
    expect(profileMayUsePermission('GESTAO', PERMISSIONS.sectorsCreate)).toBe(false);
    expect(profileMayUsePermission('GESTAO', PERMISSIONS.questionsCreateHospital)).toBe(false);
  });

  it('limita OUVIDORIA às manifestações e auditoria própria', () => {
    expect(profileMayUsePermission('OUVIDORIA', PERMISSIONS.manifestationsRead)).toBe(true);
    expect(profileMayUsePermission('OUVIDORIA', PERMISSIONS.manifestationsComplete)).toBe(true);
    expect(profileMayUsePermission('OUVIDORIA', PERMISSIONS.auditReadManifestations)).toBe(true);
    expect(profileMayUsePermission('OUVIDORIA', PERMISSIONS.auditReadHospital)).toBe(false);
    expect(profileMayUsePermission('OUVIDORIA', PERMISSIONS.indicatorsReadHospital)).toBe(false);
    expect(profileMayUsePermission('OUVIDORIA', PERMISSIONS.usersCreate)).toBe(false);
  });

  it('mantém VISUALIZADOR somente em leitura de indicadores e nega perfis desconhecidos', () => {
    expect(profileMayUsePermission('VISUALIZADOR', PERMISSIONS.indicatorsReadHospital)).toBe(true);
    expect(profileMayUsePermission('VISUALIZADOR', PERMISSIONS.indicatorsReadAssigned)).toBe(false);
    expect(profileMayUsePermission('VISUALIZADOR', PERMISSIONS.manifestationsRead)).toBe(false);
    expect(profileMayUsePermission('VISUALIZADOR', PERMISSIONS.usersCreate)).toBe(false);
    expect(profileMayUsePermission('GESTOR_SETOR', PERMISSIONS.sectorsUpdate)).toBe(false);
    expect(profileMayUsePermission('ADMIN_HOSPITAL', PERMISSIONS.usersCreate)).toBe(false);
    expect(profileMayUsePermission('OUTRO', PERMISSIONS.indicatorsReadHospital)).toBe(false);
    expect(profileMayUsePermission('SUPER_ADMIN', 'permission.nao.cadastrada')).toBe(false);
  });
});
