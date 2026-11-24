export type NodeEnv = 'development' | 'test' | 'production';

export function parseNodeEnv(value: string | undefined): NodeEnv {
  if (value === 'development' || value === 'test' || value === 'production') return value;
  throw new Error('NODE_ENV deve ser definido como development, test ou production.');
}

export function assertProductionIpLimit(nodeEnv: NodeEnv, hasIpLimit: boolean): void {
  if (nodeEnv === 'production' && !hasIpLimit) {
    throw new Error('Configure AUTH_LOGIN_IP_LIMIT e AUTH_LOGIN_IP_WINDOW_SECONDS antes de iniciar em produção.');
  }
}

export function assertProductionSubmissionIpLimit(nodeEnv:NodeEnv,hasIpLimit:boolean):void{
  if(nodeEnv==='production'&&!hasIpLimit)throw new Error('Configure PUBLIC_SURVEY_IP_LIMIT e PUBLIC_SURVEY_IP_WINDOW_SECONDS antes de iniciar em produção.');
}
