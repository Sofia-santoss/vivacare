export type SurveysTestDbResetConditions = {
  owns_database: boolean;
  can_create_public_schema: boolean;
  public_objects_droppable_by_setup: boolean;
  is_superuser: boolean;
  has_active_peer: boolean;
};

export function surveysTestDbResetBlockers(conditions: SurveysTestDbResetConditions): string[] {
  return [
    !conditions.owns_database && 'SETUP não é proprietário do banco',
    !conditions.can_create_public_schema && 'SETUP não pode criar objetos no schema public',
    !conditions.public_objects_droppable_by_setup && 'há objetos públicos cujo proprietário não é efetivo para SETUP',
    conditions.is_superuser && 'SETUP é SUPERUSER',
    conditions.has_active_peer && 'há outra transação ativa em SETUP, APP ou MAINT',
  ].filter((reason): reason is string => Boolean(reason));
}
