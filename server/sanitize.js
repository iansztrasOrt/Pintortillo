// Sanitización de entradas de usuarios. El cliente además renderiza siempre
// con textContent (nunca innerHTML con texto de usuarios).

const CONTROL = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g;

export function cleanText(value, max) {
  if (typeof value !== 'string') return '';
  return value.normalize('NFC').replace(CONTROL, '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function cleanName(value) {
  const n = cleanText(value, 20);
  return n.length ? n : null;
}

export function cleanCode(value) {
  if (typeof value !== 'string') return null;
  const c = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length >= 4 && c.length <= 8 ? c : null;
}
