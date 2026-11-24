# Especificação de requisitos — VivaCare

**Versão:** 0.1 · **Data:** 24/11/2026 · **Estado:** rascunho para validação com a dupla e o hospital

Este documento organiza o roteiro da pesquisa, as decisões já tomadas e as funcionalidades encontradas no repositório. Ele usa requisitos identificados e critérios verificáveis, seguindo a estrutura geral de uma especificação de requisitos de software. Não substitui a aprovação do cliente nem presume decisões que ainda dependem do banco.

## 1. Objetivo e escopo

O VivaCare coleta avaliações de experiência de pacientes da Fundação Hospitalar Dr. Oswaldo Diesel, apresenta a pergunta NPS ao final da pesquisa e encaminha manifestações identificáveis à Ouvidoria em um fluxo separado. A equipe hospitalar administra dados por sessão autenticada, permissões e escopo hospitalar/setorial.

O escopo acadêmico inclui pesquisa pública, NPS, Ouvidoria, autenticação da equipe, módulos de gestão documentados no backend e sua interface. Indicadores consolidados e publicação em produção dependem de dados, schema e validação operacional.

## 2. Atores

| Ator | Necessidade |
|---|---|
| Paciente/respondente | Avaliar as etapas do atendimento sem precisar criar conta. |
| Equipe hospitalar | Administrar somente os recursos permitidos pelo perfil e escopo. |
| Ouvidoria | Receber relato e telefone quando a pessoa autorizar contato. |
| Administrador do sistema | Provisionar contas, permissões, configuração e ambiente. |
| Cliente/parceiro hospitalar | Validar o fluxo, os indicadores e os requisitos de atendimento. |

## 3. Requisitos funcionais

Estados: **Implementado em código** significa que há rota/interface; não comprova funcionamento com o banco real. **Parcial** indica que parte do fluxo existe. **Pendente** depende de decisão, integração ou validação.

| ID | Requisito | Critério de aceite | Estado |
|---|---|---|---|
| RF-01 | O respondente abre uma pesquisa pelo slug do setor ou pelo código público UUID. | A API retorna somente uma pesquisa ativa compatível; código inválido, pesquisa ausente e slug ambíguo geram erro explícito. | Implementado em código; depende de dados no PostgreSQL. |
| RF-02 | A pesquisa exibe perguntas ativas na ordem configurada e uma pergunta por etapa. | As respostas são validadas pelo tipo e obrigatoriedade definidos na pesquisa. | Implementado em código; inventário real de perguntas pendente. |
| RF-03 | A jornada termina com uma pergunta NPS obrigatória de 0 a 10. | Não é possível enviar a pesquisa sem selecionar um inteiro entre 0 e 10. | Implementado em código. |
| RF-04 | O envio da pesquisa mantém as respostas anônimas. | A rota aceita NPS e respostas por ID, rejeita campos de contato e aplica chave de idempotência. | Implementado em código; envio real depende do schema/migration. |
| RF-05 | Se NPS for menor que 6, a jornada apresenta o formulário da Ouvidoria. | Para notas 0–5 aparece o fluxo de Ouvidoria; nota 6 ou superior segue para a conclusão sem esse gatilho. | Implementado no frontend conforme decisão da dupla; validar com o cliente. |
| RF-06 | A pessoa pode enviar manifestação à Ouvidoria com tipo, relato, telefone e consentimento explícito. | A API exige relato, telefone válido e consentimento; devolve protocolo e não associa a manifestação à resposta anônima. | Implementado em código; envio real depende do PostgreSQL. |
| RF-07 | A equipe entra com e-mail e senha e recebe sessão protegida. | Credenciais inválidas não revelam se o e-mail existe; sessão inválida/expirada não libera endpoints privados. | Implementado em código; depende de migrations, credenciais e hash compatível. |
| RF-08 | A equipe pode encerrar sessão e aceitar convite de primeiro acesso. | Logout revoga a sessão; aceite usa token de uso único no fragmento do link e senha com pelo menos 12 caracteres. | Implementado em código; entrega de e-mail ainda sem provedor configurado. |
| RF-09 | O backend restringe operações por permissão e escopo. | Um usuário sem permissão recebe 403; tentativas fora do hospital/setores autorizados não retornam dados. | Implementado em código; depende das migrations/catálogo de permissões. |
| RF-10 | A equipe consulta setores, equipes, turnos, escalas e usuários autorizados. | A API pagina resultados e filtra pelo escopo da sessão; o frontend exibe carregamento, erro, vazio e paginação. | Backend e listagens de frontend implementados; validação com banco pendente. |
| RF-11 | Um administrador convida e administra usuários. | Criação, atualização, status e perfil respeitam permissões e registram auditoria. | Rotas implementadas; entrega de convite e banco pendentes. |
| RF-12 | A equipe consulta métricas de NPS e manifestações agregadas. | Indicadores mostram agregações por setor/período sem expor texto livre ou grupos pequenos. | Parcial/pendente: telas visuais existem; API do painel ainda não está conectada. |

