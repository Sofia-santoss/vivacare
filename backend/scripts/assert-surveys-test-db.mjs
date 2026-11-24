import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_VARIABLES = [
  'VIVACARE_SURVEYS_TEST_DB_HOST',
  'VIVACARE_SURVEYS_TEST_DB_PORT',
  'VIVACARE_SURVEYS_TEST_DB_NAME',
  'VIVACARE_SURVEYS_TEST_DB_USER',
  'VIVACARE_SURVEYS_TEST_DB_PASSWORD',
  'VIVACARE_SURVEYS_TEST_DB_APP_USER',
  'VIVACARE_SURVEYS_TEST_DB_APP_PASSWORD',
  'VIVACARE_SURVEYS_TEST_DB_MAINT_USER',
  'VIVACARE_SURVEYS_TEST_DB_MAINT_PASSWORD',
  'VIVACARE_SURVEYS_TEST_DB_DISPOSABLE',
];

// These names are read only as collision sentinels. They are never used to
// configure this harness; the target always comes from VIVACARE_SURVEYS_TEST_DB_*.
const OTHER_HARNESS_DATABASE_VARIABLES = [
  'VIVACARE_TEST_DB_NAME',
  'VIVACARE_AUTH_TEST_DB_NAME',
  'VIVACARE_SETORES_TEST_DB_NAME',
  'VIVACARE_USERS_TEST_DB_NAME',
];

// Numeric loopback literals avoid DNS/hosts-file aliases resolving outside the machine.
const LOOPBACK_HOSTS = new Set(['127.0.0.1']);
const ENVIRONMENT_NAME_TOKEN = /(?:^|_)(?:prod(?:uction)?|producao|stage|staging|homolog(?:acao)?|hml|dev(?:elopment)?|desenvolvimento)(?:_|$)/i;

export function validateSurveysTestDbEnvironment(env) {
  const errors = [];
  const missing = REQUIRED_VARIABLES.filter((name) => typeof env[name] !== 'string' || env[name].trim() === '');
  for (const name of missing) errors.push(`variável obrigatória ausente: ${name}`);

  if (env.NODE_ENV !== 'test') errors.push('NODE_ENV deve ser exatamente test');

  const host = typeof env.VIVACARE_SURVEYS_TEST_DB_HOST === 'string'
    ? env.VIVACARE_SURVEYS_TEST_DB_HOST.trim().toLowerCase()
    : '';
  if (host && !LOOPBACK_HOSTS.has(host)) {
    errors.push('host deve ser o literal 127.0.0.1 ou ::1; aliases e hosts externos, incluindo Aiven, são recusados');
  }

  const database = typeof env.VIVACARE_SURVEYS_TEST_DB_NAME === 'string'
    ? env.VIVACARE_SURVEYS_TEST_DB_NAME.trim()
    : '';
  if (database && database !== 'vivacare_surveys_test') {
    errors.push('o banco descartável permitido é exatamente vivacare_surveys_test');
  }
  if (database.length > 63) errors.push('nome do banco excede o limite de 63 caracteres do PostgreSQL');
  if (database && ENVIRONMENT_NAME_TOKEN.test(database)) {
    errors.push('nome do banco contém marcador de produção, homologação ou desenvolvimento');
  }

  const rawPort = typeof env.VIVACARE_SURVEYS_TEST_DB_PORT === 'string'
    ? env.VIVACARE_SURVEYS_TEST_DB_PORT.trim()
    : '';
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || !Number.isSafeInteger(port) || port < 1 || port > 65535) {
    errors.push('porta deve ser um inteiro entre 1 e 65535');
  }

  if (env.VIVACARE_SURVEYS_TEST_DB_DISPOSABLE !== 'YES') {
    errors.push('VIVACARE_SURVEYS_TEST_DB_DISPOSABLE deve ser exatamente YES');
  }

  const identities = [
    env.VIVACARE_SURVEYS_TEST_DB_USER,
    env.VIVACARE_SURVEYS_TEST_DB_APP_USER,
    env.VIVACARE_SURVEYS_TEST_DB_MAINT_USER,
  ].filter((value) => typeof value === 'string' && value.trim() !== '');
  if (identities.length === 3 && new Set(identities.map((value) => value.trim().toLowerCase())).size !== 3) {
    errors.push('usuários SETUP, APP e MAINT devem ser distintos');
  }
  if (identities.some((value) => [
    'vivacare_app',
    'vivacare_surveys_test_app',
    'vivacare_auth_maintenance',
  ].includes(value.trim().toLowerCase()))) {
    errors.push('SETUP, APP e MAINT devem ser usuários de login distintos das roles de grupo');
  }

  if (database) {
    const normalizedDatabase = database.toLowerCase();
    const collisions = OTHER_HARNESS_DATABASE_VARIABLES.filter((name) => {
      const configuredName = env[name];
      return typeof configuredName === 'string'
        && configuredName.trim() !== ''
        && configuredName.trim().toLowerCase() === normalizedDatabase;
    });
    if (collisions.length) {
      errors.push(`nome do banco coincide com outro harness (${collisions.join(', ')})`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function assertSurveysTestDbEnvironment(env) {
  const result = validateSurveysTestDbEnvironment(env);
  if (!result.valid) {
    throw new Error(`Harness PostgreSQL de pesquisas bloqueado:\n${result.errors.map((error) => `- ${error}`).join('\n')}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = validateSurveysTestDbEnvironment(process.env);
  if (!result.valid) {
    console.error('Harness PostgreSQL de pesquisas bloqueado:');
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log('Configuração do harness de pesquisas validada. Nenhuma conexão com banco foi aberta.');
  }
}
