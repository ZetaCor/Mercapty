// La app lee la misma API JSON que la web (server/app.js en Vercel).
// Para probar contra otro servidor: EXPO_PUBLIC_API_URL=http://192.168.x.x:3000 npx expo start
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://mercapty.com').replace(/\/+$/, '');

// Dirección pública de las páginas, para compartir un producto.
export const WEB_URL = 'https://mercapty.com';

// Contacto y redes (server/contact.js): solo vienen los canales que tienen dato.
export type ContactChannel = { text: string; url: string };
export type Contact = Partial<Record<'whatsapp' | 'email' | 'instagram' | 'facebook', ContactChannel>>;

export type Meta = { demo: boolean; products: number; offers: number; updatedAt: string | null; contact?: Contact };

// Día de descuento que anuncia un súper («Martes de frutas y verduras»), de data/promos.json.
export type Promo = {
  id: string;
  storeId: string;
  name: string;
  discount: number | null; // 25 = 25 %, o null si la tienda no lo dice
  weekdays: string[];      // se repite estos días, o…
  from: string | null;     // …va entre estas dos fechas
  to: string | null;
  categories: string[];
  keywords: string[];
  terms: string;          // condición de la tienda: «Con el Programa 99+»
  source: string | null;
};

export type Store = {
  id: string;
  name: string;
  homepage: string;
  platform: string | null;
  color: string | null;
  source: string;
  logo: string | null;
  icon: string | null;
  logoBg: string | null;
  offers: number;
  updatedAt: string | null;
  bestCount: number;
  clicks: number;
};

export type Category = { name: string; count: number };

export type UnitPrice = { amount: number; per: string };

export type ProductSummary = {
  id: number;
  path: string;
  name: string;
  brand: string | null;
  category: string;
  size: string | null;
  image: string | null;
  bestPrice: number;
  bestListPrice: number | null;
  bestStoreId: string;
  bestOfferId: number;
  storeCount: number;
  storeIds: string[];
  maxPrice: number;
  savings: number;
  unitPrice: UnitPrice | null;
};

export type SearchResult = { total: number; approximate: boolean; items: ProductSummary[] };

export type Offer = {
  id: number;
  storeId: string;
  storeName: string;
  storeColor: string | null;
  storeSource: string;
  title: string;
  price: number;
  listPrice: number | null;
  inStock: boolean;
  updatedAt: string;
  unitPrice: UnitPrice | null;
  isBest: boolean;
  comparable: boolean; // false: la tienda publicó otra presentación con el mismo código
  diff: number | null;
};

export type Product = {
  id: number;
  path: string;
  name: string;
  brand: string | null;
  category: string;
  size: string | null;
  gtin: string | null;
  image: string | null;
  bestPrice: number | null;
  savings: number;
  offers: Offer[];
  history: { day: string; price: number }[];
  similar: { brand: string | null; sameBrand: ProductSummary[]; others: ProductSummary[] };
};

export type PlanLine = { productId: number; path: string; label: string; qty: number; price: number; subtotal: number; offerId: number };
export type StoreTotal = {
  storeId: string;
  storeName: string;
  storeColor: string | null;
  total: number;
  comparableTotal: number;
  missing: string[];
  complete: boolean;
};
export type OptimizeResult = {
  split: { total: number; stores: { storeId: string; storeName: string; storeColor: string | null; subtotal: number; lines: PlanLine[] }[] };
  perStore: StoreTotal[];
  unavailable: string[];
  considered: number;
  thumbs: Record<string, { image: string | null; category: string }>;
  bestSingle: StoreTotal | null;
  savings: number | null;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, init);
  } catch {
    throw new Error('Sin conexión. Revisa tu internet e intenta de nuevo.');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`);
  return body as T;
}

// Las respuestas se guardan 5 minutos en memoria: al volver a una pantalla no
// se espera otra vez. Los precios cambian cada pocas horas.
const TTL = 5 * 60_000;
const cache = new Map<string, { at: number; promise: Promise<unknown> }>();

export function getJson<T>(path: string, { fresh = false } = {}): Promise<T> {
  const hit = cache.get(path);
  if (!fresh && hit && Date.now() - hit.at < TTL) return hit.promise as Promise<T>;
  const promise = request<T>(path).catch((err: unknown) => {
    cache.delete(path); // un error no se guarda: el próximo intento vuelve a pedir
    throw err;
  });
  cache.set(path, { at: Date.now(), promise });
  return promise;
}

export const postJson = <T>(path: string, data: unknown) =>
  request<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });

// /go/:id registra la visita y lleva a la tienda con utm_source=mercapty.
export const goUrl = (offerId: number) => `${API_URL}/go/${offerId}`;

// Lo que necesitan la bienvenida y la portada: se pide mientras corre el cerdito del arranque.
export const HOME_REQUESTS = ['/api/meta', '/api/stores', '/api/deals?limit=8', '/api/categories', '/api/products?limit=12'];
export const prefetchHome = () => Promise.allSettled(HOME_REQUESTS.map((path) => getJson(path)));
