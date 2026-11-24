import { Router } from 'express';
import { pool } from '../db/pool.js';
import { filtroPesquisaPublica } from './publicSurveyCode.js';

interface PesquisaPublicaRow {
  id: string;
  publicCode: string;
  title: string;
  description: string | null;
  sectorName: string;
  questionId: string | null;
  questionText: string | null;
  stage: 'GERAL' | 'RECEPCAO' | 'TRIAGEM' | 'ENFERMAGEM' | 'MEDICO' | null;
  answerType: 'TEXTO' | 'NOTA' | 'OPCAO' | 'SIM_NAO' | null;
  required: boolean | null;
  position: number | null;
}
export const publicSurveyRouter = Router();

publicSurveyRouter.get('/pesquisas/:codigo', async (req, res) => {
  const { codigo } = req.params;
  const filtroPublico = filtroPesquisaPublica(codigo);
  if (!filtroPublico) {
    return res.status(400).json({ code: 'INVALID_PUBLIC_CODE', message: 'URL publica da pesquisa invalida.' });
  }

  try {
    const resultado = await pool.query<PesquisaPublicaRow>(
      `
        SELECT
          p.id::text AS "id",
          p.codigo_publico::text AS "publicCode",
          p.titulo AS "title",
          p.descricao AS "description",
          s.nome AS "sectorName",
          q.id::text AS "questionId",
          q.texto AS "questionText",
          q.etapa AS "stage",
          q.tipo_resposta AS "answerType",
          q.obrigatoria AS "required",
          q.ordem AS "position"
        FROM public.pesquisas p
        JOIN public.setores s
          ON s.id = p.setor_id AND s.ativo = true
        JOIN public.hospitais h
          ON h.id = s.hospital_id AND h.ativo = true
        LEFT JOIN public.perguntas q
          ON q.pesquisa_id = p.id AND q.ativa = true AND q.finalidade_nota IS DISTINCT FROM 'NPS_GERAL'
        WHERE ${filtroPublico.condition} AND p.ativa = true
        ORDER BY q.ordem NULLS LAST, q.id NULLS LAST
      `,
      [filtroPublico.value],
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({
        code: 'PUBLIC_SURVEY_NOT_FOUND',
        message: 'Pesquisa ativa nao encontrada para este codigo.',
      });
    }

    if (new Set(resultado.rows.map((linha) => linha.id)).size > 1) {
      return res.status(409).json({ code: 'PUBLIC_SURVEY_AMBIGUOUS', message: 'Ha mais de uma pesquisa ativa para este setor.' });
    }

    const pesquisa = resultado.rows[0]!;
    const questions = resultado.rows
      .filter((linha) => linha.questionId !== null)
      .map((linha) => ({
        id: linha.questionId!,
        text: linha.questionText!,
        stage: linha.stage!,
        answerType: linha.answerType!,
        required: linha.required!,
        position: linha.position!,
      }));

    return res.status(200).json({
      id: pesquisa.id,
      publicCode: pesquisa.publicCode,
      title: pesquisa.title,
      description: pesquisa.description,
      sectorName: pesquisa.sectorName,
      questions,
    });
  } catch {
    console.error('Falha ao consultar a configuracao publica da pesquisa.');
    return res.status(503).json({
      code: 'PUBLIC_SURVEY_UNAVAILABLE',
      message: 'Nao foi possivel carregar a pesquisa agora. Tente novamente.',
    });
  }
});
