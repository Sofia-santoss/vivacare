# Modelo de dados

`User` guarda perfis e credenciais com hash; `Sector`, `Team` e `UserSector` organizam setores e permissões; `Survey`, `Question` e `ConditionalRule` definem pesquisas versionadas; `SurveySession` guarda o estado e snapshot; `Answer` persiste cada resposta; `Consent` registra finalidade e versão do aviso; `Ticket`, `ContactAttempt` e `TicketHistory` gerenciam Ouvidoria; `AuditLog` registra eventos administrativos.

Os IDs expostos são UUID. Telefone não é chave. Sessões incompletas não entram no NPS. Recomenda-se definir prazos institucionais para anonimização e exclusão antes da produção.
