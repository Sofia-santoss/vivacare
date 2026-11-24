export function validateSurveysTestDbEnvironment(
  env: Record<string, string | undefined>,
): { valid: boolean; errors: string[] };

export function assertSurveysTestDbEnvironment(env: Record<string, string | undefined>): void;
