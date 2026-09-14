// Conector para Riba Smith. Su web (Next.js) incluye los productos dentro de la
// propia página: nombre, precio, oferta con fechas, inventario, departamento y
// el número de artículo con el que se arman la foto y el enlace. Su «sku» es el
// código de barras sin el dígito verificador (7441003500235 aparece como
// 744100350023): se completa para unirlo con las demás tiendas. Los códigos
// internos cortos se descartan y esos productos se emparejan por nombre.
//
// Con "mode": "departments" recorre todos los departamentos (catálogo completo);
// si no, usa la búsqueda del sitio con los términos de canasta básica.
import { BOT_HEADERS, GROCERY_QUERIES, envList, sleep, tidyName } from './util.js';
import { gtinCheckDigit, slugify } from '../server/lib/normalize.js';

const BASE = 'https://www.ribasmith.com';
const HEADERS = { ...BOT_HEADERS, Accept: 'text/html' };

// Next.js envía los datos de la página en bloques self.__next_f.push([1,"..."]).
export function nextPayload(html) {
  let out = '';
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
    try { out += JSON.parse(m[1]); } catch { /* bloque que no es texto */ }
  }
  return out;
}

// Lee el objeto JSON que empieza en `start` contando llaves, sin confundirse
// con las llaves que aparezcan dentro de los textos.
function readJsonObject(text, start) {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return JSON.parse(text.slice(start, i + 1));
  }
  return null;
}

// Enlaces reales de cada producto, por número de artículo.
const productLinks = (html) => new Map([...html.matchAll(/href="(\/producto\/[a-z0-9-]+-(\d+))"/g)].map((m) => [m[2], m[1]]));

// Página de búsqueda: {"initialData": {"productos": [...], "totalPages": n}}.
export function parseSearchPage(html) {
  const payload = nextPayload(html);
  const at = payload.indexOf('"initialData":');
  const data = at === -1 ? null : readJsonObject(payload, payload.indexOf('{', at));
  return { data, links: productLinks(html) };
}

// Página de departamento: un bloque {"products": [...]} y el total de páginas aparte.
export function parseDepartmentPage(html) {
  const payload = nextPayload(html);
  const at = payload.indexOf('{"products":');
  const block = at === -1 ? null : readJsonObject(payload, at);
  const totalPages = Number(/"totalPages":(\d+)/.exec(payload)?.[1] ?? 1);
  return { products: block?.products ?? [], totalPages, links: productLinks(html) };
}

// Departamentos del menú del sitio: [{ id, nombre, path }]. La dirección se toma
// del enlace real del menú ("Tilton´s" -> /dep_product/tiltons-30).
export function parseDepartments(html) {
  const hrefs = [...html.matchAll(/\/dep_product\/([a-z0-9-]+)-(\d+)/g)];
  const found = new Map();
  for (const m of nextPayload(html).matchAll(/\{"id":(\d+),"nombre":"([^"]+)","img":/g)) {
    const [, id, nombre] = m;
    const slug = slugify(nombre);
    const href = hrefs.find((h) => h[2] === id && h[1].replace(/-/g, '') === slug.replace(/-/g, ''));
    found.set(id, { id, nombre, path: href?.[0] ?? `/dep_product/${slug}-${id}` });
  }
  return [...found.values()];
}

const num = (v) => (v == null || v === '' ? null : Number(v));

// UPC/EAN sin dígito verificador (10 a 12 cifras) -> código completo. Los de 13
// o 14 cifras se usan tal cual; la ingesta descarta los que no sean válidos.
export function barcode(sku) {
  const digits = String(sku ?? '').replace(/\D/g, '');
  if (digits.length >= 10 && digits.length <= 12) return digits + gtinCheckDigit(digits);
  return digits.length > 12 ? digits : null;
}

// Precio vigente: la oferta si está dentro de sus fechas; si no, el regular.
// Riba Smith da «precio» y «preciooferta» sin ITBMS; «preciofinal» es lo que
// paga el cliente (lo que muestran las demás tiendas). A la oferta se le aplica
// el mismo impuesto que tenga el producto.
function prices(p, today) {
  const regular = num(p.preciofinal) ?? num(p.precio_base) ?? num(p.precio_calculo) ?? num(p.precio);
  const beforeTax = num(p.precio_calculo) ?? num(p.precio);
  const taxFactor = regular && beforeTax ? regular / beforeTax : 1;
  const offer = num(p.preciooferta) ? Math.round(num(p.preciooferta) * taxFactor * 100) / 100 : null;
  const inDates = (!p.fechainicio || String(p.fechainicio).slice(0, 10) <= today)
    && (!p.fechafin || String(p.fechafin).slice(0, 10) >= today);
  return offer > 0 && offer < regular && inDates ? { price: offer, listPrice: regular } : { price: regular, listPrice: null };
}

