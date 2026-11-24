import { loginAttemptKey } from '../auth/loginAttempts.js';
import type { IpRateLimitConfig } from '../auth/ipRateLimit.js';
import type { Pool } from 'pg';
import type { RequestHandler } from 'express';

export async function reservePublicSubmissionRequest(pool:Pool,keyHash:string,config:Exclude<IpRateLimitConfig,null>):Promise<boolean>{
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`public-survey:${keyHash}`]);
    const state=await client.query<{count:number;active_window:boolean}>(
      `SELECT solicitacoes AS count,
              janela_iniciada_em > statement_timestamp() - ($2 * INTERVAL '1 second') AS active_window
         FROM public.submissoes_publicas_limites_ip WHERE chave_hash=$1`,[keyHash,config.windowSeconds]);
    const current=state.rows[0];
    if(current?.active_window&&current.count>=config.maxRequests){await client.query('COMMIT');return false;}
    await client.query(`INSERT INTO public.submissoes_publicas_limites_ip AS atual
      (chave_hash,solicitacoes,janela_iniciada_em,atualizado_em)
      VALUES($1,1,statement_timestamp(),statement_timestamp())
      ON CONFLICT(chave_hash) DO UPDATE SET
        solicitacoes=CASE WHEN atual.janela_iniciada_em > statement_timestamp()-($2*INTERVAL '1 second') THEN atual.solicitacoes+1 ELSE 1 END,
        janela_iniciada_em=CASE WHEN atual.janela_iniciada_em > statement_timestamp()-($2*INTERVAL '1 second') THEN atual.janela_iniciada_em ELSE statement_timestamp() END,
        atualizado_em=statement_timestamp()`,[keyHash,config.windowSeconds]);
    await client.query('COMMIT');return true;
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}

export function createPublicSubmissionRateLimit(pool:Pool,config:IpRateLimitConfig,secret:Buffer,reserve=reservePublicSubmissionRequest):RequestHandler{
  return async(req,res,next)=>{
    if(req.method!=='POST'||!config)return next();
    if(!req.ip)return res.status(503).json({error:'Submissão temporariamente indisponível.',code:'RATE_LIMIT_UNAVAILABLE'});
    // The key is IP-scoped and domain-separated; it is independent of the public survey code and login counter.
    const keyHash=loginAttemptKey(`public-survey-ip:${req.ip}`,secret);
    try{
      if(!await reserve(pool,keyHash,config))return res.status(429).json({error:'Limite de submissões atingido. Tente novamente mais tarde.',code:'RATE_LIMITED'});
      return next();
    }catch{return res.status(503).json({error:'Submissão temporariamente indisponível.',code:'RATE_LIMIT_UNAVAILABLE'});}
  };
}
