# Padrões de Git e contribuição

**Estado:** proposta para a dupla aprovar antes de declarar como processo adotado.

## Branches

Proposta de fluxo simples baseado em `main` protegida:

- `main`: código integrado, compilável e revisado.
- `feat/<assunto-curto>`: funcionalidade (`feat/dashboard-api`, `feat/openapi-docs`).
- `fix/<assunto-curto>`: correção (`fix/invite-fragment`).
- `docs/<assunto-curto>`: documentação (`docs/requisitos`).
- `test/<assunto-curto>`: testes e infraestrutura de qualidade.

Cada pessoa trabalha em branch própria; evitar dois colaboradores alterarem simultaneamente o mesmo arquivo. Atualizar a branch com `main` antes de abrir PR. Não enviar `.env`, credenciais, dump com dados pessoais ou artefatos gerados.

## Commits

Adotar Conventional Commits em português ou inglês de forma consistente:

```text
feat(frontend): carrega setores pela API
fix(auth): lê token de convite no fragmento da URL
docs(api): adiciona especificação OpenAPI
test(backend): cobre autorização por perfil
```

Um commit deve descrever uma mudança coesa. Evitar mensagens vagas (`ajustes`, `coisas`, `final`). Não reescrever histórico já compartilhado sem combinar com a dupla.

## Pull requests e revisão

1. Abrir PR com contexto, objetivo, telas/rotas afetadas e dependências de banco.
2. Incluir evidência de typecheck/testes relevantes e declarar verificações que não puderam ser executadas.
3. Revisora confere requisitos, escopo, autorização server-side, privacidade, migrations e ausência de segredo.
4. Resolver comentários e obter aprovação da outra pessoa antes do merge.
5. Preferir squash merge quando facilitar o histórico; registrar o que foi integrado.

Checklist para cada PR:

- [ ] Não inclui `.env`, senha, token ou dado de paciente.
- [ ] Respeita os contratos e decisões registrados em `docs/`.
- [ ] Mutações administrativas têm autorização no backend e proteção CSRF.
- [ ] A pesquisa anônima não recebe dados de contato.
- [ ] Typecheck e testes aplicáveis têm resultado registrado.
- [ ] Dependência de migration, serviço ou decisão externa está declarada.

## Rastreabilidade da dupla

O histórico já contém commits diretos em `main`; este documento é uma proposta prospectiva, não uma descrição do processo histórico. Para evidenciar contribuição individual, cada pessoa deve usar sua identidade GitHub, branches/PRs próprios e descrições que identifiquem a parte entregue. Não dividir autoria artificialmente nem alterar commits antigos para aparentar participação. Revisões e cards do quadro devem apontar para PR/commit correspondente.

## Acordos que faltam

- Aprovação da estratégia de branches e exigência de uma revisão por PR.
- Definição de squash merge ou merge commit.
- Criação do quadro GitHub Projects e inclusão do link no README.
