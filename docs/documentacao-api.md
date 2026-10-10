# API REST

Documentação Swagger disponível em `/api/docs` quando o backend estiver ativo.

| Método e rota | Acesso | Uso |
|---|---|---|
| `POST /api/auth/login` | Público com limite | Cria sessão administrativa |
| `POST /api/auth/logout` | Sessão | Encerra sessão |
| `GET /api/auth/me` | Sessão | Retorna o perfil atual |
| `GET /api/setores` | Público | Lista setores ativos |
| `GET /api/admin/setores`, `POST/PATCH/DELETE /api/setores` | Sessão, por perfil | Lista e gerencia setores (exclusão lógica) |
| `GET /api/admin/pesquisas`, `POST /api/pesquisas`, `PATCH /api/admin/pesquisas/:id` | Admin | Gerencia pesquisas; nova pesquisa recebe NPS obrigatório |
| `GET/POST /api/perguntas`, `PATCH/DELETE /api/perguntas/:id` | Admin/gestor/read-only | Gerencia perguntas com snapshot por sessão |
| `PUT /api/perguntas/:id/regra-ouvidoria` | Admin | Configura limite numérico da oferta de contato |
| `GET/POST /api/equipes`, `PATCH /api/equipes/:id` | Admin/gestor/read-only | Consulta e gerencia equipes |
| `GET/POST /api/usuarios`, `PATCH /api/usuarios/:id` | Admin | Gerencia usuários, perfis e setores vinculados |
| `GET /api/pesquisas/:slug` | Público com limite | Consulta perguntas aplicáveis |
| `POST /api/pesquisas/iniciar` | Público com limite | Cria sessão e entrega token de retomada |
| `GET /api/pesquisas/sessoes/:id` | Token da pesquisa | Recupera respostas existentes |
| `POST /api/pesquisas/sessoes/:id/respostas` | Token da pesquisa | Persiste resposta progressiva |
| `POST /api/pesquisas/sessoes/:id/finalizar` | Token da pesquisa | Conclui se NPS foi respondido |
| `POST /api/pesquisas/sessoes/:id/ouvidoria` | Token e consentimento | Abre chamado e emite protocolo |
| `GET /api/dashboard/indicadores` | Admin, gestor, visualizador | Indicadores agregados |
| `GET /api/dashboard/evolucao?days=7` | Admin, gestor, visualizador | Série histórica de NPS, até 90 dias |
| `GET /api/tvwall/indicadores` | Público agregado | Dados sem identificação pessoal |
| `GET/PATCH /api/ouvidoria/:id` | Admin, Ouvidoria | Consulta/atualiza chamado |
| `POST /api/ouvidoria/:id/tentativas-contato` | Admin, Ouvidoria | Registra tentativa de contato |

Erros não retornam conteúdo pessoal recebido nem detalhes internos de banco. Validação de payload usa Zod.
