// Bot de códigos de barras. Las tiendas de Shopify (Arrocha, Super Barú, El
// Fuerte, Multimax, Rodelag, Melo) publican su catálogo entero en /products.json,
// pero ese catálogo nunca trae el código de barras: son unas 46 000 ofertas que
// solo se unen por nombre, marca y tamaño, y que el escáner de la app no
// encuentra. La ficha de cada producto sí lo trae, en /products/<handle>.js, con
// el código de todas sus variantes de una sola petición.
//
// Este bot corre aparte del de precios y no lo estorba: guarda lo que encuentra
// en la tabla store_barcodes y es scripts/ingest.js quien, la próxima vez que
// recorre la tienda, le pega el código a cada oferta. Si el bot falla o va a
// medias, los precios siguen entrando igual.
//
// Cada corrida lee lo que alcanza en su tiempo (CODIGOS_MINUTES; 300 por
// defecto) en este orden:
//   1. los productos que otra tienda también vende y todavía no tienen código
//      (son los que ganan algo: el código los une y los hace escaneables);
//   2. los que nunca ha visitado;
//   3. los que toca releer (un código no cambia, así que se releen de tarde en
//      tarde; los que dieron error, a los dos días).
// La cola se reparte entre turnos que corren a la vez (CODIGOS_PARTES y
// CODIGOS_PARTE), igual que el bot de Súper 99.
//   npm run codigos                        -> corrida completa
//   npm run codigos -- arrocha             -> solo esa tienda
//   CODIGOS_MINUTES=2 npm run codigos      -> prueba corta
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { openDb, ROOT } from '../server/db.js';
import { BOT_HEADERS, fetchText, sleep } from '../connectors/util.js';
import { normalizeGtin } from '../server/lib/normalize.js';

const DAY = 24 * 3600000;
// Un código de barras no cambia. Se relee de tarde en tarde solo por si la
// tienda corrigió el suyo; lo que dio error, pronto.
const REVISIT = { ok: 120 * DAY, vacio: 60 * DAY, gone: 30 * DAY, error: 2 * DAY };
const PAGE_SIZE = 250;
const BATCH = 100;

const only = process.argv.slice(2);
const started = Date.now();
const budget = (Number(process.env.CODIGOS_MINUTES) || 300) * 60000;
const partes = Math.max(1, Number(process.env.CODIGOS_PARTES) || 1);
const parte = Math.min(partes - 1, Math.max(0, Number(process.env.CODIGOS_PARTE) || 0));
const log = console.log;

const tiendas = JSON.parse(readFileSync(path.join(ROOT, 'data', 'stores.json'), 'utf8'))
  .filter((t) => t.enabled !== false && t.connector?.type === 'shopify' && t.connector.barcodes !== false)
  .filter((t) => !only.length || only.includes(t.id));

if (!tiendas.length) {
  console.error('No hay tiendas de Shopify que revisar.');
  process.exit(1);
}

const db = await openDb();

// El catálogo de la tienda: qué productos hay y qué variantes tiene cada uno.
// Es la misma consulta barata que usa el bot de precios (250 por página).
async function catalogo(tienda) {
  const origin = new URL(tienda.homepage).origin;
  const cfg = tienda.connector;
  const productos = [];
  for (let page = 1; page <= (cfg.maxPages ?? 40) + 5; page++) {
    const res = await fetchText(`${origin}/products.json?limit=${PAGE_SIZE}&page=${page}`, BOT_HEADERS);
    if (res.status !== 'ok') throw new Error(`su catálogo respondió ${res.problem ?? res.status}`);
    const { products = [] } = JSON.parse(res.text);
    for (const p of products) {
      const skus = (p.variants ?? []).map((v) => String(v.id));
      if (skus.length) productos.push({ handle: p.handle, skus });
    }
    if (products.length < PAGE_SIZE) break;
    await sleep(cfg.delayMs ?? 1500);
  }
  return productos;
}

// Los códigos de barras de un producto: una petición trae todas sus variantes.
async function codigosDe(origin, handle) {
  const res = await fetchText(`${origin}/products/${handle}.js`, BOT_HEADERS);
  if (res.status === 'gone') return { status: 'gone', codigos: new Map() };
  if (res.status !== 'ok') return { status: 'error', codigos: new Map() };
  let data;
  try {
    data = JSON.parse(res.text);
  } catch {
    return { status: 'error', codigos: new Map() };
  }
  const codigos = new Map();
  for (const v of data.variants ?? []) codigos.set(String(v.id), normalizeGtin(v.barcode));
  return { status: 'ok', codigos };
}

const total = { ok: 0, vacio: 0, gone: 0, error: 0, nuevos: 0 };

