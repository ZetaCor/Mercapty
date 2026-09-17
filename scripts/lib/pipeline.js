// Pasos comunes de los bots (scripts/ingest.js y scripts/super99.js): pasar lo
// que trae cada tienda al formato de la base y unir por nombre lo que no se une
// por código de barras.
import { storeSearchUrl } from '../../connectors/util.js';
import { canonicalCategory, categoryFromName, matchKey, normalizeGtin, parsePack, parseSize, OWN_CATEGORIES } from '../../server/lib/normalize.js';
import { createMatcher } from '../../server/lib/matching.js';

// Convierte la oferta cruda de cualquier conector al formato que guarda la base.
export function normalizeOffer(store, raw) {
  const price = Number(raw.price);
  const name = String(raw.name ?? '').trim();
  if (!name || !Number.isFinite(price) || price <= 0) return null;

  const listPrice = Number(raw.listPrice);
  const sizeLabel = String(raw.size ?? '').trim() || null;
  const size = parseSize(sizeLabel ?? '') ?? parseSize(raw.title ?? name);
  const pack = Math.max(size?.count ?? 1, parsePack(raw.title ?? name));
  // "946 ml (Pack de 12)": el tamaño del nombre es de una unidad; el total son 12 × 946 ml.
  const sizeValue = size ? (size.count > 1 ? size.value : size.value * pack) : null;
  return {
    sku: raw.sku ? String(raw.sku) : null,
    gtin: normalizeGtin(raw.gtin),
    title: raw.title ?? name,
    name,
    brand: String(raw.brand ?? '').trim() || null,
    category: canonicalCategory(raw.category, name),
    // Categoría más específica de la tienda ("Sodas"): sirve para buscar.
    categoryLeaf: String(raw.category ?? '').split(/[/>|]/).map((s) => s.trim()).filter(Boolean).pop() ?? '',
    sizeLabel,
    sizeValue,
    sizeUnit: size?.unit ?? null,
    pack,
    price,
    listPrice: listPrice > price ? listPrice : null,
    inStock: raw.inStock !== false,
    url: raw.url || storeSearchUrl(store, raw.title ?? name),
    imageUrl: /^https?:\/\//i.test(String(raw.image ?? '')) ? String(raw.image) : null,
  };
}

// Al final de cada corrida, cada producto queda en la categoría que dice su
// nombre («Arepa de maíz» -> Panadería y snacks), la misma venga de la tienda
// que venga: así se corrigen los que una tienda había puesto donde no iban
// (su sección «Refrigerados» no dice qué es el producto). Devuelve cuántos cambiaron.
// Los productos de las tiendas que no son súper ya vienen en su categoría buena y no se
// tocan: aquí solo se arregla lo que las tiendas de súper guardaron en la sección
// equivocada (ver OWN_CATEGORIES en server/lib/normalize.js).
export async function recategorize(db) {
  const propias = new Set(OWN_CATEGORIES.values());
  const changes = (await db.all('SELECT id, name, category FROM products'))
    .map((p) => ({ id: p.id, from: p.category, to: categoryFromName(p.name) }))
    .filter((c) => c.to && c.to !== c.from && !propias.has(c.from));
  for (let i = 0; i < changes.length; i += 200) {
    await db.batch(changes.slice(i, i + 200).map((c) => ({ sql: 'UPDATE products SET category = ? WHERE id = ?', args: [c.to, c.id] })));
  }
  return changes.length;
}

// Productos que las demás tiendas tienen disponibles: contra ellos se une por
// nombre. Cada producto de otra tienda se une como máximo con uno de esta en
// toda la corrida, aunque se guarde por tandas.
export async function loadMatcher(db, storeId) {
  const candidates = await db.all(`
    SELECT p.match_key AS matchKey, p.name, p.brand, p.category
    FROM products p
    WHERE EXISTS (SELECT 1 FROM offers o WHERE o.product_id = p.id AND o.store_id <> ? AND o.in_stock = 1)
  `, [storeId]);
  return { known: new Set(candidates.map((c) => c.matchKey)), findMatch: createMatcher(candidates), taken: new Set() };
}

// Productos sin código de barras, o con uno que ninguna otra tienda usa (cada
// súper puede usar otro código para lo mismo): se intenta unir cada uno con el
// mismo producto de otra tienda (ver server/lib/matching.js); gana el parecido
// más alto. Devuelve cuántos se unieron.
export function attachByName(offers, matcher) {
  const proposals = offers
    .filter((o) => !o.gtin || !matcher.known.has(matchKey(o)))
    .map((offer) => ({ offer, match: matcher.findMatch(offer) }))
    .filter((p) => p.match)
    .sort((a, b) => b.match.score - a.match.score);
  let joined = 0;
  for (const { offer, match } of proposals) {
    if (matcher.taken.has(match.matchKey)) continue;
    matcher.taken.add(match.matchKey);
    offer.matchKey = match.matchKey;
    joined++;
    if (process.env.INGEST_SHOW_MATCHES) console.log(`  ${offer.name} [${offer.brand}]  ⇄  ${match.name}  (${match.score.toFixed(2)})`);
  }
  return joined;
}