## 4. Requisitos não funcionais

| ID | Requisito | Critério verificável | Estado |
|---|---|---|---|
| RNF-01 — Segurança | Senhas nunca são armazenadas em texto puro; sessões usam token aleatório e hash no banco. | Verificar rotinas `backend/src/auth/passwords.ts` e `sessions.ts`; não registrar credenciais nos logs. | Implementado em código. |
| RNF-02 — Segurança | Rotas administrativas exigem sessão, CSRF nas mutações, origem permitida e autorização no servidor. | Requests sem sessão/CSRF/permissão são recusadas com 401/403. | Implementado em código; integração com banco pendente. |
| RNF-03 — Privacidade | Dados de contato da Ouvidoria não são enviados junto à resposta anônima. | Contratos e persistência separados; consentimento explícito antes do contato. | Implementado em código; validar fluxo e política com cliente. |
| RNF-04 — Integridade | Submissões públicas repetidas com a mesma chave não criam duplicatas. | Repetição do payload devolve resultado idempotente; reutilização da chave com payload diferente é recusada. | Implementado em código; requer schema proposto e teste PostgreSQL. |
| RNF-05 — Manutenibilidade | Rotas, validações, serviços e repositórios mantêm responsabilidades separadas. | Módulos podem ser typechecked/testados sem executar a interface. | Implementado parcialmente; arquitetura descrita em `arquitetura-backend.md`. |
| RNF-06 — Acessibilidade | Formulários têm rótulos, erros anunciáveis e uso por teclado. | Revisão manual de teclado/foco e leitores de tela nas jornadas críticas. | Implementado parcialmente; revisão manual pendente. |
| RNF-07 — Disponibilidade/escala | Limites de acesso e segredos são configuráveis por ambiente; múltiplas instâncias usam segredos consistentes. | Inicialização de produção falha se limites requeridos estiverem ausentes. | Implementado em código; valores de produção não definidos. |
| RNF-08 — Compatibilidade | Interface e API funcionam nos navegadores atuais definidos para a demonstração. | Validar nos navegadores/dispositivos acordados com o cliente. | Alvo de navegadores a confirmar. |

## 5. Regras e decisões registradas

- Setores obrigatórios do roteiro: Recepção, Triagem, Enfermagem e Médicos.
- NPS é apresentado ao final, de 0 a 10, e obrigatório.
- A dupla definiu que a apresentação da Ouvidoria é acionada para NPS abaixo de 6. O roteiro original deixava o limite para decisão da dupla e citava `< 7` como exemplo; confirmar o limiar com o cliente antes de produção.
- A pesquisa permanece anônima; contato e relato são enviados à Ouvidoria separadamente.
- Categorias de NPS padrão (detratores, neutros, promotores) seguem as faixas 0–6, 7–8 e 9–10; o gatilho de Ouvidoria é uma regra distinta, definido acima.
- A lista de opções para pergunta `OPCAO` ainda precisa de contrato/schema aprovado.

## 6. Dependências e questões abertas

1. Confirmar schema alvo, migrations aplicadas, perguntas ativas e faixas de cada pergunta `NOTA`.
2. Confirmar a decisão `< 6` com o cliente e se o formulário deve ser apenas oferecido ou obrigatório para avançar.
3. Definir modelagem das opções de perguntas `OPCAO`.
4. Configurar provedor de e-mail para convites; hoje o adaptador padrão falha fechado.
5. Definir os endpoints de indicadores e de gestão da Ouvidoria.
6. Confirmar matriz de permissões e regras de escopo com os responsáveis pelo banco.
7. Confirmar navegadores/dispositivos e metas de desempenho de aceite.

## 7. Rastreabilidade

Fontes: roteiro de pesquisa fornecido pela dupla, enunciado complementar da disciplina e implementação presente no repositório na data desta versão. As decisões ainda não aprovadas pelo cliente estão explicitamente marcadas como dependências, não como fatos validados.
