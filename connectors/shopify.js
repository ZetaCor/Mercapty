// Conector para tiendas Shopify (hoy: Alimentos Melo), con el catálogo público
// que Shopify da a toda tienda (/products.json, hasta 250 productos por
// página): nombre, marca, tipo, presentación, precio, precio anterior,
// existencias, foto y enlace. Ese catálogo no trae el código de barras, así que
// estos productos se unen con las otras tiendas por nombre, marca y tamaño.
import { BOT_HEADERS, fetchText, sleep } from './util.js';
import { normalizeText } from '../server/lib/normalize.js';

const PAGE_SIZE = 250;
// Shopify no deja pasar de 25 000 productos en /products.json: a la página 101 con 250
// por página responde 400 («Page * Limit exceeds the 25000 limit») y el bot perdería la
// tienda entera. Titán llega justo a ese tope, así que la última página es la 100.
const MAX_PAGES = Math.floor(25000 / PAGE_SIZE);

export async function fetchOffers(store, { log = console.log } = {}) {
  const cfg = store.connector;
  const origin = new URL(store.homepage).origin;
  const aliases = cfg.vendorAliases ?? {}; // "MELO Alimentos" -> "Melo"
  // Tiendas que guardan todo en cajones propios ("ELECTRO", "DAMAS", "COLCHONES"): el mapa
  // los traduce a nuestras categorías. Vale solo para esa tienda, porque esas palabras en el
  // nombre de un producto significan otra cosa.
  const porTipo = cfg.categoryMap ?? {};
  // Con cientos de cajones distintos (Titán tiene 969: «CORTINA DE BAÑO», «PISTAS CARRO»,
  // «SABANAS QUEEN») un mapa nombre por nombre no se sostiene, así que `categoryRules` es una
  // lista ordenada de [palabras, categoría]: gana la primera que aparezca en el nombre del
  // cajón. Como el mapa, vale solo para esa tienda: fuera de su catálogo esas palabras
  // significan otra cosa.
  const reglas = (cfg.categoryRules ?? []).map(([palabras, categoria]) => [new RegExp(palabras), categoria]);
  const porReglas = (tipo) => {
    const t = normalizeText(tipo);
    return t ? reglas.find(([re]) => re.test(t))?.[1] : null;
  };
  // Las tiendas que venden una sola cosa (Multimax, Rodelag: electrónica y línea blanca)
  // traen su categoría en la configuración: sus propios tipos son un desorden («SMART»,
  // «OLLAS ELECTRICAS») y el nombre del producto no siempre lo dice.
  const offers = [];
  const maxPages = Math.min(cfg.maxPages ?? 40, MAX_PAGES);
  for (let page = 1; page <= maxPages; page++) {
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
          category: cfg.category ?? porTipo[p.product_type] ?? porReglas(p.product_type) ?? p.product_type ?? '',
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