for (const tienda of tiendas) {
  if (Date.now() - started > budget) {
    log(`- ${tienda.name}: no queda tiempo en esta corrida`);
    continue;
  }
  const origin = new URL(tienda.homepage).origin;
  let productos;
  try {
    productos = await catalogo(tienda);
  } catch (err) {
    console.error(`✗ ${tienda.name}: ${err.message}`);
    total.error++;
    continue;
  }

  // Lo que ya se sabe de esta tienda y qué productos valen más la pena.
  const visto = new Map((await db.all('SELECT sku, fetched_at, status FROM store_barcodes WHERE store_id = ?', [tienda.id]))
    .map((r) => [r.sku, { at: Date.parse(r.fetched_at), status: r.status }]));
  // Ofertas de esta tienda que otra tienda también vende y que todavía no tienen
  // código: son las que más ganan con la visita.
  const valiosos = new Set((await db.all(`
    SELECT o.store_sku FROM offers o
    JOIN products p ON p.id = o.product_id
    WHERE o.store_id = ? AND o.store_sku IS NOT NULL AND p.gtin IS NULL AND EXISTS (
      SELECT 1 FROM offers x WHERE x.product_id = o.product_id AND x.store_id <> o.store_id)
  `, [tienda.id])).map((r) => r.store_sku));

  const ahora = Date.now();
  // Un producto hace falta si alguna de sus variantes no se ha visitado o ya toca releerla.
  const toca = (p) => p.skus.some((sku) => {
    const v = visto.get(sku);
    return !v || ahora - v.at > (REVISIT[v.status] ?? REVISIT.ok);
  });
  const nuevo = (p) => p.skus.some((sku) => !visto.has(sku));
  const edad = (p) => ahora - Math.min(...p.skus.map((sku) => visto.get(sku)?.at ?? 0));

  const pendientes = productos.filter(toca);
  const cola = [
    ...pendientes.filter((p) => p.skus.some((sku) => valiosos.has(sku))),
    ...pendientes.filter((p) => !p.skus.some((sku) => valiosos.has(sku)) && nuevo(p)),
    ...pendientes.filter((p) => !p.skus.some((sku) => valiosos.has(sku)) && !nuevo(p)).sort((a, b) => edad(b) - edad(a)),
  ];
  const mios = partes > 1 ? cola.filter((_, i) => i % partes === parte) : cola;
  log(`  ${tienda.name}: ${productos.length} productos, ${cola.length} por revisar`
    + `${partes > 1 ? `, ${mios.length} en este turno (${parte + 1} de ${partes})` : ''}`);

  const stats = { ok: 0, vacio: 0, gone: 0, error: 0, nuevos: 0 };
  let filas = [];
  const guardar = async () => {
    if (!filas.length) return;
    await db.batch(filas.map(([sku, gtin, status, at]) => ({
      sql: `INSERT INTO store_barcodes (store_id, sku, gtin, fetched_at, status) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(store_id, sku) DO UPDATE SET gtin = excluded.gtin, fetched_at = excluded.fetched_at, status = excluded.status`,
      args: [tienda.id, sku, gtin, at, status],
    })));
    filas = [];
  };

  let hechos = 0;
  for (const p of mios) {
    if (Date.now() - started > budget) break;
    const { status, codigos } = await codigosDe(origin, p.handle);
    const at = new Date().toISOString();
    for (const sku of p.skus) {
      const gtin = codigos.get(sku) ?? null;
      const estado = status !== 'ok' ? status : gtin ? 'ok' : 'vacio';
      stats[estado]++;
      if (estado === 'ok' && !visto.get(sku)) stats.nuevos++;
      filas.push([sku, gtin, estado, at]);
    }
    if (++hechos % BATCH === 0) {
      await guardar();
      log(`  ${tienda.name}: ${hechos} productos en ${Math.round((Date.now() - started) / 60000)} min`);
    }
    await sleep(tienda.connector.delayMs ?? 1500);
  }
  await guardar();

  for (const k of Object.keys(stats)) total[k] += stats[k];
  const notas = [
    `${stats.ok} con código`, stats.nuevos && `${stats.nuevos} nuevos`,
    stats.vacio && `${stats.vacio} sin código en la tienda`,
    stats.gone && `${stats.gone} ya no existen`, stats.error && `${stats.error} con error`,
  ].filter(Boolean);
  log(`✓ ${tienda.name}: ${hechos} productos (${notas.join(', ')}). Quedan ${mios.length - hechos} para la próxima.`);
}

const guardados = (await db.all('SELECT COUNT(*) n FROM store_barcodes WHERE gtin IS NOT NULL'))[0].n;
log(`\nCódigos guardados en total: ${guardados}. Los precios los recogen en la próxima corrida de bots.`);
db.close();
// Si se visitaron productos y ninguno dio código, algo cambió en su web.
process.exitCode = total.ok + total.vacio + total.gone > 0 && total.ok === 0 ? 1 : 0;
