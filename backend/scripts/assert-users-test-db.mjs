const required = [
  'VIVACARE_USERS_TEST_DB_HOST', 'VIVACARE_USERS_TEST_DB_NAME',
  'VIVACARE_USERS_TEST_DB_USER', 'VIVACARE_USERS_TEST_DB_PASSWORD',
  'VIVACARE_USERS_TEST_DB_DISPOSABLE',
];
const missing = required.filter((name) => !process.env[name]);
const host = process.env.VIVACARE_USERS_TEST_DB_HOST;
const database = process.env.VIVACARE_USERS_TEST_DB_NAME;
const invalid = [];
if (process.env.NODE_ENV !== 'test') invalid.push('NODE_ENV=test');
if (host && !['localhost', '127.0.0.1', '::1'].includes(host)) invalid.push('host loopback');
if (database && !/_users_test$/i.test(database)) invalid.push('nome terminado em _users_test');
if (process.env.VIVACARE_USERS_TEST_DB_DISPOSABLE !== 'YES') invalid.push('VIVACARE_USERS_TEST_DB_DISPOSABLE=YES');
const port = process.env.VIVACARE_USERS_TEST_DB_PORT;
if (port && (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)) invalid.push('porta PostgreSQL válida');
if (missing.length || invalid.length) {
  console.error('Integração de usuários bloqueada; requisitos ausentes/inválidos:');
  for (const name of missing) console.error(`- variável obrigatória: ${name}`);
  for (const item of invalid) console.error(`- ${item}`);
  process.exitCode = 1;
}
