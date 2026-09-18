// Conector para tiendas Shopify (hoy: Alimentos Melo), con el catálogo público
// que Shopify da a toda tienda (/products.json, hasta 250 productos por
// página): nombre, marca, tipo, presentación, precio, precio anterior,
// existencias, foto y enlace. Ese catálogo no trae el código de barras, así que
// estos productos se unen con las otras tiendas por nombre, marca y tamaño.
import { BOT_HEADERS, fetchText, sleep } from './util.js';

const PAGE_SIZE = 250;

export async function fetchOffers(store, { log = console.log } = {}) {
  const cfg = store.connector;
  const origin = new URL(store.homepage).origin;
  const aliases = cfg.vendorAliases ?? {}; // "MELO Alimentos" -> "Melo"
  // Las tiendas que venden una sola cosa (Multimax, Rodelag: electrónica y línea blanca)
  // traen su categoría en la configuración: sus propios tipos son un desorden («SMART»,
  // «OLLAS ELECTRICAS») y el nombre del producto no siempre lo dice.
  const offers = [];
  for (let page = 1; page <= (cfg.maxPages ?? 40); page++) {
    // Con reintentos: Shopify corta con 429 a quien pide rápido, y un corte no debe
    // costar la tienda entera.
    const res = await fetchText(`${origin}/products.json?limit=${PAGE_SIZE}&page=${page}`, BOT_HEADERS);
    if (res.status !== 'ok') throw new Error(`su catálogo (/products.json) respondió ${res.problem ?? res.status}`);
    const { products = [] } = JSON.parse(res.text);
    for (const p of products) {
      for (const v of p.variants ?? []) {
        // Cuando hay varias presentaciones, la variante dice cuál es ("Bolsa de 3 lbs").
        const name = v.title && v.title !== 'Default Title' ? `${p.title} ${v.title}` : p.title;
        offers.push({
          sku: String(v.id),
          gtin: v.barcode ?? null, // el catálogo público no lo trae; por si alguna tienda sí
          title: name,
          name,
          brand: aliases[p.vendor] ?? p.vendor,
          category: cfg.category ?? p.product_type ?? '',
          size: null, // se deduce del nombre
          price: v.price,
          listPrice: v.compare_at_price,
          inStock: v.available !== false,
          url: `${origin}/products/${p.handle}${p.variants.length > 1 ? `?variant=${v.id}` : ''}`,
          image: v.featured_image?.src ?? p.images?.[0]?.src ?? null,
        });
      }
    }
    log(`  ${store.name}: página ${page}, ${products.length} productos`);
    if (products.length < PAGE_SIZE) break;
    await sleep(cfg.delayMs ?? 1500);
  }
  return offers;
}
