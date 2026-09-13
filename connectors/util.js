// URL a la que se envía al cliente cuando no hay enlace directo al producto:
// la página de búsqueda de la tienda, o su portada si no tiene una conocida.
export function storeSearchUrl(store, query) {
  if (!store.searchUrl) return store.homepage;
  return store.searchUrl.replaceAll('{q}', encodeURIComponent(query));
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
