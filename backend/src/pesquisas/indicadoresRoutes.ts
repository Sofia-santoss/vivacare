import express from 'express';
import type { Pool } from 'pg';
import { PERMISSIONS } from '../auth/permissions.js';
import { requirePermissionWithSectorScope } from '../auth/routes.js';

type IndicatorRow = {
  setor_id: string;
  setor: string;
  data_resposta: string;
  turno_id: string | null;
  turno: string | null;
  total_respostas: string;
  total_promotores: string;
  total_neutros: string;
  total_detratores: string;
  nps: string;
};

export function createIndicadoresRouter(pool: Pool): express.Router {
  const router = express.Router();
  router.get('/', requirePermissionWithSectorScope(
    pool,
    PERMISSIONS.indicatorsReadHospital,
    PERMISSIONS.indicatorsReadAssigned,
  ), async (req, res, next) => {
    if (!req.auth) return res.status(401).json({ error: 'Autenticação necessária.' });
    const page = Number(req.query.page ?? 1);
    const pageSize = Number(req.query.pageSize ?? 50);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      return res.status(400).json({ error: 'Paginação inválida.' });
    }
    const sectorIds = req.sectorScope === 'assigned' ? req.auth.sectorIds : null;
    try {
      const result = await pool.query<IndicatorRow>(
        `SELECT setor_id::text, setor, data_resposta::text, turno_id::text, turno,
                total_respostas::text, total_promotores::text, total_neutros::text,
                total_detratores::text, nps::text
           FROM public.vw_indicadores_nps_setor_dia_turno
          WHERE hospital_id=$1 AND ($2::bigint[] IS NULL OR setor_id=ANY($2::bigint[]))
          ORDER BY data_resposta DESC, setor, turno
          LIMIT $3 OFFSET $4`,
        [req.auth.hospitalId, sectorIds, pageSize, (page - 1) * pageSize],
      );
      return res.status(200).json({ data: result.rows, pagination: { page, pageSize } });
    } catch (error) { return next(error); }
  });
  return router;
}
