import { normalizeText, unitPrice } from './lib/normalize.js';

const round2 = (n) => Math.round(n * 100) / 100;

// Ofertas disponibles ordenadas por precio dentro de cada producto; rn = 1 es la más barata.
const RANKED = `
  WITH ranked AS (
    SELECT o.*,
      ROW_NUMBER() OVER (PARTITION BY o.product_id ORDER BY o.price, o.store_id) AS rn,
      COUNT(*)     OVER (PARTITION BY o.product_id) AS store_count,
      MAX(o.price) OVER (PARTITION BY o.product_id) AS max_price
    FROM offers o
    WHERE o.in_stock = 1
  )`;
const BEST_OFFER_COLUMNS = `
  p.*, r.id AS offer_id, r.price, r.list_price, r.store_id, r.store_count, r.max_price`;

const SORTS = {
  nombre: 'p.name, p.brand',
  precio: 'r.price ASC',
  ahorro: '(r.max_price - r.price) DESC, r.price ASC',
};

function productSummary(row) {
  return {
    id: row.id,
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
      SELECT s.id, s.name, s.homepage, s.platform, s.color, s.source,
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

  async function searchProducts({ q = '', category = '', sort = 'nombre', limit = 24, offset = 0 }) {
    const where = [];
    const params = [];
    for (const term of normalizeText(q).split(' ').filter(Boolean).slice(0, 8)) {
      where.push('p.search_text LIKE ?');
      params.push(`%${term}%`);
    }
    if (category) {
      where.push('p.category = ?');
      params.push(category);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const join = 'FROM products p JOIN ranked r ON r.product_id = p.id AND r.rn = 1';

    const [count, rows] = await Promise.all([
      db.get(`${RANKED} SELECT COUNT(*) AS total ${join} ${whereSql}`, params),
      db.all(`
        ${RANKED} SELECT ${BEST_OFFER_COLUMNS} ${join} ${whereSql}
        ORDER BY ${SORTS[sort] ?? SORTS.nombre} LIMIT ? OFFSET ?
      `, [...params, limit, offset]),
    ]);
    return { total: count.total, items: rows.map(productSummary) };
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

    const available = offers.filter((o) => o.in_stock);
    const best = available[0];
    const worst = available.at(-1);
    return {
      id: p.id,
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
      group.lines.push({ productId: id, label: label(product), qty, price: cheapest.price, subtotal: round2(subtotal), offerId: cheapest.id });
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
  // que la tienda pueda atribuir la venta a PanaPrecio. Solo se redirige a
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
    target.searchParams.set('utm_source', 'panaprecio');
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

  return {
    meta, listStores, listCategories, searchProducts, deals, getProduct, optimizeList, redirectTarget,
    adminProducts, productExists, setCustomImage, productImage,
  };
}
