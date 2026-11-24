const required = [
  'VIVACARE_AUTH_TEST_DB_HOST',
  'VIVACARE_AUTH_TEST_DB_NAME',
  'VIVACARE_AUTH_TEST_DB_SETUP_USER',
  'VIVACARE_AUTH_TEST_DB_SETUP_PASSWORD',
  'VIVACARE_AUTH_TEST_DB_APP_USER',
  'VIVACARE_AUTH_TEST_DB_APP_PASSWORD',
  'VIVACARE_AUTH_TEST_DB_MAINT_USER',
  'VIVACARE_AUTH_TEST_DB_MAINT_PASSWORD',
  'VIVACARE_AUTH_TEST_DB_DISPOSABLE',
];
const missing = required.filter((name) => !process.env[name]);
const host = process.env.VIVACARE_AUTH_TEST_DB_HOST;
const database = process.env.VIVACARE_AUTH_TEST_DB_NAME;
const identities = [
  process.env.VIVACARE_AUTH_TEST_DB_SETUP_USER,
  process.env.VIVACARE_AUTH_TEST_DB_APP_USER,
  process.env.VIVACARE_AUTH_TEST_DB_MAINT_USER,
];
const invalid = [];
if (process.env.NODE_ENV !== 'test') invalid.push('NODE_ENV=test');
if (host && !['localhost', '127.0.0.1', '::1'].includes(host)) invalid.push('host loopback');
if (database && !/_auth_test$/i.test(database)) invalid.push('nome de banco terminado em _auth_test');
if (process.env.VIVACARE_AUTH_TEST_DB_DISPOSABLE && process.env.VIVACARE_AUTH_TEST_DB_DISPOSABLE !== 'YES') invalid.push('VIVACARE_AUTH_TEST_DB_DISPOSABLE=YES');
if (identities.every(Boolean) && new Set(identities).size !== identities.length) invalid.push('identidades SETUP, APP e MAINT distintas');
const rawPort = process.env.VIVACARE_AUTH_TEST_DB_PORT;
if (rawPort && (!/^\d+$/.test(rawPort) || Number(rawPort) < 1 || Number(rawPort) > 65535)) invalid.push('porta PostgreSQL válida');
if (missing.length || invalid.length) {
  console.error('Integração de autenticação não iniciada. Requisitos ausentes/inválidos:');
  for (const name of missing) console.error(`- variável obrigatória: ${name}`);
  for (const item of invalid) console.error(`- ${item}`);
  process.exitCode = 1;
}
