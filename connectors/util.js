// URL a la que se envía al cliente cuando no hay enlace directo al producto:
// la página de búsqueda de la tienda, o su portada si no tiene una conocida.
export function storeSearchUrl(store, query) {
  if (!store.searchUrl) return store.homepage;
  return store.searchUrl.replaceAll('{q}', encodeURIComponent(query));
}

// Los bots se identifican y piden JSON, igual que el sitio de la tienda.
export const BOT_HEADERS = {
  'User-Agent': 'PanaPrecioBot/0.2 (comparador de precios de supermercados de Panama)',
  Accept: 'application/json',
};

// Lista separada por comas en una variable de entorno, útil para pruebas
// rápidas: INGEST_QUERIES="leche,arroz" npm run ingest
export function envList(name) {
  const value = process.env[name];
  return value ? value.split(',').map((s) => s.trim()).filter(Boolean) : null;
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
