import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const departments = [
  { name: 'Recepção', slug: 'recepcao', description: 'Atendimento inicial e orientação.' },
  { name: 'Triagem', slug: 'triagem', description: 'Acolhimento e classificação.' },
  { name: 'Enfermagem', slug: 'enfermagem', description: 'Cuidados prestados pela equipe de enfermagem.' },
  { name: 'Médicos', slug: 'medicos', description: 'Atendimento médico.' },
];
try {
  for (const item of departments) await prisma.sector.upsert({ where: { slug: item.slug }, update: item, create: item });
  let survey = await prisma.survey.findFirst({ where: { name: 'Pesquisa de experiência' } });
  if (!survey) survey = await prisma.survey.create({ data: { name: 'Pesquisa de experiência', active: true } });
  const questions = [
    ...departments.map((d, i) => ({ slug: d.slug, text: `Como você avalia o atendimento da ${d.name.toLowerCase()}?`, type: 'FACES', order: i + 1, required: false, skippable: true, countsForSatisfaction: true, options: ['satisfeito', 'neutro', 'insatisfeito'] })),
    { slug: null, text: 'Em uma escala de 0 a 10, o quanto você recomendaria este hospital a um amigo ou familiar?', type: 'NPS', order: 5, required: true, skippable: false, countsForSatisfaction: false, options: Array.from({ length: 11 }, (_, i) => i) },
  ];
  for (const q of questions) {
    const sector = q.slug ? await prisma.sector.findUnique({ where: { slug: q.slug } }) : null;
    const found = await prisma.question.findFirst({ where: { surveyId: survey.id, text: q.text } });
    if (!found) await prisma.question.create({ data: { surveyId: survey.id, sectorId: sector?.id, text: q.text, type: q.type, order: q.order, required: q.required, skippable: q.skippable, countsForSatisfaction: q.countsForSatisfaction, options: q.options } });
  }
  const npsQuestion = await prisma.question.findFirst({ where: { surveyId: survey.id, type: 'NPS' } });
  if (npsQuestion && !(await prisma.conditionalRule.findFirst({ where: { questionId: npsQuestion.id } }))) {
    await prisma.conditionalRule.create({ data: { questionId: npsQuestion.id, operator: 'LT', threshold: 7, message: 'Sentimos muito que sua experiência não tenha sido a ideal. Gostaria que nossa Ouvidoria entrasse em contato com você?' } });
  }
  const email = process.env.ADMIN_EMAIL?.toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (email && password && password.length >= 12) {
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.upsert({ where: { email }, update: { passwordHash }, create: { name: 'Administrador', email, passwordHash, role: 'ADMIN' } });
    console.log(`Administrador criado/atualizado: ${email}`);
  } else {
    console.log('Setores e pesquisa inicial criados. Defina ADMIN_EMAIL e ADMIN_PASSWORD (12+ caracteres) para criar o administrador.');
  }
} finally { await prisma.$disconnect(); }
