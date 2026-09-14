// Conector para Súper 99 (Magento). Sus listados los arma un buscador externo
// que exige su clave, pero la página de cada producto trae nombre, marca,
// precio, precio anterior, código de barras (UPC), existencias, foto y
// categorías, y su robots.txt permite leerla. Aquí se lee un producto a la vez;
// qué páginas leer en cada corrida lo decide scripts/super99.js.
import { BOT_HEADERS, decodeHtml, fetchText, sitemapLocs } from './util.js';
import { priceOf } from './magento.js';
import { normalizeText } from '../server/lib/normalize.js';

// Direcciones de productos del mapa del sitio. Los productos empiezan con su
// código interno (/20073831-mccormick-empamix-completo-60g); las categorías no.
export async function productUrls(sitemapUrl) {
  return [...new Set((await sitemapLocs(sitemapUrl)).filter((url) => /^https:\/\/[^/]+\/\d{5,}-[^/?#]+$/.test(url)))];
}

// Ruta de cada categoría desde su departamento: "268" -> ["Despensa", "Salsas", ...].
// La lista de categorías sí funciona en su API pública (la búsqueda de productos no).
const CATEGORY_QUERY = '{ categoryList { children { id name children { id name children { id name children { id name } } } } } }';
export async function categoryPaths(origin) {
  const res = await fetch(`${origin}/graphql`, {
    method: 'POST',
    headers: { ...BOT_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: CATEGORY_QUERY }),
    signal: AbortSignal.timeout(45000),
  });
  const paths = new Map();
  const walk = (nodes, parent) => {
    for (const node of nodes ?? []) {
      const path = [...parent, node.name];
      paths.set(String(node.id), path);
      walk(node.children, path);
    }
  };
  walk((await res.json()).data?.categoryList?.[0]?.children, []);
  if (!paths.size) throw new Error(`no se pudo leer la lista de categorías (HTTP ${res.status})`);
  return paths;
}

// Lee la página de un producto. `departments` son los departamentos de súper
// (normalizados): lo que solo está en farmacia, ferretería o juguetería se salta.
export function parseProductPage(html, url, paths, departments) {
  const name = decodeHtml(/data-ui-id="page-title-wrapper"[^>]*>([^<]+)</.exec(html)?.[1]);
  const price = priceOf(html, 'finalPrice');
  if (!name || !price) return null;
  const ids = /"categories":\[([^\]]*)\]/.exec(html)?.[1]?.match(/\d+/g) ?? [];
  const known = ids.map((id) => paths.get(id)).filter(Boolean);
  const grocery = known.filter((p) => departments.has(normalizeText(p[0]))).sort((a, b) => b.length - a.length);
  return {
    skip: known.length > 0 && grocery.length === 0,
    offer: {
      sku: /- SKU (\d+)/.exec(html)?.[1] ?? /"sku":"([^"]+)"/.exec(html)?.[1] ?? null,
      gtin: /itemprop="upc">\s*(\d{8,14})\s*</.exec(html)?.[1] ?? null,
      title: name,
      name,
      brand: decodeHtml(/<input[^>]*class="product-brand-[^"]*"[^>]*value="([^"]*)"/.exec(html)?.[1]) || null,
      category: (grocery[0] ?? []).join(' / '),
      size: null, // se deduce del nombre
      price,
      listPrice: priceOf(html, 'oldPrice'),
      inStock: !/"is_salable":"?0/.test(html),
      url,
      image: decodeHtml(/<meta property="og:image" content="([^"]+)"/.exec(html)?.[1]) || null,
    },
  };
}

// Un producto: { status: 'ok', offer } | { status: 'skip' } (no es de súper) |
// { status: 'gone' } (ya no existe o no tiene precio) | { status: 'error', problem }.
export async function fetchProduct(url, { paths, departments }) {
  const page = await fetchText(url);
  if (page.status !== 'ok') return page;
  const parsed = parseProductPage(page.text, url, paths, departments);
  if (!parsed) return { status: 'gone' };
  return parsed.skip ? { status: 'skip' } : { status: 'ok', offer: parsed.offer };
}
