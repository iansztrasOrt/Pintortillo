// Avatares propios en SVG: un "garabato" redondo con color, ojos, boca y accesorio.
// Solo se arma a partir de NÚMEROS validados (nunca texto de usuarios).

export const AVATAR_COLORS = [
  '#ff6b6b', '#ff9f43', '#feca57', '#1dd1a1', '#10ac84', '#48dbfb', '#2e86de', '#5f27cd',
  '#a55eea', '#ff9ff3', '#f368e0', '#c8d6e5', '#8395a7', '#576574', '#e17055', '#00b894',
  '#fd79a8', '#6c5ce7',
];

export const PARTS = Object.freeze({ c: AVATAR_COLORS.length, e: 8, m: 8, a: 10 });

export function normalizeAvatar(av) {
  const out = {};
  for (const [k, n] of Object.entries(PARTS)) {
    const v = Math.floor(Number(av && av[k]));
    out[k] = Number.isInteger(v) && v >= 0 && v < n ? v : 0;
  }
  return out;
}

export function randomAvatar(rng = Math.random) {
  return Object.fromEntries(Object.entries(PARTS).map(([k, n]) => [k, Math.floor(rng() * n)]));
}

const EYES = [
  // redondos
  '<circle cx="38" cy="45" r="7" fill="#fff"/><circle cx="62" cy="45" r="7" fill="#fff"/><circle cx="39" cy="46" r="3.6" fill="#1b1b2f"/><circle cx="63" cy="46" r="3.6" fill="#1b1b2f"/>',
  // felices ^ ^
  '<path d="M31 47 Q38 38 45 47" stroke="#1b1b2f" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M55 47 Q62 38 69 47" stroke="#1b1b2f" stroke-width="3.5" fill="none" stroke-linecap="round"/>',
  // dormidos
  '<path d="M31 45 Q38 51 45 45" stroke="#1b1b2f" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M55 45 Q62 51 69 45" stroke="#1b1b2f" stroke-width="3.5" fill="none" stroke-linecap="round"/>',
  // guiño
  '<circle cx="38" cy="45" r="7" fill="#fff"/><circle cx="39" cy="46" r="3.6" fill="#1b1b2f"/><path d="M55 46 L69 46" stroke="#1b1b2f" stroke-width="3.5" stroke-linecap="round"/>',
  // grandes
  '<ellipse cx="37" cy="44" rx="9" ry="11" fill="#fff"/><ellipse cx="63" cy="44" rx="9" ry="11" fill="#fff"/><circle cx="39" cy="47" r="5" fill="#1b1b2f"/><circle cx="65" cy="47" r="5" fill="#1b1b2f"/><circle cx="41" cy="44" r="1.6" fill="#fff"/><circle cx="67" cy="44" r="1.6" fill="#fff"/>',
  // enojados
  '<circle cx="38" cy="47" r="6" fill="#fff"/><circle cx="62" cy="47" r="6" fill="#fff"/><circle cx="38" cy="48" r="3" fill="#1b1b2f"/><circle cx="62" cy="48" r="3" fill="#1b1b2f"/><path d="M30 37 L45 42" stroke="#1b1b2f" stroke-width="3.5" stroke-linecap="round"/><path d="M70 37 L55 42" stroke="#1b1b2f" stroke-width="3.5" stroke-linecap="round"/>',
  // puntitos
  '<circle cx="39" cy="46" r="3.5" fill="#1b1b2f"/><circle cx="61" cy="46" r="3.5" fill="#1b1b2f"/>',
  // estrellas
  '<path d="M38 38 L40 44 L46 44 L41 48 L43 54 L38 50 L33 54 L35 48 L30 44 L36 44 Z" fill="#fff59d" stroke="#1b1b2f" stroke-width="1.5"/><path d="M62 38 L64 44 L70 44 L65 48 L67 54 L62 50 L57 54 L59 48 L54 44 L60 44 Z" fill="#fff59d" stroke="#1b1b2f" stroke-width="1.5"/>',
];

const MOUTHS = [
  '<path d="M38 63 Q50 74 62 63" stroke="#1b1b2f" stroke-width="3.5" fill="none" stroke-linecap="round"/>',
  '<path d="M37 61 Q50 80 63 61 Z" fill="#7b2d3b" stroke="#1b1b2f" stroke-width="2.5" stroke-linejoin="round"/><path d="M43 69 Q50 74 57 69" fill="#ff8a9a"/>',
  '<path d="M38 63 Q50 72 62 63" stroke="#1b1b2f" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M50 67 Q51 76 56 73 Q57 68 54 66" fill="#ff7a8a" stroke="#1b1b2f" stroke-width="1.5"/>',
  '<path d="M40 66 L60 66" stroke="#1b1b2f" stroke-width="3.5" stroke-linecap="round"/>',
  '<ellipse cx="50" cy="67" rx="5" ry="6" fill="#7b2d3b" stroke="#1b1b2f" stroke-width="2.5"/>',
  '<path d="M36 62 Q50 76 64 62 Z" fill="#fff" stroke="#1b1b2f" stroke-width="2.5" stroke-linejoin="round"/><path d="M43 63 L43 68 M50 63 L50 70 M57 63 L57 68" stroke="#1b1b2f" stroke-width="1.5"/>',
  '<path d="M40 66 Q52 70 61 61" stroke="#1b1b2f" stroke-width="3.5" fill="none" stroke-linecap="round"/>',
  '<path d="M38 70 Q50 60 62 70" stroke="#1b1b2f" stroke-width="3.5" fill="none" stroke-linecap="round"/>',
];