function addProduct(p, links, seen, today) {
  const item = String(p.item ?? '');
  if (!item || seen.has(item)) return;
  const name = tidyName(String(p.nombre ?? p.detalle ?? '').trim());
  seen.set(item, {
    sku: item,
    gtin: barcode(p.sku),
    title: name,
    name,
    brand: p.marca,
    category: [p.nombredepa ?? p.departamento, p.categoria, p.grupo].filter(Boolean).join(' / '),
    size: null, // se deduce del nombre
    ...prices(p, today),
    inStock: num(p.inv) == null ? true : num(p.inv) > 0,
    url: `${BASE}${links.get(item) ?? `/producto/${item}`}`,
    image: `https://imgrs.eresmasrs.com/imgrs/${item}.jpg`,
  });
}

// Un corte de red o un error pasajero de la tienda no debe tirar todo el
// recorrido: se reintenta y, si sigue fallando, se salta esa página.
async function getHtml(url, log, attempts = 3) {
  const page = url.replace(BASE, '');
  for (let i = 1; i <= attempts; i++) {
    let problem;
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30000) });
      if (res.ok) return await res.text();
      if (res.status !== 429 && res.status < 500) { log(`  Riba Smith: ${page} respondió ${res.status}`); return null; }
      problem = `respondió ${res.status}`;
    } catch (err) {
      problem = `falló (${err.cause?.code ?? err.name})`;
    }
    if (i === attempts) { log(`  Riba Smith: ${page} ${problem}; se omite`); return null; }
    await sleep(5000 * i);
  }
  return null;
}

export async function fetchOffers(store, { log = console.log } = {}) {
  const cfg = store.connector;
  const delayMs = cfg.delayMs ?? 1500; // no saturar el sitio de la tienda
  const today = new Date().toISOString().slice(0, 10);
  const seen = new Map();
  const testQueries = envList('INGEST_QUERIES'); // en pruebas rápidas se busca por palabra

  if (cfg.mode === 'departments' && !testQueries) {
    const home = await getHtml(`${BASE}/`, log);
    const skip = new Set((cfg.skipDepartments ?? []).map(slugify));
    const departments = (home ? parseDepartments(home) : []).filter((d) => !skip.has(slugify(d.nombre)));
    if (!departments.length) throw new Error('no se encontró la lista de departamentos');
    const limit = Number(process.env.INGEST_MAX_DEPARTMENTS) || departments.length;
    log(`  ${store.name}: ${departments.length} departamentos`);
    for (const dep of departments.slice(0, limit)) {
      let totalPages = 1;
      let count = 0;
      for (let page = 1; page <= totalPages; page++) {
        const html = await getHtml(`${BASE}${dep.path}?page=${page}`, log);
        if (html) {
          const parsed = parseDepartmentPage(html);
          for (const p of parsed.products) addProduct(p, parsed.links, seen, today);
          count += parsed.products.length;
          totalPages = parsed.totalPages;
          if (!parsed.products.length) break;
        } else if (page === 1) break; // sin la primera página no se sabe cuántas hay
        await sleep(delayMs);
      }
      log(`  ${store.name}: ${dep.nombre}, ${count} productos en ${totalPages} páginas`);
    }
    return [...seen.values()];
  }

  const maxPages = Number(process.env.INGEST_MAX_PAGES) || cfg.maxPages || 2;
  for (const query of testQueries ?? cfg.queries ?? GROCERY_QUERIES) {
    for (let page = 1; page <= maxPages; page++) {
      const html = await getHtml(`${BASE}/search?q=${encodeURIComponent(query)}&page=${page}`, log);
      if (!html) break;
      const { data, links } = parseSearchPage(html);
      if (!Array.isArray(data?.productos)) { log(`  ${store.name}: "${query}" llegó sin datos de productos`); break; }
      for (const p of data.productos) addProduct(p, links, seen, today);
      if (page >= (data.totalPages ?? 1)) break;
      await sleep(delayMs);
    }
    await sleep(delayMs);
  }
  return [...seen.values()];
}
