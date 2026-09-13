// Conector para Riba Smith. Su web (Next.js) incluye los resultados de búsqueda
// dentro de la propia página («initialData»): nombre, precio, oferta con fechas,
// inventario, departamento y el número de artículo con el que se arman la foto
// y el enlace. No publica código de barras, así que se empareja por nombre.
import { BOT_HEADERS, GROCERY_QUERIES, envList, sleep } from './util.js';

const BASE = 'https://www.ribasmith.com';
const HEADERS = { ...BOT_HEADERS, Accept: 'text/html' };

// Next.js envía los datos de la página en bloques self.__next_f.push([1,"..."]).
function nextPayload(html) {
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

export function parseSearchPage(html) {
  const payload = nextPayload(html);
  const at = payload.indexOf('"initialData":');
  const data = at === -1 ? null : readJsonObject(payload, payload.indexOf('{', at));
  // Enlaces reales de cada producto, por número de artículo.
  const links = new Map([...html.matchAll(/href="(\/producto\/[a-z0-9-]+-(\d+))"/g)].map((m) => [m[2], m[1]]));
  return { data, links };
}

const num = (v) => (v == null || v === '' ? null : Number(v));

// "LECHE DE CABRA 1/4GL" -> "Leche De Cabra 1/4gl"
const tidyName = (s) => (s === s.toUpperCase() ? s.toLowerCase().replace(/(^|\s)(\p{L})/gu, (m, sp, ch) => sp + ch.toUpperCase()) : s);

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

export async function fetchOffers(store, { log = console.log } = {}) {
  const cfg = store.connector;
  const queries = envList('INGEST_QUERIES') ?? cfg.queries ?? GROCERY_QUERIES;
  const maxPages = Number(process.env.INGEST_MAX_PAGES) || cfg.maxPages || 2;
  const delayMs = cfg.delayMs ?? 1500; // no saturar el sitio de la tienda
  const today = new Date().toISOString().slice(0, 10);
  const seen = new Map();

  for (const query of queries) {
    for (let page = 1; page <= maxPages; page++) {
      const res = await fetch(`${BASE}/search?q=${encodeURIComponent(query)}&page=${page}`, { headers: HEADERS });
      if (!res.ok) { log(`  ${store.name}: "${query}" respondió ${res.status}`); break; }
      const { data, links } = parseSearchPage(await res.text());
      if (!Array.isArray(data?.productos)) { log(`  ${store.name}: "${query}" llegó sin datos de productos`); break; }

      for (const p of data.productos) {
        const item = String(p.item ?? '');
        if (!item || seen.has(item)) continue;
        const name = tidyName(String(p.nombre ?? p.detalle ?? '').trim());
        seen.set(item, {
          sku: item,
          gtin: null,
          title: name,
          name,
          brand: p.marca,
          category: [p.nombredepa, p.categoria, p.grupo].filter(Boolean).join(' / '),
          size: null, // se deduce del nombre
          ...prices(p, today),
          inStock: num(p.inv) == null ? true : num(p.inv) > 0,
          url: `${BASE}${links.get(item) ?? `/producto/${item}`}`,
          image: `https://imgrs.eresmasrs.com/imgrs/${item}.jpg`,
        });
      }
      if (page >= (data.totalPages ?? 1)) break;
      await sleep(delayMs);
    }
    await sleep(delayMs);
  }
  return [...seen.values()];
}
