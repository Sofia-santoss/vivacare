const required = [
  'VIVACARE_SETORES_TEST_DB_HOST',
  'VIVACARE_SETORES_TEST_DB_NAME',
  'VIVACARE_SETORES_TEST_DB_USER',
  'VIVACARE_SETORES_TEST_DB_PASSWORD',
  'VIVACARE_SETORES_TEST_DB_DISPOSABLE',
];
const missing = required.filter((name) => !process.env[name]);
const host = process.env.VIVACARE_SETORES_TEST_DB_HOST;
const database = process.env.VIVACARE_SETORES_TEST_DB_NAME;
const invalid = [];
if (process.env.NODE_ENV !== 'test') invalid.push('NODE_ENV=test');
if (host && !['localhost', '127.0.0.1', '::1'].includes(host)) invalid.push('host loopback');
if (database && !/_setores_test$/i.test(database)) invalid.push('nome de banco terminado em _setores_test');
if (process.env.VIVACARE_SETORES_TEST_DB_DISPOSABLE && process.env.VIVACARE_SETORES_TEST_DB_DISPOSABLE !== 'YES') invalid.push('VIVACARE_SETORES_TEST_DB_DISPOSABLE=YES');
const rawPort = process.env.VIVACARE_SETORES_TEST_DB_PORT;
if (rawPort && (!/^\d+$/.test(rawPort) || Number(rawPort) < 1 || Number(rawPort) > 65535)) invalid.push('porta PostgreSQL válida');
if (missing.length || invalid.length) {
  console.error('Integração de setores não iniciada. Requisitos ausentes/inválidos:');
  for (const name of missing) console.error(`- variável obrigatória: ${name}`);
  for (const item of invalid) console.error(`- ${item}`);
  process.exitCode = 1;
}
