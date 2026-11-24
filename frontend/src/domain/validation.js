const repeatedDigits = /^(\d)\1+$/;

export function formatBrazilPhone(value) {
  const digits = String(value).replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : '';

  const areaCode = digits.slice(0, 2);
  const subscriber = digits.slice(2);
  if (subscriber.length <= 4) return `(${areaCode}) ${subscriber}`;
  if (digits.length <= 10) {
    return `(${areaCode}) ${subscriber.slice(0, 4)}-${subscriber.slice(4)}`;
  }
  return `(${areaCode}) ${subscriber.slice(0, 5)}-${subscriber.slice(5)}`;
}

export function isValidBrazilPhone(value) {
  const digits = String(value).replace(/\D/g, '');
  if (repeatedDigits.test(digits) || !/^[1-9][1-9]/.test(digits)) return false;

  const subscriber = digits.slice(2);
  if (digits.length === 10) return /^[2-5]\d{7}$/.test(subscriber);
  if (digits.length === 11) return /^9\d{8}$/.test(subscriber);
  return false;
}

export function validateRating(value) {
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    return { field: 'rating', message: 'Escolha uma nota de 1 a 5 para continuar.' };
  }
  return null;
}

export function validateNps(value) {
  if (!Number.isInteger(value) || value < 0 || value > 10) {
    return { field: 'nps', message: 'Escolha uma nota de 0 a 10 para continuar.' };
  }
  return null;
}

export function validateContactRequest({ statement, phone, consent }) {
  if (typeof statement !== 'string' || !statement.trim()) {
    return { field: 'statement', message: 'Conte brevemente sua experiência para continuar.' };
  }
  if (!isValidBrazilPhone(phone)) {
    return { field: 'phone', message: 'Informe um telefone válido com DDD para retorno.' };
  }
  if (consent !== true) {
    return { field: 'consent', message: 'Aceite o termo de consentimento para solicitar o contato da Ouvidoria.' };
  }
  return null;
}

export function validatePasswordConfirmation(password, confirmation) {
  if (typeof password !== 'string' || password.length < 10) {
    return { field: 'password', message: 'A nova senha precisa ter pelo menos 10 caracteres.' };
  }
  if (password !== confirmation) {
    return { field: 'confirmation', message: 'A confirmação não corresponde à nova senha. Confira os campos.' };
  }
  return null;
}