# Módulo de turnos

Rotas em `/api/turnos`:

- `GET /` lista e filtra por `nome`/`ativo`, com `page` e `pageSize`.
- `GET /:id` consulta um turno.
- `POST /` cria com `nome`, `horaInicio` e `horaFim`.
- `PATCH /:id` edita qualquer subconjunto desses três campos.
- `PATCH /:id/status` ativa/desativa com `{ "ativo": boolean }`.

As rotas usam `shifts.read.hospital`, `shifts.create.hospital`, `shifts.update.hospital` e `shifts.deactivate.hospital` da matriz preparada. Somente Super Admin e Admin do Hospital têm esses códigos. O hospital e o ator nas mutações vêm do principal autenticado; hospital enviado no corpo é rejeitado. O esquema aprovado é de instalação única: `turnos` é uma tabela global, sem `hospital_id`, e seus nomes são únicos globalmente.

## Horários e conflitos

`hora_inicio` e `hora_fim` são `time without time zone`: representam hora de relógio local do hospital em `America/Sao_Paulo`, sem conversão de/para UTC. O backend aceita `HH:MM` ou `HH:MM:SS`, valida os componentes e persiste segundos normalizados. Intervalos são semiabertos `[início,fim)`, como em `calcularTurno.ts`; início igual ao fim é inválido, enquanto início posterior ao fim representa travessia da meia-noite.

Turnos ativos não podem se sobrepor. A validação divide intervalos que atravessam a meia-noite em segmentos dentro do dia, permite turnos adjacentes e ignora turnos inativos. Todas as mutações usam o mesmo advisory transaction lock do PostgreSQL antes de verificar os turnos ativos, impedindo que duas escritas simultâneas da API passem pela validação ao mesmo tempo. Ativar um turno também repete a validação; editar um turno inativo permite horários que ainda não conflitam até sua ativação.

O resultado do repositório pode ser convertido por `paraTurnosCalculadora` diretamente ao contrato `Turno` já consumido por `calcularTurno`. O cálculo segue usando somente turnos ativos, hora local no fuso configurado e lança ambiguidade se houver sobreposição. A implementação não altera a associação de respostas a escalas.

Criação, edição, ativação e desativação gravam auditoria dentro da mesma transação. O baseline já contém horários, estado ativo, nome único, restrição de duração zero e privilégios SELECT/INSERT/UPDATE. Não é necessária migration para a instalação única aprovada. Se o produto passar a atender múltiplos hospitais, uma migration deverá adicionar `hospital_id`, rever a unicidade do nome e escopar turnos/escalas por hospital; essa mudança não faz parte do escopo atual. Auditoria e permissões dependem das migrations 003 e 005, não aplicadas nesta implementação.
