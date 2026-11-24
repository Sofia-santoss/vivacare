import { createHash, createHmac } from 'node:crypto';
import { Router } from 'express';
import { pool } from '../db/pool.js';
import { enforcePublicIpLimit, PublicRateLimitError } from '../security/publicRateLimit.js';

const codigoUuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

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
  if (!codigoUuid.test(codigo)) {
    return res.status(400).json({
      code: 'INVALID_PUBLIC_CODE',
      message: 'Codigo da pesquisa invalido.',
    });
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
          ON q.pesquisa_id = p.id AND q.ativa = true
        WHERE p.codigo_publico = $1::uuid AND p.ativa = true
        ORDER BY q.ordem NULLS LAST, q.id NULLS LAST
      `,
      [codigo],
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({
        code: 'PUBLIC_SURVEY_NOT_FOUND',
        message: 'Pesquisa ativa nao encontrada para este codigo.',
      });
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


interface PerguntaRespostaRow {
  id: string;
  tipo: 'TEXTO' | 'NOTA' | 'OPCAO' | 'SIM_NAO';
  obrigatoria: boolean;
}

interface CorpoResposta {
  nps: number;
  answers: Array<{ questionId: string; value: string | number | boolean }>;
}

class ErroSubmissao extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

function segredoObrigatorio(nome: string): string {
  const valor = process.env[nome]?.trim();
  if (!valor || Buffer.byteLength(valor, 'utf8') < 32) {
    throw new Error(`Configuracao ausente ou curta: ${nome}`);
  }
  return valor;
}

function inteiroPositivo(nome: string): number {
  const valor = Number(process.env[nome]);
  if (!Number.isSafeInteger(valor) || valor < 1) throw new Error(`Configuracao invalida: ${nome}`);
  return valor;
}

function validarCorpo(valor: unknown): CorpoResposta {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
    throw new ErroSubmissao(400, 'INVALID_SUBMISSION', 'O formato da resposta e invalido.');
  }
  const corpo = valor as Record<string, unknown>;
  if (Object.keys(corpo).sort().join(',') !== 'answers,nps'
      || !Number.isInteger(corpo.nps) || (corpo.nps as number) < 0 || (corpo.nps as number) > 10
      || !Array.isArray(corpo.answers) || corpo.answers.length > 100) {
    throw new ErroSubmissao(400, 'INVALID_SUBMISSION', 'Informe somente NPS e respostas validas.');
  }

  const answers = corpo.answers.map((item): CorpoResposta['answers'][number] => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new ErroSubmissao(400, 'INVALID_SUBMISSION', 'Uma das respostas tem formato invalido.');
    }
    const answer = item as Record<string, unknown>;
    if (Object.keys(answer).sort().join(',') !== 'questionId,value'
        || typeof answer.questionId !== 'string' || !/^\d+$/.test(answer.questionId)
        || !(typeof answer.value === 'string' || typeof answer.value === 'number' || typeof answer.value === 'boolean')) {
      throw new ErroSubmissao(400, 'INVALID_SUBMISSION', 'Uma das respostas tem formato invalido.');
    }
    return { questionId: answer.questionId, value: answer.value };
  });
  const ids = answers.map((answer) => answer.questionId);
  if (new Set(ids).size !== ids.length) {
    throw new ErroSubmissao(400, 'DUPLICATE_QUESTION', 'Uma pergunta foi respondida mais de uma vez.');
  }
  return { nps: corpo.nps as number, answers };
}

function valorColunas(pergunta: PerguntaRespostaRow, valor: string | number | boolean) {
  const vazio = { texto: null as string | null, nota: null as number | null, opcao: null as string | null, simNao: null as boolean | null };
  switch (pergunta.tipo) {
    case 'TEXTO':
      if (typeof valor !== 'string' || valor.length > 4000 || (pergunta.obrigatoria && !valor.trim())) break;
      return { ...vazio, texto: valor };
    case 'NOTA':
      if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < 0 || valor > 10) break;
      return { ...vazio, nota: valor };
    case 'OPCAO':
      if (typeof valor !== 'string' || !valor.length || valor.length > 200) break;
      return { ...vazio, opcao: valor };
    case 'SIM_NAO':
      if (typeof valor !== 'boolean') break;
      return { ...vazio, simNao: valor };
  }
  throw new ErroSubmissao(400, 'INVALID_ANSWER_VALUE', 'Uma resposta nao corresponde ao tipo da pergunta.');
}


publicSurveyRouter.post('/pesquisas/:codigo/respostas', async (req, res) => {
  const { codigo } = req.params;
  if (!codigoUuid.test(codigo)) {
    return res.status(400).json({ code: 'INVALID_PUBLIC_CODE', message: 'Codigo da pesquisa invalido.' });
  }

  const chaveCliente = req.get('Idempotency-Key') ?? '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(chaveCliente)) {
    return res.status(400).json({ code: 'INVALID_IDEMPOTENCY_KEY', message: 'Envie uma chave UUIDv4 no cabecalho Idempotency-Key.' });
  }

  let corpo: CorpoResposta;
  try {
    corpo = validarCorpo(req.body);
  } catch (erro) {
    if (erro instanceof ErroSubmissao) return res.status(erro.status).json({ code: erro.code, message: erro.message });
    return res.status(400).json({ code: 'INVALID_SUBMISSION', message: 'O formato da resposta e invalido.' });
  }

  const client = await pool.connect().catch(() => null);
  if (!client) return res.status(503).json({ code: 'PUBLIC_SUBMISSION_UNAVAILABLE', message: 'Nao foi possivel registrar sua resposta agora. Tente novamente.' });
  try {
    const segredoFingerprint = segredoObrigatorio('PUBLIC_SURVEY_FINGERPRINT_SECRET');
    if (!req.ip) throw new Error('Endereco de rede indisponivel');

    const chaveHash = createHash('sha256').update(chaveCliente.toLowerCase()).digest('hex');
    const fingerprint = createHmac('sha256', segredoFingerprint)
      .update('vivacare:public-survey-payload:v1\0')
      .update(JSON.stringify({ nps: corpo.nps, answers: [...corpo.answers].sort((a, b) => a.questionId.localeCompare(b.questionId)) }))
      .digest('hex');

    await client.query('BEGIN');
    const pesquisaResult = await client.query<{ id: string }>(
      `SELECT p.id::text AS id
         FROM public.pesquisas p
         JOIN public.setores s ON s.id=p.setor_id AND s.ativo=true
         JOIN public.hospitais h ON h.id=s.hospital_id AND h.ativo=true
        WHERE p.codigo_publico=$1::uuid AND p.ativa=true
        FOR SHARE OF p`,
      [codigo],
    );
    const pesquisaId = pesquisaResult.rows[0]?.id;
    if (!pesquisaId) throw new ErroSubmissao(404, 'PUBLIC_SURVEY_NOT_FOUND', 'Pesquisa ativa nao encontrada para este codigo.');

    await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [pesquisaId, chaveHash]);
    const anterior = await client.query<{ payload_hash: string }>(
      `SELECT payload_hash FROM public.submissoes_pesquisa_idempotencia WHERE pesquisa_id=$1 AND chave_hash=$2 FOR SHARE`,
      [pesquisaId, chaveHash],
    );
    if (anterior.rows[0]) {
      if (anterior.rows[0].payload_hash.trim() !== fingerprint) {
        throw new ErroSubmissao(409, 'IDEMPOTENCY_KEY_REUSED', 'Esta chave ja foi usada com outro conteudo.');
      }
      await client.query('COMMIT');
      return res.status(200).json({ status: 'already_submitted' });
    }

    const questionResult = await client.query<PerguntaRespostaRow>(
      `SELECT id::text AS id, tipo_resposta AS tipo, obrigatoria
         FROM public.perguntas WHERE pesquisa_id=$1 AND ativa=true ORDER BY ordem,id`,
      [pesquisaId],
    );
    const perguntas = new Map(questionResult.rows.map((pergunta) => [pergunta.id, pergunta]));
    for (const answer of corpo.answers) {
      const pergunta = perguntas.get(answer.questionId);
      if (!pergunta) throw new ErroSubmissao(400, 'UNKNOWN_QUESTION', 'Uma pergunta nao pertence a esta pesquisa ativa.');
      valorColunas(pergunta, answer.value);
    }
    const respondidas = new Set(corpo.answers.map((answer) => answer.questionId));
    if (questionResult.rows.some((pergunta) => pergunta.obrigatoria && !respondidas.has(pergunta.id))) {
      throw new ErroSubmissao(400, 'REQUIRED_QUESTION_MISSING', 'Responda todas as perguntas obrigatorias.');
    }

    await enforcePublicIpLimit(req.ip);
    const turnoResult = await client.query<{ id: string }>(
      `SELECT id::text AS id FROM public.turnos WHERE ativo=true AND (
         (hora_inicio < hora_fim AND LOCALTIME >= hora_inicio AND LOCALTIME < hora_fim)
         OR (hora_inicio > hora_fim AND (LOCALTIME >= hora_inicio OR LOCALTIME < hora_fim))
       ) ORDER BY id LIMIT 2`,
    );
    if (turnoResult.rows.length !== 1) {
      throw new ErroSubmissao(503, 'SHIFT_UNAVAILABLE', 'Nao foi possivel determinar o turno atual para registrar a resposta.');
    }

    const respostaResult = await client.query<{ id: string }>(
      `INSERT INTO public.respostas (pesquisa_id, turno_id, nota_nps, anonima, autoriza_contato, telefone_contato)
       VALUES ($1, $2, $3, true, false, NULL) RETURNING id::text AS id`,
      [pesquisaId, turnoResult.rows[0]!.id, corpo.nps],
    );
    const respostaId = respostaResult.rows[0]!.id;
    for (const answer of corpo.answers) {
      const pergunta = perguntas.get(answer.questionId)!;
      const valores = valorColunas(pergunta, answer.value);
      await client.query(
        `INSERT INTO public.resposta_detalhes
           (resposta_id, pergunta_id, resposta_texto, resposta_nota, resposta_opcao, resposta_sim_nao)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [respostaId, answer.questionId, valores.texto, valores.nota, valores.opcao, valores.simNao],
      );
    }
    await client.query(
      `INSERT INTO public.submissoes_pesquisa_idempotencia (pesquisa_id, chave_hash, payload_hash, resposta_id)
       VALUES ($1, $2, $3, $4)`,
      [pesquisaId, chaveHash, fingerprint, respostaId],
    );
    await client.query('COMMIT');
    return res.status(201).json({ status: 'submitted' });
  } catch (erro) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (erro instanceof ErroSubmissao) return res.status(erro.status).json({ code: erro.code, message: erro.message });
    if (erro instanceof PublicRateLimitError) return res.status(erro.status).json({ code: erro.code, message: erro.message });
    console.error('Falha ao registrar resposta publica anonima.');
    return res.status(503).json({ code: 'PUBLIC_SUBMISSION_UNAVAILABLE', message: 'Nao foi possivel registrar sua resposta agora. Tente novamente.' });
  } finally {
    client.release();
  }
});