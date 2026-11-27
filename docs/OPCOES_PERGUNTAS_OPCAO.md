# Proposta de alternativas para perguntas `OPCAO`

## Estado

Esta é uma proposta para revisão da equipe e da DBA. **Não altera o banco nem habilita alternativas cadastráveis.** O schema atual guarda a resposta `OPCAO` como texto livre; até a aprovação de uma migration, a interface deve indicar isso claramente.

## Contrato sugerido

- Cada pergunta do tipo `OPCAO` tem uma lista ordenada de alternativas.
- A equipe cadastra um rótulo visível e um valor estável por alternativa. O paciente vê apenas o rótulo; a resposta persistida usa o valor estável.
- O backend rejeita perguntas `OPCAO` sem alternativas ativas e rejeita valores que não pertençam à pergunta enviada.
- A API pública devolve alternativas ativas na ordem configurada. A interface apresenta controles de escolha, não um campo de texto.
- Desativar uma alternativa não apaga respostas antigas. Não permitir desativar a última alternativa enquanto a pergunta estiver ativa.

## Modelagem candidata

Criar `pergunta_opcoes` com `id`, `pergunta_id`, `valor`, `rotulo`, `ordem`, `ativa`, `criada_em` e `atualizada_em`. Usar FK para `perguntas(id)`, unicidade de `(pergunta_id, valor)` e índice por `(pergunta_id, ativa, ordem, id)`. A regra que limita o uso da tabela a perguntas `tipo_resposta='OPCAO'` deve ser validada no serviço e protegida por trigger/constraint adequada, pois depende de outra tabela.

Guardar em `resposta_detalhes.resposta_opcao` o valor estável, não o texto do rótulo. A alternativa deve pertencer à mesma pergunta da resposta. A equipe precisa decidir se a integridade histórica será assegurada por chave estrangeira para a alternativa ou por snapshot do valor/rótulo na resposta. Essa decisão afeta exclusão, edição e relatórios históricos.

## Migração de dados e permissões

Antes de migrar, inventariar todas as perguntas `OPCAO` e respostas existentes. Texto livre histórico não pode ser convertido em alternativa sem decisão explícita; preservar respostas existentes como histórico ou aprovar uma estratégia de reconciliação. A migration deverá conceder à role APP somente leitura de alternativas públicas/administrativas necessárias e escrita restrita às operações autorizadas; validar privilégios efetivos e escopo por hospital/setor no banco descartável.

## Critérios antes de implementar

1. Aprovar se respostas guardam valor estável, snapshot do rótulo ou ambos.
2. Definir se a escolha é única (proposta atual) ou múltipla.
3. Definir como preservar respostas existentes em texto livre.
4. Aprovar grants, auditoria das mutações e comportamento ao desativar alternativas.
5. Criar e testar a migration numa cadeia descartável completa, com a próxima versão oficial livre após reconciliação do ledger.
