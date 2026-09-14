// URL a la que se envía al cliente cuando no hay enlace directo al producto:
// la página de búsqueda de la tienda, o su portada si no tiene una conocida.
export function storeSearchUrl(store, query) {
  if (!store.searchUrl) return store.homepage;
  return store.searchUrl.replaceAll('{q}', encodeURIComponent(query));
}

// Los bots se identifican y piden JSON, igual que el sitio de la tienda.
export const BOT_HEADERS = {
  'User-Agent': 'MercaptyBot/0.3 (comparador de precios de supermercados de Panama)',
  Accept: 'application/json',
};

// Términos que usan los bots que buscan por palabra (Instaleap, y VTEX si no se
// recorre por categorías): lo más comprado en un súper, con marcas muy buscadas.
export const GROCERY_QUERIES = [
  // Lácteos y huevos
  'leche', 'queso', 'yogurt', 'mantequilla', 'margarina', 'huevos', 'crema',
  // Despensa
  'arroz', 'frijoles', 'lentejas', 'garbanzos', 'aceite', 'azucar', 'sal', 'cafe', 'te', 'pasta', 'spaghetti',
  'harina', 'avena', 'cereal', 'atun', 'sardina', 'salsa', 'ketchup', 'mayonesa', 'mostaza', 'vinagre', 'sopa',
  'consome', 'maiz', 'galletas', 'pan', 'tortillas', 'mermelada', 'miel', 'chocolate',
  // Bebidas
  'agua', 'jugo', 'soda', 'coca cola', 'pepsi', 'sprite', 'fanta', 'gatorade', 'malta', 'te frio', 'cerveza',
  'energizante',
  // Licores (con las marcas de ron más buscadas: «ron» solo trae las primeras páginas)
  'ron', 'flor de caña', 'abuelo', 'seco', 'vino', 'whisky', 'vodka', 'ginebra', 'tequila',
  // Carnes, embutidos y congelados
  'pollo', 'carne', 'cerdo', 'jamon', 'salchichas', 'chorizo', 'tocino', 'pescado', 'camaron', 'helado',
  // Frutas y verduras
  'platano', 'papa', 'cebolla', 'tomate', 'lechuga', 'zanahoria', 'limon', 'manzana', 'guineo',
  // Snacks
  'papitas', 'doritos', 'mani',
  // Limpieza
  'papel higienico', 'servilletas', 'detergente', 'cloro', 'suavizante', 'lavaplatos', 'desinfectante', 'jabon',
  'bolsas basura',
  // Cuidado personal
  'shampoo', 'acondicionador', 'pasta dental', 'cepillo dental', 'desodorante', 'toallas sanitarias',
  // Bebé y mascotas
  'panales', 'toallitas', 'formula infantil', 'compota', 'alimento perro', 'alimento gato',
];

// Lista separada por comas en una variable de entorno, útil para pruebas
// rápidas: INGEST_QUERIES="leche,arroz" npm run ingest
export function envList(name) {
  const value = process.env[name];
  return value ? value.split(',').map((s) => s.trim()).filter(Boolean) : null;
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Descarga una página con reintentos ante cortes de red, 429 y errores 5xx.
// { status: 'ok', text } | { status: 'gone' } (404, 410 o redirige a otra
// página: el producto ya no existe) | { status: 'error', problem }.
export async function fetchText(url, headers = { ...BOT_HEADERS, Accept: 'text/html' }, attempts = 3) {
  for (let i = 1; ; i++) {
    let problem;
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(45000) });
      if (res.ok && res.redirected && new URL(res.url).pathname !== new URL(url).pathname) return { status: 'gone' };
      if (res.ok) return { status: 'ok', text: await res.text() };
      if (res.status === 404 || res.status === 410) return { status: 'gone' };
      if (res.status !== 429 && res.status < 500) return { status: 'error', problem: `HTTP ${res.status}` };
      problem = `HTTP ${res.status}`;
    } catch (err) {
      problem = err.cause?.code ?? err.name;
    }
    if (i >= attempts) return { status: 'error', problem };
    await sleep(10000 * i);
  }
}

// Todas las direcciones de un mapa del sitio (o de los mapas que agrupa un índice).
export async function sitemapLocs(sitemapUrl) {
  const headers = { ...BOT_HEADERS, Accept: 'application/xml' };
  const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  const index = await fetchText(sitemapUrl, headers);
  if (index.status !== 'ok') throw new Error(`no se pudo leer el mapa del sitio (${index.problem ?? index.status})`);
  if (!index.text.includes('<sitemapindex')) return locs(index.text);
  const urls = [];
  for (const file of locs(index.text)) {
    const xml = await fetchText(file, headers);
    if (xml.status !== 'ok') throw new Error(`no se pudo leer ${file} (${xml.problem ?? xml.status})`);
    urls.push(...locs(xml.text));
  }
  return urls;
}

// Texto de HTML legible: "LA DO&Ntilde;A" -> "LA DOÑA".
const ENTITIES = {
  amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', deg: '°', ordm: 'º', ordf: 'ª', reg: '®', trade: '™',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', Uuml: 'Ü',
};
export const decodeHtml = (s) => String(s ?? '')
  .replace(/&#x([0-9a-f]+);/gi, (m, hex) => String.fromCodePoint(parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (m, dec) => String.fromCodePoint(Number(dec)))
  .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name] ?? m)
  .replace(/\s+/g, ' ')
  .trim();

// Algunas tiendas escriben todo en mayúsculas: "LECHE DE CABRA 1/4GL" -> "Leche De Cabra 1/4gl".
export const tidyName = (s) => (s === s.toUpperCase() ? s.toLowerCase().replace(/(^|\s)(\p{L})/gu, (m, sp, ch) => sp + ch.toUpperCase()) : s);
