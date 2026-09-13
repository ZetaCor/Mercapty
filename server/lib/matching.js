// Emparejamiento por nombre para productos sin código de barras (hoy: Riba
// Smith). Es conservador a propósito: mostrar como iguales dos productos
// distintos engaña al cliente, así que ante la duda cada uno queda por separado.
import { normalizeText, parseSize } from './normalize.js';

const STOPWORDS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'con', 'y', 'e', 'en', 'para', 'por', 'a', 'al', 'x', 'sabor', 'tipo']);

// Abreviaturas de los nombres cortados que usan algunos súper.
const ABBREVIATIONS = {
  c: 'con', d: 'de', p: 'para',
  desl: 'deslactosada', deslac: 'deslactosada', deslact: 'deslactosada', deslactosado: 'deslactosada',
  desc: 'descremada', descre: 'descremada', descrem: 'descremada', semidesc: 'semidescremada',
  intg: 'integral', integ: 'integral', choc: 'chocolate', chocol: 'chocolate', van: 'vainilla',
  org: 'organico', nat: 'natural', orig: 'original', ent: 'entera', trad: 'tradicional', tradic: 'tradicional',
};

// Palabras que separan variantes de un mismo producto: si solo uno de los
// nombres la tiene, se asume que son productos distintos.
const VARIANTS = new Set([
  'entera', 'descremada', 'semidescremada', 'deslactosada', 'light', 'lite', 'zero', 'diet', 'sin', 'integral',
  'chocolate', 'fresa', 'vainilla', 'natural', 'organico', 'picante', 'dulce', 'mini', 'evaporada', 'condensada',
  'polvo', 'liquido', 'pollo', 'res', 'cerdo', 'pavo', 'atun', 'blanco', 'blanca', 'negro', 'rojo', 'amarillo', 'verde',
]);

const stem = (t) => (t.length > 4 ? t.replace(/(es|s)$/, '') : t);

// Palabras que describen el producto: sin tildes, sin palabras vacías, con las
// abreviaturas expandidas y sin números (el tamaño se compara aparte).
export function nameTokens(text) {
  const out = [];
  for (const raw of normalizeText(text).split(' ')) {
    if (!raw || /^\d/.test(raw)) continue;
    const t = stem(ABBREVIATIONS[raw] ?? raw);
    if (!STOPWORDS.has(t) && !out.includes(t)) out.push(t);
  }
  return out;
}

// Iguales, o una es el comienzo de la otra (nombres cortados: "valenci" ~ "valenciana").
const same = (a, b) => a === b || (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a)));
const indexKey = (t) => t.slice(0, 4);

function compare(a, b) {
  const used = new Set();
  const unmatched = [];
  let matched = 0;
  for (const ta of a) {
    const j = b.findIndex((tb, i) => !used.has(i) && same(ta, tb));
    if (j === -1) unmatched.push(ta);
    else { used.add(j); matched++; }
  }
  b.forEach((tb, i) => { if (!used.has(i)) unmatched.push(tb); });
  return { dice: (2 * matched) / (a.length + b.length), unmatched };
}

// true: mismo tamaño (con 3 % de margen: 2 lb ≈ 908 g) · false: distinto · null: falta en alguno.
function sizesMatch(a, b) {
  if (!a || !b) return null;
  return a.unit === b.unit && Math.abs(a.value - b.value) <= 0.03 * Math.max(a.value, b.value);
}

const withSize = (p) => (p.sizeValue ? { value: p.sizeValue, unit: p.sizeUnit } : parseSize(p.name));

// products: [{ matchKey, name, brand, category, sizeValue, sizeUnit }] de otras tiendas.
// Devuelve findMatch(offer) -> { matchKey, name, score } o null.
export function createMatcher(products) {
  const entries = products.map((p) => ({
    ...p,
    tokens: [...new Set([...nameTokens(p.name), ...nameTokens(p.brand ?? '')])],
    size: withSize(p),
  }));
  const index = new Map();
  entries.forEach((entry, i) => {
    for (const k of new Set(entry.tokens.map(indexKey))) {
      if (!index.has(k)) index.set(k, []);
      index.get(k).push(i);
    }
  });

  // Sin marca o sin tamaño no se une: «Aceite de canola» puede ser de cualquier
  // marca y de cualquier tamaño, y compararlo con uno concreto engañaría.
  return function findMatch(offer) {
    const brand = nameTokens(offer.brand ?? '');
    const size = withSize(offer);
    if (!brand.length || !size) return null;
    const tokens = [...new Set([...nameTokens(offer.name), ...brand])];
    if (tokens.length < 2) return null;

    const hits = new Map();
    for (const k of new Set(tokens.map(indexKey))) {
      for (const i of index.get(k) ?? []) hits.set(i, (hits.get(i) ?? 0) + 1);
    }

    let best = null;
    for (const [i, count] of hits) {
      if (count < 2) continue;
      const c = entries[i];
      const known = (cat) => cat && cat !== 'Otros';
      if (known(offer.category) && known(c.category) && offer.category !== c.category) continue;
      if (sizesMatch(size, c.size) !== true) continue;
      if (!brand.every((b) => c.tokens.some((t) => same(b, t)))) continue;
      const { dice, unmatched } = compare(tokens, c.tokens);
      if (unmatched.some((t) => VARIANTS.has(t))) continue;
      if (dice < 0.75) continue;
      if (!best || dice > best.score) best = { matchKey: c.matchKey, name: c.name, score: dice };
    }
    return best;
  };
}
