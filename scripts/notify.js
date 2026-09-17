// Avisos al celular, por el servicio de Expo (gratis), a los teléfonos que guardó la app
// en la tabla `devices` desde Ajustes. Sin teléfonos registrados no hace nada.
//
//   npm run notify -- lista     lo que bajó de precio desde la corrida anterior
//   npm run notify -- promos    el día de descuento de hoy («Martes de frutas y verduras»)
//   npm run notify -- ofertas   la rebaja más grande del día
//   npm run notify -- prueba    un aviso de prueba a todos los teléfonos registrados
//
// Con NOTIFY_DRY=1 no envía nada: solo imprime lo que mandaría, para probar.
// Lo corre GitHub Actions: «lista» después de cada corrida de los bots y los otros dos por
// la mañana (.github/workflows/avisos.yml).
import { openDb } from '../server/db.js';
import { productPath } from '../server/lib/normalize.js';
import { activePromos } from '../server/promos.js';

const EXPO_URL = 'https://exp.host/--/api/v2/push/send';
const DRY = process.env.NOTIFY_DRY === '1';
const money = (n) => `$${Number(n).toFixed(2)}`;

// Textos en los dos idiomas de la app; cada teléfono guarda el suyo.
const TEXTS = {
  es: {
    dropOne: (d, store) => ({
      title: 'Bajó de precio',
      body: `${d.name}: ${money(d.new_price)} en ${store} (antes ${money(d.old_price)})`,
    }),
    dropMany: (drops) => ({
      title: `${drops.length} productos de tu lista bajaron de precio`,
      body: `${drops.slice(0, 2).map((d) => d.name).join(', ')}${drops.length > 2 ? ` y ${drops.length - 2} más` : ''}`,
    }),
    promo: (promo, store, more) => ({
      title: `Hoy: ${promo.name}`,
      body: [promo.discount ? `${promo.discount}% en ${store}` : `Día de descuento en ${store}`,
        more ? `y ${more} más` : 'Mira qué productos aplican'].join(' · '),
    }),
    deal: (item, store) => ({
      title: 'Hoy ahorras eligiendo bien',
      body: `${item.name}: ${money(item.price)} en ${store}, ${money(item.savings)} menos que en otra tienda`,
    }),
    test: () => ({
      title: 'Aviso de prueba',
      body: 'Si ves esto, los avisos de Mercapty funcionan en este teléfono.',
    }),
  },
  en: {
    dropOne: (d, store) => ({
      title: 'Price drop',
      body: `${d.name}: ${money(d.new_price)} at ${store} (was ${money(d.old_price)})`,
    }),
    dropMany: (drops) => ({
      title: `${drops.length} products in your list dropped in price`,
      body: `${drops.slice(0, 2).map((d) => d.name).join(', ')}${drops.length > 2 ? ` and ${drops.length - 2} more` : ''}`,
    }),
    promo: (promo, store, more) => ({
      title: `Today: ${promo.name}`,
      body: [promo.discount ? `${promo.discount}% at ${store}` : `Discount day at ${store}`,
        more ? `and ${more} more` : 'See which products apply'].join(' · '),
    }),
    deal: (item, store) => ({
      title: 'Today you save by choosing well',
      body: `${item.name}: ${money(item.price)} at ${store}, ${money(item.savings)} less than at another store`,
    }),
    test: () => ({
      title: 'Test alert',
      body: 'If you can read this, Mercapty alerts work on this phone.',
    }),
  },
};

const texts = (lang) => TEXTS[lang] ?? TEXTS.es;

function parseDevice(row) {
  const json = (text, fallback) => { try { return JSON.parse(text); } catch { return fallback; } };
  return {
    token: row.token,
    lang: row.lang === 'en' ? 'en' : 'es',
    prefs: { lista: true, promos: true, ofertas: false, ...json(row.prefs, {}) },
    products: json(row.products, []),
  };
}

// --- Qué avisar ---

async function fromDrops(db, devices) {
  const drops = await db.all(`
    SELECT d.product_id AS id, d.old_price, d.new_price, d.store_id, b.name
    FROM price_drops d JOIN product_best b ON b.product_id = d.product_id
    WHERE d.notified = 0`);
  if (!drops.length) return [];

  const byId = new Map(drops.map((d) => [d.id, d]));
  const stores = await storeNames(db);
  const messages = [];
  for (const device of devices.filter((d) => d.prefs.lista && d.products.length)) {
    const mine = device.products.map((id) => byId.get(id)).filter(Boolean);
    if (!mine.length) continue;
    const text = mine.length === 1
      ? texts(device.lang).dropOne(mine[0], stores.get(mine[0].store_id) ?? mine[0].store_id)
      : texts(device.lang).dropMany(mine);
    const path = mine.length === 1 ? productPath(mine[0].id, mine[0].name) : '/lista';
    messages.push({ to: device.token, ...text, data: { path } });
  }
  return messages;
}

