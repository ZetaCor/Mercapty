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

// Términos que usan los bots que buscan por palabra (VTEX, Instaleap): lo más
// comprado en un súper.
export const GROCERY_QUERIES = [
  'leche', 'queso', 'yogurt', 'mantequilla', 'huevos', 'arroz', 'frijoles', 'lentejas',
  'aceite', 'azucar', 'sal', 'cafe', 'pasta', 'harina', 'avena', 'cereal', 'atun',
  'sardina', 'salsa', 'mayonesa', 'pan', 'galletas', 'pollo', 'carne', 'jamon',
  'salchichas', 'agua', 'jugo', 'refresco', 'cerveza', 'papel higienico', 'detergente',
  'cloro', 'suavizante', 'lavaplatos', 'jabon', 'shampoo', 'pasta dental',
  'desodorante', 'panales', 'toallitas',
];

// Lista separada por comas en una variable de entorno, útil para pruebas
// rápidas: INGEST_QUERIES="leche,arroz" npm run ingest
export function envList(name) {
  const value = process.env[name];
  return value ? value.split(',').map((s) => s.trim()).filter(Boolean) : null;
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
