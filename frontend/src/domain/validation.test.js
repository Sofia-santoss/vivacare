import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatBrazilPhone,
  isValidBrazilPhone,
  validateContactRequest,
  validateNps,
  validatePasswordConfirmation,
  validateRating,
} from './validation.js';

test('formata telefone brasileiro sem ultrapassar 11 dígitos', () => {
  assert.equal(formatBrazilPhone('11988881234'), '(11) 98888-1234');
  assert.equal(formatBrazilPhone('1133334444'), '(11) 3333-4444');
  assert.equal(formatBrazilPhone('(11) 98888-123499'), '(11) 98888-1234');
});

test('aceita telefone fixo e celular com DDD', () => {
  assert.equal(isValidBrazilPhone('(11) 3333-4444'), true);
  assert.equal(isValidBrazilPhone('(11) 98888-1234'), true);
});

test('recusa telefone curto, DDD inválido e número com formato incompatível', () => {
  for (const phone of ['1198888123', '(00) 98888-1234', '(11) 6888-1234', '(11) 88888-1234', '11111111111']) {
    assert.equal(isValidBrazilPhone(phone), false, phone);
  }
});

test('valida notas de satisfação inteiras de 1 a 5', () => {
  for (const rating of [1, 2, 3, 4, 5]) assert.equal(validateRating(rating), null);
  for (const rating of [0, 6, 1.5, null, undefined]) assert.equal(validateRating(rating)?.field, 'rating');
});

test('valida NPS inteiro de 0 a 10, incluindo zero', () => {
  for (const score of [0, 1, 9, 10]) assert.equal(validateNps(score), null);
  for (const score of [-1, 11, 2.5, null]) assert.equal(validateNps(score)?.field, 'nps');
});

test('valida relato, telefone e consentimento antes de preparar contato', () => {
  assert.equal(validateContactRequest({ statement: 'Relato', phone: '(11) 98888-1234', consent: true }), null);
  assert.equal(validateContactRequest({ statement: '  ', phone: '(11) 98888-1234', consent: true })?.field, 'statement');
  assert.equal(validateContactRequest({ statement: 'Relato', phone: '123', consent: true })?.field, 'phone');
  assert.equal(validateContactRequest({ statement: 'Relato', phone: '(11) 98888-1234', consent: false })?.field, 'consent');
});

test('confere tamanho mínimo e confirmação da nova senha', () => {
  assert.equal(validatePasswordConfirmation('senha-forte-2026', 'senha-forte-2026'), null);
  assert.equal(validatePasswordConfirmation('curta', 'curta')?.field, 'password');
  assert.equal(validatePasswordConfirmation('senha-forte-2026', 'outra-senha-2026')?.field, 'confirmation');
});