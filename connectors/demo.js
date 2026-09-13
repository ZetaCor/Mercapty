// Conector de demostración: genera precios FICTICIOS a partir de
// data/demo-catalog.json para poder ver la app funcionando sin acuerdos con
// las tiendas. Los botones de compra sí llevan a la búsqueda real de cada tienda.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { gtinCheckDigit } from '../server/lib/normalize.js';
import { storeSearchUrl } from './util.js';

// Prefijo GS1 200: códigos de circulación interna, nunca asignados a un
// producto real, así la demo no choca con códigos de barras verdaderos.
export function demoGtin(id) {
  const body = `200${String(id).padStart(9, '0')}`;
  return body + gtinCheckDigit(body);
}

// PRNG determinístico (mulberry32) para que la demo dé los mismos precios en cada corrida.
function seededRandom(seedText) {
  let seed = 0;
  for (const ch of seedText) seed = (Math.imul(31, seed) + ch.charCodeAt(0)) | 0;
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Precios con terminación típica de góndola: .x5 o .x9
function shelfPrice(value, rand) {
  const dimes = Math.floor(value * 10) / 10;
  return Number((dimes + (rand() < 0.5 ? 0.05 : 0.09)).toFixed(2));
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function fetchOffers(store, { root, now = new Date() }) {
  const catalog = JSON.parse(readFileSync(path.join(root, 'data', 'demo-catalog.json'), 'utf8'));
  const offers = [];

  for (const item of catalog) {
    const rand = seededRandom(`${store.id}:${item.id}`);
    if (rand() < 0.18) continue; // esta tienda no maneja el producto

    const price = shelfPrice(item.basePrice * (0.9 + rand() * 0.22), rand);
    const onPromo = rand() < 0.14;
    const history = [];
    for (let week = 8; week >= 1; week--) {
      history.push({
        price: shelfPrice(price * (0.95 + rand() * 0.14), rand),
        seenAt: new Date(now.getTime() - week * WEEK_MS).toISOString(),
      });
    }

    offers.push({
      sku: `${store.id}-${item.id}`,
      gtin: demoGtin(item.id),
      title: `${item.name} ${item.brand} ${item.size}`,
      name: item.name,
      brand: item.brand,
      category: item.category,
      size: item.size,
      price,
      listPrice: onPromo ? shelfPrice(price * (1.12 + rand() * 0.15), rand) : null,
      inStock: rand() > 0.06,
      url: storeSearchUrl(store, `${item.name} ${item.brand}`),
      history,
    });
  }
  return offers;
}
