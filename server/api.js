import { canonicalCategory, normalizeText, parsePack, parseSize, productPath, unitPrice } from './lib/normalize.js';
import { nameSimilarity } from './lib/matching.js';

const round2 = (n) => Math.round(n * 100) / 100;

// Ofertas disponibles ordenadas por precio dentro de cada producto; rn = 1 es la más barata.
const RANKED = `
  WITH ranked AS (
    SELECT o.*,
      ROW_NUMBER() OVER (PARTITION BY o.product_id ORDER BY o.price, o.store_id) AS rn,
      COUNT(*)     OVER (PARTITION BY o.product_id) AS store_count,
      MAX(o.price) OVER (PARTITION BY o.product_id) AS max_price,
      -- todas las tiendas que lo tienen, de la más barata a la más cara
      group_concat(o.store_id, ',') OVER (PARTITION BY o.product_id ORDER BY o.price, o.store_id
        ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS store_ids
    FROM offers o
    WHERE o.in_stock = 1
  )`;
const BEST_OFFER_COLUMNS = `
  p.*, r.id AS offer_id, r.price, r.list_price, r.store_id, r.store_count, r.max_price, r.store_ids`;

const SORTS = {
  nombre: 'p.name, p.brand',
  precio: 'r.price ASC',
  ahorro: '(r.max_price - r.price) DESC, r.price ASC',
};

// --- Búsqueda por relevancia ---

const SEARCH_STOPWORDS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'con', 'y', 'en', 'para', 'por', 'a', 'al']);

// Singular de lo que escribe el cliente, para encontrar ambas formas:
// "leches" -> "leche", "frijoles" -> "frijol", "galletas" -> "galleta".
function searchStem(t) {
  if (t.length > 4 && t.endsWith('es') && /[lnrdzj]$/.test(t.slice(0, -2))) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1);
  return t;
}

// Palabras distintas para lo mismo, como las dice la gente en Panamá.
const SYNONYMS = {
  soda: ['refresco', 'gaseosa'], refresco: ['soda', 'gaseosa'], gaseosa: ['soda', 'refresco'],
  guineo: ['banano'], banano: ['guineo'], papita: ['chip'], cocacola: ['coca'],
};

// Variantes que, si el cliente no las pidió, van después de la versión normal
// (al buscar «coca cola», primero la normal y luego la Zero o la Sin azúcar).
const SEARCH_VARIANTS = new Set(['zero', 'cero', 'sin', 'light', 'lite', 'diet', 'dietetica', 'descafeinado', 'sugar']);

// Palabras genéricas con las que los súper empiezan el nombre («Soda Coca Cola…»,
// «Ron Flor de Caña…»): la palabra siguiente también cuenta como inicio del nombre.
const GENERIC_LEADS = new Set([
  'soda', 'refresco', 'gaseosa', 'bebida', 'jugo', 'agua', 'pack', 'paquete', 'caja', 'six',
  'ron', 'seco', 'vino', 'licor', 'cerveza', 'whisky', 'vodka', 'ginebra', 'tequila',
  'leche', 'arroz', 'aceite', 'cafe', 'atun', 'queso', 'galletas', 'cereal', 'jabon', 'detergente', 'shampoo',
]);
const PACK_WORDS = new Set(['pack', 'paquete', 'caja', 'six']);

// Productos que casi siempre se buscan en su versión básica: al buscar «leche»,
// primero la entera, descremada o deslactosada, y después la de chocolate, la
// evaporada o la de coco (salvo que el cliente escriba esa palabra).
const PLAIN_FIRST = {
  leche: {
    prefer: new Set(['entera', 'descremada', 'semidescremada', 'deslactosada', 'fresca', 'pura', 'uht']),
    avoid: new Set([
      'chocolate', 'chocolatada', 'chocolatado', 'chocorico', 'cocoa', 'vainilla', 'fresa', 'banano', 'mani', 'cafe',
      'capuchino', 'saborizada', 'saborizado', 'sabor', 'malteada', 'malteado', 'avena', 'coco', 'almendra',
      'almendras', 'soya', 'soja', 'arroz', 'evaporada', 'condensada', 'polvo', 'cabra', 'dulce', 'fermentada',
    ]),
  },
};

