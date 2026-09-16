import { canonicalCategory, categoryFromHead, nameHead, normalizeText, parsePack, parseSize, productPath, unitPrice } from './lib/normalize.js';
import { nameSimilarity } from './lib/matching.js';
import { createSchema, rebuildAggregates } from './db.js';

const round2 = (n) => Math.round(n * 100) / 100;

// La mejor oferta de cada producto ya viene calculada en product_best, que rehacen los bots
// al final de cada corrida (rebuildAggregates en server/db.js): así la web no recorre todas
// las ofertas en cada visita, que es lo que cobra Turso.
const BEST_JOIN = 'FROM products p JOIN product_best b ON b.product_id = p.id';
const BEST_OFFER_COLUMNS = `
  p.*, b.offer_id, b.price, b.list_price, b.store_id, b.store_count, b.max_price, b.store_ids`;

// b.name y b.category son copias de products: ordenar y filtrar por ellas usa los índices
// de product_best, sin recorrer nada.
const SORTS = {
  relevancia: 'b.store_count DESC, b.name', // lo que se compara en más tiendas, primero
  nombre: 'p.name, p.brand',
  precio: 'b.price ASC, b.name', // con el mismo precio, por nombre: el orden no cambia entre corridas
  ahorro: 'b.savings DESC, b.price ASC',
};

// --- Búsqueda por relevancia ---

const SEARCH_STOPWORDS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'con', 'y', 'en', 'para', 'por', 'a', 'al',
  'the', 'of', 'for', 'and', 'with', 'an', // quien busca en inglés
]);

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