async function fromPromos(db, devices) {
  const promos = activePromos();
  if (!promos.length) return [];
  const stores = await storeNames(db);
  const [promo] = promos;
  const store = stores.get(promo.storeId) ?? promo.storeId;
  const path = promo.categories.length === 1
    ? `/buscar?categoria=${encodeURIComponent(promo.categories[0])}`
    : '/';
  return devices
    .filter((d) => d.prefs.promos)
    .map((device) => ({
      to: device.token,
      ...texts(device.lang).promo(promo, store, promos.length - 1),
      data: { path },
    }));
}

// Las comparaciones malas (una caja publicada con el código de barras de la unidad) ya no
// llegan hasta aquí: product_best las aparta al hacerse (server/lib/compare.js).
async function fromDeals(db, devices) {
  const [item] = await db.all(`
    SELECT product_id AS id, name, price, savings, store_id
    FROM product_best WHERE store_count > 1 AND savings >= 0.5
    ORDER BY savings / price DESC LIMIT 1`);
  if (!item) return [];
  const stores = await storeNames(db);
  return devices
    .filter((d) => d.prefs.ofertas)
    .map((device) => ({
      to: device.token,
      ...texts(device.lang).deal(item, stores.get(item.store_id) ?? item.store_id),
      data: { path: productPath(item.id, item.name) },
    }));
}

// La prueba no mira preferencias: sirve para comprobar que el aviso llega al teléfono.
async function fromTest(db, devices) {
  return devices.map((device) => ({ to: device.token, ...texts(device.lang).test(), data: { path: '/ajustes' } }));
}

const storeNames = async (db) => new Map((await db.all('SELECT id, name FROM stores')).map((s) => [s.id, s.name]));

// --- Envío ---

// El servicio de Expo acepta 100 avisos por petición. Los teléfonos que ya no existen
// (la app se desinstaló) se borran para no seguir intentándolo.
async function send(db, messages) {
  let ok = 0;
  const dead = [];
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    const response = await fetch(EXPO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(batch),
    });
    const { data = [], errors } = await response.json();
    if (errors?.length) console.error('Expo devolvió errores:', errors);
    data.forEach((result, n) => {
      if (result.status === 'ok') return ok++;
      console.error(`  ✗ ${batch[n].to}: ${result.message ?? result.details?.error}`);
      if (result.details?.error === 'DeviceNotRegistered') dead.push(batch[n].to);
    });
  }
  if (dead.length) {
    await db.run(`DELETE FROM devices WHERE token IN (${dead.map(() => '?').join(',')})`, dead);
    console.log(`${dead.length} teléfonos dados de baja (la app ya no está instalada).`);
  }
  return ok;
}

// --- Programa ---

const kind = process.argv[2] ?? 'lista';
if (!['lista', 'promos', 'ofertas', 'prueba'].includes(kind)) {
  console.error('Uso: npm run notify -- lista | promos | ofertas | prueba');
  process.exit(1);
}

const db = await openDb();
const devices = (await db.all('SELECT token, lang, prefs, products FROM devices')).map(parseDevice);
const messages = devices.length
  ? await ({ lista: fromDrops, promos: fromPromos, ofertas: fromDeals, prueba: fromTest })[kind](db, devices)
  : [];

// Lo que bajó ya se avisó: no se repite en la próxima corrida, la siga quien la siga.
if (kind === 'lista') {
  await db.run('UPDATE price_drops SET notified = 1 WHERE notified = 0');
  await db.run("DELETE FROM price_drops WHERE seen_at < datetime('now', '-7 day')");
}

if (!messages.length) {
  console.log(`Nada que avisar (${kind}): ${devices.length} teléfonos registrados.`);
} else if (DRY) {
  console.log(`Prueba (${kind}): ${messages.length} avisos, no se envió nada.`);
  for (const m of messages.slice(0, 5)) console.log(`  → ${m.to}\n    ${m.title}\n    ${m.body}\n    ${m.data.path}`);
} else {
  const ok = await send(db, messages);
  console.log(`Avisos enviados (${kind}): ${ok} de ${messages.length}.`);
}
db.close();