// Cada palabra buscada con sus alternativas: [["soda", "refresco", "gaseosa"], ["coca"]].
function queryTerms(q) {
  const words = [...new Set(normalizeText(q).split(' ').filter((t) => t && !SEARCH_STOPWORDS.has(t)).map(searchStem))];
  return words.slice(0, 8).map((w) => [w, ...(SYNONYMS[w] ?? [])]);
}

// Qué tan bien responde un producto a la búsqueda. Primero lo que ES el
// producto buscado («Leche Entera…» al buscar «leche»), después lo que solo lo
// contiene («Arroz con leche», «Jabón de leche de coco»).
function relevance(row, terms, intent) {
  const name = normalizeText(row.name);
  const words = name.split(' ');
  const inName = (alts) => alts.some((a) => words.some((w) => w.startsWith(a)));
  let matched = 0;
  let score = 0;
  for (const alts of terms) {
    if (inName(alts)) { matched++; score += 15; }
    // en la marca, la categoría de la tienda o el nombre que le da otro súper
    else if (alts.some((a) => row.search_text.includes(a))) { matched++; score += 5; }
  }
  // El nombre empieza por algo de lo buscado («Leche…» al buscar «leche»,
  // «Flor de Caña…» al buscar «ron flor de caña»).
  const lead = GENERIC_LEADS.has(words[0]) ? words[1] : words[0];
  if (terms.some((alts) => alts.some((a) => words[0]?.startsWith(a) || lead?.startsWith(a)))) score += 40;
  // Palabras juntas y en orden, en este nombre o en el que le da otra tienda.
  const phrase = terms.map((alts) => alts[0]).join(' ');
  const content = (text) => text.split(' ').filter((w) => !SEARCH_STOPWORDS.has(w)).join(' ');
  if (terms.length > 1 && (content(name).includes(phrase) || content(row.search_text).includes(phrase))) score += 25;
  if (new RegExp(`(^| )(de|con) ${terms[0][0]}`).test(name)) score -= 15;
  const asked = new Set(terms.flat());
  score -= Math.min(24, 12 * words.filter((w) => SEARCH_VARIANTS.has(w) && !asked.has(w)).length);
  for (const alts of terms) {
    const rule = PLAIN_FIRST[alts[0]];
    if (!rule) continue;
    if (words.some((w) => rule.avoid.has(w) && !asked.has(w))) score -= 25;
    else if (words.some((w) => rule.prefer.has(w))) score += 10;
  }
  // La unidad antes que los paquetes, salvo que el cliente pida un paquete.
  const pack = Math.max(parsePack(row.name), parseSize(row.name)?.count ?? 1); // «Pack de 12», «6 x 355 ml»
  if (![...asked].some((a) => PACK_WORDS.has(a)) && pack > 1) score -= 15;
  if (intent !== 'Otros' && row.category === intent) score += 20;
  score += Math.min(18, 6 * (row.store_count - 1)); // los que se comparan en varias tiendas, antes
  return { score, matched };
}

const RELEVANCE_SORTS = {
  relevancia: (a, b) => b.score - a.score || b.row.store_count - a.row.store_count || a.row.price - b.row.price,
  precio: (a, b) => a.row.price - b.row.price,
  ahorro: (a, b) => (b.row.max_price - b.row.price) - (a.row.max_price - a.row.price) || a.row.price - b.row.price,
  nombre: (a, b) => a.row.name.localeCompare(b.row.name, 'es'),
};

