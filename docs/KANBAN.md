# Organização do quadro Kanban

**Quadro ativo:** [VivaCare — pesquisa hospitalar no Trello](https://trello.com/b/F2VHl9RQ/vivacare-pesquisa-hospitalar).

## Colunas sugeridas

1. **Backlog** — requisito identificado, ainda sem prioridade/capacidade acordada.
2. **Pronto** — escopo, aceite e responsável definidos; pode começar.
3. **Em andamento** — trabalho ativo. Limite recomendado: uma tarefa principal por pessoa.
4. **Revisão** — PR aberto aguardando leitura da outra pessoa.
5. **Bloqueado** — dependência explicitada (por exemplo, migration, acesso ao PostgreSQL ou decisão do cliente).
6. **Concluído** — critério de aceite atendido, PR integrado e evidência anexada.

## Campos mínimos de cada card

- Título no formato de resultado observável.
- Responsável (Sofia ou Raissa) e prioridade combinada.
- Tipo: frontend, backend, banco, documentação, teste ou apresentação.
- Critérios de aceite e link ao requisito em [`requisitos.md`](requisitos.md).
- Dependências/bloqueios e ambiente necessário.
- Link de branch/PR/commit e evidência quando concluído.

## Primeiro backlog sugerido

- Publicar a documentação OpenAPI interativa.
- Atualizar README com o estado verdadeiro do frontend/backend.
- Conectar listagens e ações de gestão ainda não cobertas pela interface.
- Validar migration/submissões com PostgreSQL descartável após revisão da dupla.
- Validar fluxo do paciente e formulário de Ouvidoria com o cliente.
- Gerar relatório de testes e cobertura após executar as suítes autorizadas.

O quadro ativo está no Trello. Este arquivo descreve o fluxo e as informações recomendadas para os cartões; mantenha os estados atualizados no quadro compartilhado.
