# Arquitetura VivaCare

O monorepo tem frontend React/Vite e API Express em workspaces npm. Prisma acessa PostgreSQL. A configuração da pesquisa é copiada para cada sessão ao iniciar, mantendo as perguntas históricas estáveis. Respostas são upsert por sessão e pergunta imediatamente após confirmação.

O paciente recebe token aleatório de retomada; a API persiste seu hash. Sessões administrativas usam cookie HTTP-only. A autorização é verificada na API por papel; gestores têm consultas limitadas aos setores associados. A atualização das telas agregadas usa polling periódico de 30 segundos.

O endpoint TV Wall retorna somente NPS agregado, total concluído e total do dia. Não consulta tickets nem expõe texto, protocolo ou telefone.

O percentual de satisfação considera somente respostas a perguntas marcadas `countsForSatisfaction`: carinhas contam como positivas quando “satisfeito”; escalas de 1 a 10 contam como positivas a partir de 7. O resultado é respostas positivas dividido pelo total de respostas válidas dessas perguntas. NPS é calculado separadamente.