const ACCESSORIES = [
  '',
  // gorra
  '<path d="M22 30 Q50 6 78 30 Z" fill="#e84118" stroke="#1b1b2f" stroke-width="2.5"/><path d="M70 28 L92 32 L76 34 Z" fill="#c23616" stroke="#1b1b2f" stroke-width="2"/>',
  // corona
  '<path d="M30 26 L34 10 L42 20 L50 6 L58 20 L66 10 L70 26 Z" fill="#fbc531" stroke="#1b1b2f" stroke-width="2.5" stroke-linejoin="round"/><circle cx="50" cy="18" r="2.5" fill="#e84118"/>',
  // moño
  '<path d="M50 20 L34 10 L34 30 Z M50 20 L66 10 L66 30 Z" fill="#ff6fb5" stroke="#1b1b2f" stroke-width="2.5" stroke-linejoin="round"/><circle cx="50" cy="20" r="4.5" fill="#ff3d9a" stroke="#1b1b2f" stroke-width="2"/>',
  // auriculares
  '<path d="M20 52 Q20 12 50 12 Q80 12 80 52" stroke="#2f3640" stroke-width="5" fill="none"/><rect x="12" y="44" width="12" height="18" rx="5" fill="#00a8ff" stroke="#1b1b2f" stroke-width="2"/><rect x="76" y="44" width="12" height="18" rx="5" fill="#00a8ff" stroke="#1b1b2f" stroke-width="2"/>',
  // anteojos
  '<circle cx="38" cy="46" r="10" fill="none" stroke="#1b1b2f" stroke-width="3"/><circle cx="62" cy="46" r="10" fill="none" stroke="#1b1b2f" stroke-width="3"/><path d="M48 46 L52 46" stroke="#1b1b2f" stroke-width="3"/>',
  // flor
  '<g transform="translate(70 22)"><circle cx="0" cy="-7" r="5" fill="#fff"/><circle cx="7" cy="0" r="5" fill="#fff"/><circle cx="0" cy="7" r="5" fill="#fff"/><circle cx="-7" cy="0" r="5" fill="#fff"/><circle r="4" fill="#fbc531" stroke="#1b1b2f" stroke-width="1.5"/></g>',
  // cuernitos
  '<path d="M30 26 Q22 8 36 14 Z" fill="#e84118" stroke="#1b1b2f" stroke-width="2"/><path d="M70 26 Q78 8 64 14 Z" fill="#e84118" stroke="#1b1b2f" stroke-width="2"/>',
  // aureola
  '<ellipse cx="50" cy="10" rx="18" ry="5" fill="none" stroke="#fbc531" stroke-width="4"/>',
  // gorro de fiesta
  '<path d="M38 24 L50 0 L62 24 Z" fill="#9c88ff" stroke="#1b1b2f" stroke-width="2.5" stroke-linejoin="round"/><circle cx="50" cy="2" r="4" fill="#fbc531" stroke="#1b1b2f" stroke-width="1.5"/><path d="M42 16 L58 16" stroke="#fbc531" stroke-width="3"/>',
];

/** Devuelve el SVG del avatar como string (solo con partes predefinidas). */
export function avatarSvg(avatar, size = 48) {
  const a = normalizeAvatar(avatar);
  const color = AVATAR_COLORS[a.c];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 108 108" width="${size}" height="${size}" aria-hidden="true">`
    + `<path d="M50 14 C74 12 90 28 88 52 C87 76 72 90 50 89 C27 90 12 76 12 52 C11 28 26 15 50 14 Z" fill="${color}" stroke="#1b1b2f" stroke-width="3.5"/>`
    + '<ellipse cx="34" cy="30" rx="8" ry="5" fill="#fff" opacity=".35"/>'
    + `<circle cx="27" cy="60" r="5" fill="#ff7675" opacity=".35"/><circle cx="73" cy="60" r="5" fill="#ff7675" opacity=".35"/>`
    + EYES[a.e] + MOUTHS[a.m] + ACCESSORIES[a.a]
    + '</svg>';
}
