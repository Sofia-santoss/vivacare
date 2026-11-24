# Módulo de usuários (backend)

## Rotas

As rotas administrativas estão sob `/api/usuarios` e herdam autenticação por sessão e proteção CSRF:

- `GET /api/usuarios` e `GET /api/usuarios/:id`: requerem `users.read.hospital`.
- `POST /api/usuarios`: requer `users.create.hospital`; recebe nome, e-mail e `perfilId`.
- `PATCH /api/usuarios/:id`: requer `users.update.hospital`; aceita somente nome e e-mail.
- `PATCH /api/usuarios/:id/status`: requer `users.deactivate.hospital`; recebe `ativo` booleano.
- `PATCH /api/usuarios/:id/perfil`: requer `users.change_profile.hospital`; recebe `perfilId`.
- `POST /api/usuarios/convites/aceitar`: endpoint público com validação de origem, token aleatório de uso único e senha escolhida pelo convidado.

Hospital e ator são retirados da sessão autenticada e verificados novamente no SQL da operação. IDs de hospital no corpo são ignorados; os únicos IDs aceitos identificam o recurso/perfil e são validados novamente contra o hospital/perfil no servidor. A resposta de convite é genérica para endereços novos ou existentes.

O token tem validade de 24 horas e é enviado no fragmento `#token=...` do link, para não seguir em requisições HTTP/headers Referer. O banco guarda somente seu SHA-256 e expiração codificada no marcador do campo `senha_hash`, sem guardar token bruto ou senha temporária. O marcador possui prefixo próprio, não é aceito pelo verificador scrypt, e o login ainda exige conta ativa. A aceitação troca o marcador por hash scrypt e ativa a conta; o token expira, é de uso único, e um reenvio invalida o anterior. Alterações de perfil e desativação revogam sessões na transação; reativação não restaura sessões anteriores. Usuários nunca são removidos fisicamente.

A interface web precisa ler o fragmento e enviar `POST /api/usuarios/convites/aceitar` com `token` e a senha definida pelo usuário. O frontend permaneceu sem alterações nesta etapa.

Criação, edição, alteração de perfil, desativação, reativação e aceite de convite gravam auditoria na mesma transação. Detalhes registram apenas nomes dos campos alterados.

## Restrições e dependências

Criação e alteração de perfil consultam os perfis no banco e recusam qualquer alvo `SUPER_ADMIN`; a alteração de perfil de uma conta que já seja Super Admin também é recusada. O módulo não tem endpoint de edição de permissões de perfil, então não há rota por onde contornar essa regra. `profiles.manage` e `permissions.manage` continuam sem endpoints no backend.

O código fornece o contrato `EntregarConvite` e um adaptador SMTP injetável, mas nenhum provedor está configurado. O adaptador padrão falha fechado também em desenvolvimento e teste; não simula envio nem registra links ou tokens. Antes de liberar o fluxo, conectar o provedor de forma segura e confirmar `USER_INVITE_URL_BASE`. A recuperação de senha não está implementada; não existe rota que possa contornar a ativação pendente.

A entrega síncrona dentro da transação ainda tem uma falha distribuída: o SMTP pode aceitar a mensagem e o commit do PostgreSQL falhar, deixando um link que não ativa a conta. Uma outbox resolve isso gravando o convite e um evento de e-mail na mesma transação; um worker envia depois, com tentativas limitadas, backoff, estado de entrega e idempotência, sem expor o token em logs. Como o token é necessário para montar o link após o commit, a implementação deve guardar o payload protegido por criptografia com chave externa ao banco (ou usar outro desenho equivalente que não armazene token em claro). A outbox requer nova migration, política de retenção, credencial de worker e operação de retries; permanece apenas como proposta e não foi implementada nem aplicada.

As rotas exigem as migrations 003, 005 e 006 aplicadas. Elas permanecem não aplicadas. Testes unitários e de API não conectam ao PostgreSQL. `npm run test:users:db` executa o teste de integração isolado do módulo e exige `VIVACARE_USERS_TEST_DB_*`, loopback, nome `_users_test` e confirmação `DISPOSABLE=YES`; ele verifica que o banco está vazio antes de criar objetos sintéticos. O teste não foi executado nesta tarefa.
