import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateNps, isRuleMet } from '../src/metrics.js';

test('NPS classifica promotores, neutros e detratores', () => {
  assert.equal(calculateNps([10, 9, 8, 7, 6, 0]), 0);
  assert.equal(calculateNps([10, 9]), 100);
  assert.equal(calculateNps([0, 6]), -100);
});

test('NPS ignora valores fora da escala e retorna null sem respostas válidas', () => {
  assert.equal(calculateNps([11, -1, 8.5]), null);
  assert.equal(calculateNps([]), null);
});

test('regra condicional avalia limites numéricos inclusivos e exclusivos', () => {
  assert.equal(isRuleMet(6, { operator: 'LT', threshold: 7 }), true);
  assert.equal(isRuleMet(7, { operator: 'LT', threshold: 7 }), false);
  assert.equal(isRuleMet(7, { operator: 'LTE', threshold: 7 }), true);
  assert.equal(isRuleMet('6', { operator: 'LT', threshold: 7 }), false);
});