// Palabras en inglés, para quien usa la web o la app en inglés: los productos se llaman
// en español, así que «milk» busca «leche». Van en singular (searchStem quita la «s»).
const ENGLISH = {
  milk: ['leche'], egg: ['huevo'], rice: ['arroz'], chicken: ['pollo'], beef: ['res', 'carne'], pork: ['cerdo'],
  meat: ['carne'], fish: ['pescado'], tuna: ['atun'], sardine: ['sardina'], ham: ['jamon'], sausage: ['salchicha'],
  bacon: ['tocino'], turkey: ['pavo'], cheese: ['queso'], butter: ['mantequilla'], bread: ['pan'], flour: ['harina'],
  sugar: ['azucar'], salt: ['sal'], oil: ['aceite'], coffee: ['cafe'], juice: ['jugo'], water: ['agua'],
  beer: ['cerveza'], wine: ['vino'], rum: ['ron'], bean: ['frijol', 'poroto'], lentil: ['lenteja'], corn: ['maiz'],
  oat: ['avena'], cookie: ['galleta'], cracker: ['galleta'], candy: ['dulce', 'caramelo'], chip: ['papita'],
  food: ['alimento', 'comida'], banana: ['guineo', 'banano'], apple: ['manzana'], orange: ['naranja'],
  lemon: ['limon'], lime: ['limon'], tomato: ['tomate'], tomatoe: ['tomate'], potato: ['papa'], potatoe: ['papa'],
  onion: ['cebolla'], garlic: ['ajo'], lettuce: ['lechuga'], carrot: ['zanahoria'], avocado: ['aguacate'],
  soap: ['jabon'], detergent: ['detergente'], bleach: ['cloro'], diaper: ['panal'], wipe: ['toallita'],
  toothpaste: ['dental'], toilet: ['higienico'], paper: ['papel'], napkin: ['servilleta'], dog: ['perro'],
  cat: ['gato'], baby: ['bebe'], soup: ['sopa'], sauce: ['salsa'], honey: ['miel'], peanut: ['mani'], yogurt: ['yogur'],
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
  return words.slice(0, 8).map((w) => [w, ...(SYNONYMS[w] ?? ENGLISH[w] ?? [])]);
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
    const rule = alts.map((a) => PLAIN_FIRST[a]).find(Boolean); // también «milk» -> leche
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
  // product_best y stats los rehacen los bots en cada corrida. Si faltan (base recién creada
  // o recién migrada), se calculan una vez aquí para no quedarnos sin datos.
  let aggregates = null;
  function ready() {
    aggregates ??= db.get('SELECT 1 AS ok FROM product_best LIMIT 1').then(async (row) => {
      if (row) return;
      console.warn('product_best vacío: se calcula ahora (normalmente lo dejan listo los bots)');
      await rebuildAggregates(db);
    }, async (err) => {
      // Base recién creada: el servidor no crea las tablas al arrancar (ver openDb).
      if (!/no such table/i.test(err.message)) throw err;
      console.warn('faltan las tablas: se crean ahora (normalmente las dejan listas los bots)');
      await createSchema(db);
      await rebuildAggregates(db);
    }).catch((err) => {
      aggregates = null; // que la siguiente petición lo vuelva a intentar
      throw err;
    });
    return aggregates;
  }

  // ¿Está el índice de texto de la búsqueda? Se comprueba una vez por instancia.
  let searchIndex = null;
  function hasSearchIndex() {
    searchIndex ??= db
      .get("SELECT 1 AS ok FROM sqlite_master WHERE name = 'products_fts'")
      .then(Boolean)
      .catch(() => false);
    return searchIndex;
  }

  // Totales que dejan calculados los bots; si aún no están, se calculan al momento.
  async function stats(key, compute) {
    await ready();
    const row = await db.get('SELECT value FROM stats WHERE key = ?', [key]);
    return row ? JSON.parse(row.value) : compute();
  }

  async function meta() {
    const row = await stats('meta', () => db.get(`
      SELECT (SELECT COUNT(*) FROM products) AS products,
        (SELECT COUNT(*) FROM offers WHERE in_stock = 1) AS offers,
        (SELECT MAX(updated_at) FROM offers) AS updatedAt,
        (SELECT COUNT(*) FROM stores WHERE source = 'demo') AS demoStores`));
    return { demo: row.demoStores > 0, products: row.products, offers: row.offers, updatedAt: row.updatedAt };
  }

  // Los totales de cada tienda los dejan calculados los bots; los clics se cuentan al momento,
  // porque cambian con cada visita enviada.
  async function listStores() {
    const [stores, totals, clicks] = await Promise.all([
      db.all('SELECT id, name, homepage, platform, color, source, logo, icon, logo_bg AS logoBg FROM stores'),
      stats('stores', () => db.all(`
        SELECT s.id,
          (SELECT COUNT(*) FROM offers o WHERE o.store_id = s.id AND o.in_stock = 1) AS offers,
          (SELECT MAX(o.updated_at) FROM offers o WHERE o.store_id = s.id) AS updatedAt,
          (SELECT COUNT(*) FROM product_best b WHERE b.store_id = s.id AND b.store_count > 1) AS bestCount
        FROM stores s`)),
      db.all('SELECT o.store_id AS id, COUNT(*) AS clicks FROM clicks c JOIN offers o ON o.id = c.offer_id GROUP BY o.store_id'),
    ]);
    const totalsById = new Map(totals.map((t) => [t.id, t]));
    const clicksById = new Map(clicks.map((c) => [c.id, c.clicks]));
    return stores
      .map((s) => ({ ...s, offers: 0, updatedAt: null, bestCount: 0, ...totalsById.get(s.id), clicks: clicksById.get(s.id) ?? 0 }))
      .sort((a, b) => b.bestCount - a.bestCount || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }

  // Solo categorías con algo disponible, para no mostrar filtros vacíos.
  function listCategories() {
    return stats('categories', () => db.all(
      'SELECT category AS name, COUNT(*) AS count FROM product_best GROUP BY category ORDER BY count DESC',
    ));
  }

  // Cuántos productos disponibles hay (en una categoría o en total), del resumen.
  async function countProducts(category) {
    const categories = await listCategories();
    if (category) return categories.find((c) => c.name === category)?.count ?? 0;
    return categories.reduce((sum, c) => sum + c.count, 0);
  }

  async function searchProducts({ q = '', category = '', sort = '', limit = 24, offset = 0 }) {
    await ready();
    const terms = queryTerms(q);

    // Sin palabras (por ejemplo, una categoría): orden directo en la base.
    if (!terms.length) {
      const whereSql = category ? 'WHERE b.category = ?' : '';
      const params = category ? [category] : [];
      const [total, rows] = await Promise.all([
        countProducts(category),
        db.all(`
          SELECT ${BEST_OFFER_COLUMNS} ${BEST_JOIN} ${whereSql}
          ORDER BY ${SORTS[sort] ?? SORTS.relevancia} LIMIT ? OFFSET ?
        `, [...params, limit, offset]),
      ]);
      return { total, approximate: false, items: rows.map(productSummary) };
    }

    // Con palabras: primero los productos que tienen todas (cada palabra o un
    // sinónimo), ordenados por relevancia; así un catálogo grande no deja
    // fuera lo buscado. Si ninguno las tiene todas, los que tienen alguna.
    // Con el índice de texto se piden las palabras al índice («leche*» encuentra leche,
    // leches y lechera); sin él se recorren los nombres con LIKE, que lee toda la tabla.
    const byWords = async (groups, joiner) => {
      const params = [];
      let from = BEST_JOIN;
      let where;
      if (await hasSearchIndex()) {
        from = 'FROM products_fts JOIN products p ON p.id = products_fts.rowid JOIN product_best b ON b.product_id = p.id';
        where = ['products_fts MATCH ?'];
        params.push(groups.map((alts) => `(${alts.map((t) => `${t}*`).join(' OR ')})`).join(joiner));
      } else {
        where = [groups.map((alts) => `(${alts.map(() => 'p.search_text LIKE ?').join(' OR ')})`).join(joiner)];
        params.push(...groups.flat().map((t) => `%${t}%`));
      }
      if (category) {
        where.push('p.category = ?');
        params.push(category);
      }
      return db.all(`SELECT ${BEST_OFFER_COLUMNS} ${from} WHERE (${where.join(') AND (')}) LIMIT 5000`, params);
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
    await ready();
    const rows = await db.all(`
      SELECT ${BEST_OFFER_COLUMNS} ${BEST_JOIN}
      WHERE b.store_count > 1
      ORDER BY b.savings DESC LIMIT ?
    `, [limit]);
    return rows.map(productSummary);
  }

  // Productos de otras tiendas que se parecen pero no se unieron (otro nombre u
  // otra presentación): se muestran aparte para que el cliente compare.
  // Productos parecidos, en dos grupos: primero los de la misma marca (otros
  // tamaños o variantes: «Arroz Arrosisimo 4500 gr» junto al de 2000 gr) y luego
  // los de otras marcas que son lo mismo (otros «Arroz…»). En cada grupo, antes
  // el nombre más parecido, el tamaño más cercano y lo que se compara en más tiendas.
  async function similarProducts(p) {
    await ready();
    const candidates = (where, args) => db.all(`
      SELECT ${BEST_OFFER_COLUMNS} ${BEST_JOIN}
      WHERE p.id <> ? AND p.category = ? AND (${where})
      ORDER BY b.store_count DESC LIMIT 400
    `, [p.id, p.category, ...args]);
    let brandLabel = p.brand;
    let brand = normalizeText(p.brand ?? '');
    const head = nameHead(p.name);
    const isSameBrand = (row) => (Boolean(brand)
      && (normalizeText(row.brand ?? '') === brand || ` ${normalizeText(row.name)} `.includes(` ${brand} `)))
      || (headIsBrand && nameHead(row.name) === head);
    const closeSize = (row) => p.size_value && row.size_unit === p.size_unit
      && row.size_value / p.size_value > 0.75 && row.size_value / p.size_value < 1.33;
    const rank = (row) => nameSimilarity(p.name, row.name).score + (closeSize(row) ? 0.15 : 0) + Math.min(0.15, 0.03 * (row.store_count - 1));
    const top = (rows) => rows.map((row) => ({ row, score: rank(row) }))
      .sort((a, b) => b.score - a.score).slice(0, 8).map((s) => productSummary(s.row));

    const keys = [brand, head].filter((k) => k.length >= 3);
    const rows = keys.length ? await candidates(keys.map(() => 'p.search_text LIKE ?').join(' OR '), keys.map((k) => `%${k}%`)) : [];
    // Sin marca guardada: la de un producto parecido cuya marca aparece en el nombre («Carta Vieja Añejo»).
    if (!brand) {
      const nameText = ` ${normalizeText(p.name)} `;
      const found = rows.find((row) => {
        const b = normalizeText(row.brand ?? '');
        return b.length >= 3 && nameText.includes(` ${b} `);
      });
      if (found) [brandLabel, brand] = [found.brand, normalizeText(found.brand)];
    }
    const brandWords = new Set(brand.split(' ').filter(Boolean));
    // Si el nombre empieza por una marca que otras tiendas usan como tal («Doritos Spicy»,
    // guardado con la marca Frito Lay), los que empiezan igual también son de esa marca.
    const headIsBrand = Boolean(head) && !categoryFromHead(p.name) && rows.some((row) => normalizeText(row.brand ?? '') === head);
    // Otras marcas: el mismo tipo de producto (el nombre empieza igual: «Arroz…»).
    let others = head && !brandWords.has(head) ? rows.filter((row) => !isSameBrand(row) && nameHead(row.name) === head) : [];
    // Si el nombre empieza por la marca («Carta Vieja Añejo»), se buscan las demás palabras.
    if (!others.length) {
      const words = normalizeText(p.name).split(' ').filter((w) => w.length >= 4 && !/^\d/.test(w) && !brandWords.has(w));
      const extra = [...new Set(words)].sort((a, b) => b.length - a.length).slice(0, 2);
      if (extra.length) {
        others = (await candidates(extra.map(() => 'p.search_text LIKE ?').join(' AND '), extra.map((k) => `%${k}%`)))
          .filter((row) => !isSameBrand(row) && nameSimilarity(p.name, row.name).score >= 0.4);
      }
    }
    return { brand: brandLabel, sameBrand: top(rows.filter(isSameBrand)), others: top(others) };
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

    const similar = await similarProducts(p);
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
    await ready();
    const rows = await db.all(`
      SELECT p.id, p.name, p.brand, p.size_label AS size, p.category,
        p.image_url AS storeImage, p.custom_image AS customImage,
        COALESCE(b.store_count, 0) AS offers
      FROM products p LEFT JOIN product_best b ON b.product_id = p.id
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
  async function sitemapEntries() {
    await ready();
    return db.all('SELECT product_id AS id, name, updated_at AS updatedAt FROM product_best ORDER BY product_id');
  }

  return {
    meta, listStores, listCategories, searchProducts, deals, getProduct, optimizeList, redirectTarget,
    adminProducts, productExists, setCustomImage, productImage, sitemapEntries,
  };
}
