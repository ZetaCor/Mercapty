// Emparejamiento por nombre para productos sin código de barras (Riba Smith) o
// con un código que ninguna otra tienda usa. Es conservador a propósito:
// mostrar como iguales dos productos distintos engaña al cliente, así que ante
// la duda cada uno queda por separado.
import { normalizeText, parsePack, parseSize } from './normalize.js';

const STOPWORDS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'con', 'y', 'e', 'en', 'para', 'por', 'a', 'al', 'x', 'sabor', 'tipo']);

// Palabras de empaque, de venta o de medida que cada súper pone o no: no
// distinguen productos (el tamaño se compara aparte).
const NOISE = new Set([
  'uht', 'uth', 'pura', 'puro', 'suelta', 'suelto', 'tba', 'tetra', 'tetrapak', 'pak', 'caja', 'botella', 'lata',
  'bolsa', 'frasco', 'sobre', 'envase', 'pack', 'paquete', 'unidad', 'und', 'unid', 'un', 'u', 'pieza', 'pza',
  'oferta', 'promo', 'nuevo', 'nueva', 'gratis',
  'g', 'gr', 'grs', 'gramo', 'kg', 'kilo', 'lb', 'lbs', 'libra', 'oz', 'onz', 'onza', 'ml', 'l', 'lt', 'lts', 'litro',
  'gal', 'galon', 'cc', 'ct',
]);

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
  'soya', 'girasol', 'canola', 'oliva', 'maiz', 'coco', 'almendra', 'avena', 'palma',
]);

const stem = (t) => (t.length > 4 ? t.replace(/(es|s)$/, '') : t);

// Palabras que describen el producto: sin tildes, sin palabras vacías ni de
// relleno, con las abreviaturas expandidas y sin números (el tamaño va aparte).
export function nameTokens(text) {
  const out = [];
  for (const raw of normalizeText(text).split(' ')) {
    if (!raw || /^\d/.test(raw)) continue;
    const t = stem(ABBREVIATIONS[raw] ?? raw);
    if (!STOPWORDS.has(t) && !NOISE.has(t) && !out.includes(t)) out.push(t);
  }
  return out;
}

// Iguales, o una es el comienzo de la otra (nombres cortados: "valenci" ~ "valenciana").
const same = (a, b) => a === b || (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a)));
const indexKey = (t) => t.slice(0, 4);

function compare(a, b) {
  const used = new Set();
  const onlyA = [];
  let matched = 0;
  for (const ta of a) {
    const j = b.findIndex((tb, i) => !used.has(i) && same(ta, tb));
    if (j === -1) onlyA.push(ta);
    else { used.add(j); matched++; }
  }
  const onlyB = b.filter((tb, i) => !used.has(i));
  return {
    dice: a.length + b.length ? (2 * matched) / (a.length + b.length) : 0,
    unmatched: [...onlyA, ...onlyB],
    // Cada nombre tiene una palabra que el otro no ("girasol" / "soya"): otro producto.
    bothSidesDiffer: onlyA.length > 0 && onlyB.length > 0,
  };
}

// Tamaño de una unidad y cantidad de unidades: "946 ml (Pack de 12)" -> 946 ml × 12.
export function packAndSize(name, sizeLabel) {
  const size = parseSize(sizeLabel ?? '') ?? parseSize(name);
  if (!size) return null;
  const pack = Math.max(size.count, parsePack(name));
  return { value: size.count > 1 ? size.value / size.count : size.value, unit: size.unit, pack };
}

// true: mismo tamaño y misma cantidad de unidades (3 % de margen: 2 lb ≈ 908 g)
// false: distinto · null: falta en alguno.
function sizesMatch(a, b) {
  if (!a || !b) return null;
  return a.unit === b.unit && a.pack === b.pack && Math.abs(a.value - b.value) <= 0.03 * Math.max(a.value, b.value);
}

// Parecido entre dos nombres (0 a 1) y si difieren en una variante (entera/descremada...).
export function nameSimilarity(a, b) {
  const { dice, unmatched } = compare(nameTokens(a), nameTokens(b));
  return { score: dice, variantConflict: unmatched.some((t) => VARIANTS.has(t)) };
}

// products: [{ matchKey, name, brand, category }] de otras tiendas.
// Devuelve findMatch(offer) -> { matchKey, name, score } o null.
export function createMatcher(products) {
  const entries = products.map((p) => {
    const nameWords = nameTokens(p.name);
    return {
      ...p,
      nameWords, // el parecido se mide solo con el nombre: el campo «marca» viene mal en algunas tiendas
      tokens: [...new Set([...nameWords, ...nameTokens(p.brand ?? '')])], // para buscar candidatos y la marca
      size: packAndSize(p.name),
    };
  });
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
    const size = packAndSize(offer.title ?? offer.name, offer.sizeLabel);
    if (!brand.length || !size) return null;
    const nameWords = nameTokens(offer.name);
    const tokens = [...new Set([...nameWords, ...brand])];
    if (nameWords.length < 2) return null;

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
      const { dice, unmatched, bothSidesDiffer } = compare(nameWords, c.nameWords);
      if (bothSidesDiffer || unmatched.some((t) => VARIANTS.has(t))) continue;
      if (dice < 0.75) continue;
      if (!best || dice > best.score) best = { matchKey: c.matchKey, name: c.name, score: dice };
    }
    return best;
  };
}