function productSummary(row) {
  return {
    id: row.id,
    path: productPath(row.id, row.name),
    name: row.name,
    brand: row.brand,
    category: row.category,
    size: row.size_label,
    image: row.custom_image ?? row.image_url ?? null,
    bestPrice: row.price,
    bestListPrice: row.list_price,
    bestStoreId: row.store_id,
    bestOfferId: row.offer_id,
    storeCount: row.store_count,
    storeIds: row.store_ids ? String(row.store_ids).split(',') : [row.store_id],
    maxPrice: row.max_price,
    savings: round2(row.max_price - row.price),
    unitPrice: unitPrice(row.price, row.size_value, row.size_unit),
  };
}

export function createApi(db) {
  async function meta() {
    const row = await db.get(`
      SELECT (SELECT COUNT(*) FROM products) AS products,
        (SELECT COUNT(*) FROM offers WHERE in_stock = 1) AS offers,
        (SELECT MAX(updated_at) FROM offers) AS updatedAt,
        (SELECT COUNT(*) FROM stores WHERE source = 'demo') AS demoStores`);
    return { demo: row.demoStores > 0, products: row.products, offers: row.offers, updatedAt: row.updatedAt };
  }

  function listStores() {
    return db.all(`
      ${RANKED}
      SELECT s.id, s.name, s.homepage, s.platform, s.color, s.source, s.logo, s.icon, s.logo_bg AS logoBg,
        (SELECT COUNT(*) FROM offers o WHERE o.store_id = s.id AND o.in_stock = 1) AS offers,
        (SELECT MAX(updated_at) FROM offers o WHERE o.store_id = s.id) AS updatedAt,
        (SELECT COUNT(*) FROM ranked r WHERE r.store_id = s.id AND r.rn = 1 AND r.store_count > 1) AS bestCount,
        (SELECT COUNT(*) FROM clicks c JOIN offers o ON o.id = c.offer_id WHERE o.store_id = s.id) AS clicks
      FROM stores s
      ORDER BY bestCount DESC, s.name
    `);
  }

  // Solo categorías con algo disponible, para no mostrar filtros vacíos.
  function listCategories() {
    return db.all(`
      SELECT p.category AS name, COUNT(DISTINCT p.id) AS count
      FROM products p JOIN offers o ON o.product_id = p.id AND o.in_stock = 1
      GROUP BY p.category ORDER BY count DESC
    `);
  }

  async function searchProducts({ q = '', category = '', sort = '', limit = 24, offset = 0 }) {
    const join = 'FROM products p JOIN ranked r ON r.product_id = p.id AND r.rn = 1';
    const terms = queryTerms(q);

    // Sin palabras (por ejemplo, una categoría): orden directo en la base.
    if (!terms.length) {
      const whereSql = category ? 'WHERE p.category = ?' : '';
      const params = category ? [category] : [];
      const [count, rows] = await Promise.all([
        db.get(`${RANKED} SELECT COUNT(*) AS total ${join} ${whereSql}`, params),
        db.all(`
          ${RANKED} SELECT ${BEST_OFFER_COLUMNS} ${join} ${whereSql}
          ORDER BY ${SORTS[sort] ?? SORTS.nombre} LIMIT ? OFFSET ?
        `, [...params, limit, offset]),
      ]);
      return { total: count.total, approximate: false, items: rows.map(productSummary) };
    }

    // Con palabras: primero los productos que tienen todas (cada palabra o un
    // sinónimo), ordenados por relevancia; así un catálogo grande no deja
    // fuera lo buscado. Si ninguno las tiene todas, los que tienen alguna.
    const byWords = (groups, joiner) => {
      const where = [groups.map((alts) => `(${alts.map(() => 'p.search_text LIKE ?').join(' OR ')})`).join(joiner)];
      const params = groups.flat().map((t) => `%${t}%`);
      if (category) {
        where.push('p.category = ?');
        params.push(category);
      }
      return db.all(`${RANKED} SELECT ${BEST_OFFER_COLUMNS} ${join} WHERE (${where.join(') AND (')}) LIMIT 5000`, params);
    };
    let rows = await byWords(terms, ' AND ');
    let approximate = false;
    if (!rows.length && terms.length > 1) {
      rows = await byWords([terms.flat()], ' OR ');
      approximate = rows.length > 0;
    }
    const intent = canonicalCategory(q);
    const scored = rows.map((row) => ({ row, ...relevance(row, terms, intent) }));
    const pool = approximate ? scored : scored.filter((s) => s.matched === terms.length);
    pool.sort(RELEVANCE_SORTS[sort] ?? RELEVANCE_SORTS.relevancia);
    return { total: pool.length, approximate, items: pool.slice(offset, offset + limit).map((s) => productSummary(s.row)) };
  }

  // Productos donde elegir bien la tienda ahorra más dinero.
  async function deals(limit = 8) {
    const rows = await db.all(`
      ${RANKED} SELECT ${BEST_OFFER_COLUMNS}
      FROM products p JOIN ranked r ON r.product_id = p.id AND r.rn = 1
      WHERE r.store_count > 1
      ORDER BY (r.max_price - r.price) DESC LIMIT ?
    `, [limit]);
    return rows.map(productSummary);
  }

  // Productos de otras tiendas que se parecen pero no se unieron (otro nombre u
  // otra presentación): se muestran aparte para que el cliente compare.
  async function similarProducts(p, storeIds) {
    const words = normalizeText(p.name).split(' ').filter((w) => w.length >= 4 && !/^\d/.test(w));
    const keys = [...new Set(words)].sort((a, b) => b.length - a.length).slice(0, 2);
    if (!keys.length) return [];
    const rows = await db.all(`
      ${RANKED} SELECT ${BEST_OFFER_COLUMNS}
      FROM products p JOIN ranked r ON r.product_id = p.id AND r.rn = 1
      WHERE p.id <> ? AND ${keys.map(() => 'p.search_text LIKE ?').join(' AND ')}
      LIMIT 300
    `, [p.id, ...keys.map((k) => `%${k}%`)]);
    const sameCategory = (row) => !p.category || p.category === 'Otros' || row.category === p.category;
    return rows
      .filter((row) => row.store_count > 1 || !storeIds.has(row.store_id)) // que aporte otra tienda
      .map((row) => ({ row, ...nameSimilarity(`${p.brand ?? ''} ${p.name}`, `${row.brand ?? ''} ${row.name}`) }))
      .filter((s) => s.score >= 0.6 && !s.variantConflict && sameCategory(s.row))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((s) => productSummary(s.row));
  }

  async function getProduct(id) {
    const [p, offers, history] = await Promise.all([
      db.get('SELECT * FROM products WHERE id = ?', [id]),
      db.all(`
        SELECT o.id, o.store_id, o.title, o.price, o.list_price, o.in_stock, o.updated_at,
          s.name AS store_name, s.color AS store_color, s.source AS store_source
        FROM offers o JOIN stores s ON s.id = o.store_id
        WHERE o.product_id = ?
        ORDER BY o.in_stock DESC, o.price ASC
      `, [id]),
      db.all(`
        SELECT substr(h.seen_at, 1, 10) AS day, MIN(h.price) AS price
        FROM price_history h JOIN offers o ON o.id = h.offer_id
        WHERE o.product_id = ?
        GROUP BY day ORDER BY day
      `, [id]),
    ]);
    if (!p) return null;

    const similar = await similarProducts(p, new Set(offers.map((o) => o.store_id)));
    const available = offers.filter((o) => o.in_stock);
    const best = available[0];
    const worst = available.at(-1);
    return {
      id: p.id,
      path: productPath(p.id, p.name),
      name: p.name,
      brand: p.brand,
      category: p.category,
      size: p.size_label,
      gtin: p.gtin,
      image: p.custom_image ?? p.image_url ?? null,
      hasCustomImage: Boolean(p.custom_image),
      bestPrice: best?.price ?? null,
      savings: best ? round2(worst.price - best.price) : 0,
      offers: offers.map((o) => ({
        id: o.id,
        storeId: o.store_id,
        storeName: o.store_name,
        storeColor: o.store_color,
        storeSource: o.store_source,
        title: o.title,
        price: o.price,
        listPrice: o.list_price,
        inStock: Boolean(o.in_stock),
        updatedAt: o.updated_at,
        unitPrice: unitPrice(o.price, p.size_value, p.size_unit),
        isBest: o === best,
        diff: best && o.in_stock ? round2(o.price - best.price) : null,
      })),
      history,
      similar,
    };
  }

  // Dada una lista de compras, compara: todo en una sola tienda vs. repartir
  // cada producto en la tienda donde está más barato.
  async function optimizeList(rawItems) {
    const qtyById = new Map();
    for (const item of Array.isArray(rawItems) ? rawItems.slice(0, 100) : []) {
      const id = Number(item?.productId);
      if (!Number.isInteger(id)) continue;
      qtyById.set(id, Math.min(99, Math.max(1, Math.floor(Number(item.qty) || 1))));
    }
    const ids = [...qtyById.keys()];
    if (!ids.length) return { split: { total: 0, stores: [] }, perStore: [], unavailable: [], considered: 0, thumbs: {}, bestSingle: null, savings: null };

    const marks = ids.map(() => '?').join(',');
    const [productRows, offerRows, stores] = await Promise.all([
      db.all(`SELECT id, name, brand, category, size_label, image_url, custom_image FROM products WHERE id IN (${marks})`, ids),
      db.all(`SELECT id, product_id, store_id, price FROM offers WHERE in_stock = 1 AND product_id IN (${marks}) ORDER BY price`, ids),
      db.all('SELECT id, name, color FROM stores'),
    ]);
    const products = new Map(productRows.map((p) => [p.id, p]));
    const offersByProduct = new Map();
    for (const o of offerRows) {
      if (!offersByProduct.has(o.product_id)) offersByProduct.set(o.product_id, []);
      offersByProduct.get(o.product_id).push(o);
    }
    const storeById = new Map(stores.map((s) => [s.id, s]));
    const label = (p) => [p.name, p.brand, p.size_label].filter(Boolean).join(' · ');

    const splitByStore = new Map();
    const unavailable = [];
    let splitTotal = 0;
    for (const id of ids) {
      const product = products.get(id);
      if (!product) continue;
      const cheapest = offersByProduct.get(id)?.[0];
      if (!cheapest) { unavailable.push(label(product)); continue; }
      const qty = qtyById.get(id);
      const store = storeById.get(cheapest.store_id);
      if (!splitByStore.has(store.id)) {
        splitByStore.set(store.id, { storeId: store.id, storeName: store.name, storeColor: store.color, subtotal: 0, lines: [] });
      }
      const group = splitByStore.get(store.id);
      const subtotal = cheapest.price * qty;
      group.lines.push({ productId: id, path: productPath(id, product.name), label: label(product), qty, price: cheapest.price, subtotal: round2(subtotal), offerId: cheapest.id });
      group.subtotal = round2(group.subtotal + subtotal);
      splitTotal += subtotal;
    }

    // Dos tiendas a las que les faltan productos distintos no se pueden comparar
    // por su total a secas: lo que falta se valora al mejor precio de otra tienda.
    const perStore = stores.map((store) => {
      let total = 0;
      let fillIn = 0;
      const missing = [];
      for (const id of ids) {
        const offers = offersByProduct.get(id);
        if (!offers) continue; // no está en ninguna tienda: no penaliza a nadie
        const qty = qtyById.get(id);
        const offer = offers.find((o) => o.store_id === store.id);
        if (offer) total += offer.price * qty;
        else {
          missing.push(label(products.get(id)));
          fillIn += offers[0].price * qty;
        }
      }
      return {
        storeId: store.id, storeName: store.name, storeColor: store.color,
        total: round2(total), comparableTotal: round2(total + fillIn), missing, complete: missing.length === 0,
      };
    })
      .filter((s) => s.total > 0)
      .sort((a, b) => a.missing.length - b.missing.length || a.comparableTotal - b.comparableTotal);

    const bestSingle = perStore[0] ?? null;
    return {
      split: { total: round2(splitTotal), stores: [...splitByStore.values()].sort((a, b) => b.subtotal - a.subtotal) },
      perStore,
      unavailable,
      considered: ids.filter((id) => offersByProduct.has(id)).length,
      thumbs: Object.fromEntries(productRows.map((p) => [
        p.id, { image: p.custom_image ?? p.image_url ?? null, category: p.category },
      ])),
      bestSingle,
      savings: bestSingle?.complete ? round2(bestSingle.total - splitTotal) : null,
    };
  }

  // Registra el clic y devuelve la URL de la tienda con parámetros UTM, para
  // que la tienda pueda atribuir la venta a Mercapty. Solo se redirige a
  // URLs guardadas por los conectores, nunca a una recibida en la petición.
  async function redirectTarget(offerId) {
    const row = await db.get(`
      SELECT o.id, o.url, s.homepage FROM offers o JOIN stores s ON s.id = o.store_id WHERE o.id = ?
    `, [offerId]);
    if (!row) return null;
    await db.run('INSERT INTO clicks (offer_id, clicked_at) VALUES (?, ?)', [row.id, new Date().toISOString()]);

    let target;
    try { target = new URL(row.url); } catch { target = new URL(row.homepage); }
    if (!['http:', 'https:'].includes(target.protocol)) target = new URL(row.homepage);
    target.searchParams.set('utm_source', 'mercapty');
    target.searchParams.set('utm_medium', 'comparador');
    return target.toString();
  }

  // --- Imágenes (panel de administración) ---
  // image_url viene de la tienda (bots); custom_image la sube el
  // administrador y tiene prioridad. La ingesta nunca toca custom_image.
  async function adminProducts() {
    const rows = await db.all(`
      SELECT p.id, p.name, p.brand, p.size_label AS size, p.category,
        p.image_url AS storeImage, p.custom_image AS customImage,
        (SELECT COUNT(*) FROM offers o WHERE o.product_id = p.id AND o.in_stock = 1) AS offers
      FROM products p
      ORDER BY p.name, p.brand
    `);
    return rows.map((p) => ({ ...p, image: p.customImage ?? p.storeImage ?? null }));
  }

  const productExists = async (id) => Boolean(await db.get('SELECT 1 AS ok FROM products WHERE id = ?', [id]));

  // Guarda la URL de la imagen subida (o la borra con null) y devuelve la
  // anterior, para que se elimine ese archivo.
  async function setCustomImage(id, imageUrl) {
    const previous = (await db.get('SELECT custom_image FROM products WHERE id = ?', [id]))?.custom_image ?? null;
    await db.run('UPDATE products SET custom_image = ? WHERE id = ?', [imageUrl, id]);
    return previous;
  }

  async function productImage(id) {
    const p = await db.get('SELECT image_url, custom_image FROM products WHERE id = ?', [id]);
    return { image: p.custom_image ?? p.image_url ?? null, customImage: p.custom_image, storeImage: p.image_url };
  }

  // Productos con algo disponible, para el mapa del sitio (sitemap.xml).
  function sitemapEntries() {
    return db.all(`
      SELECT p.id, p.name, MAX(o.updated_at) AS updatedAt
      FROM products p JOIN offers o ON o.product_id = p.id AND o.in_stock = 1
      GROUP BY p.id ORDER BY p.id
    `);
  }

  return {
    meta, listStores, listCategories, searchProducts, deals, getProduct, optimizeList, redirectTarget,
    adminProducts, productExists, setCustomImage, productImage, sitemapEntries,
  };
}
