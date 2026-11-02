function obrigatoria(nome: string): string {
  const valor = process.env[nome];
  if (valor === undefined || valor.trim() === '') {
    // A mensagem cita só o NOME da variável, nunca o valor.
    throw new Error(`Variável de ambiente obrigatória ausente: ${nome}`);
  }
  return valor;
}

function numero(nome: string, padrao?: number): number {
  const texto = process.env[nome];
  if (texto === undefined || texto.trim() === '') {
    if (padrao !== undefined) return padrao;
    throw new Error(`Variável de ambiente obrigatória ausente: ${nome}`);
  }
  const valor = Number(texto);
  if (!Number.isInteger(valor) || valor <= 0) {
    throw new Error(`Variável de ambiente inválida (esperado número inteiro positivo): ${nome}`);
  }
  return valor;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: numero('PORT', 3000),
  db: {
    host: obrigatoria('DB_HOST'),
    port: numero('DB_PORT', 5432),
    name: obrigatoria('DB_NAME'),
    user: obrigatoria('DB_USER'),
    password: obrigatoria('DB_PASSWORD'),
  },
} as const;