export function calculateNps(scores) {
  const valid = scores.filter((score) => Number.isInteger(score) && score >= 0 && score <= 10);
  if (!valid.length) return null;
  const promoters = valid.filter((score) => score >= 9).length;
  const detractors = valid.filter((score) => score <= 6).length;
  return Math.round(((promoters - detractors) / valid.length) * 100);
}

export function isRuleMet(value, rule) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  if (rule.operator === 'LT') return value < rule.threshold;
  if (rule.operator === 'LTE') return value <= rule.threshold;
  if (rule.operator === 'EQ') return value === rule.threshold;
  return false;
}
