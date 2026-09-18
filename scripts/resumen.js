// Rehace el resumen que usa la web: la categoría que dice el nombre de cada producto, el
// mejor precio de cada uno y los totales por categoría y por tienda. Antes lo hacía el propio
// scripts/ingest.js al terminar, pero desde que cada tienda corre en su propio trabajo de
// GitHub Actions (.github/workflows/precios.yml) hace falta un paso aparte, cuando todas han
// acabado: si cada bot lo rehiciera, se repetiría el trabajo diez veces y con datos a medias.
//
//   npm run resumen
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { openDb, rebuildAggregates, upsertStore, ROOT } from '../server/db.js';
import { recategorize } from './lib/pipeline.js';

const db = await openDb();

const tiendas = JSON.parse(readFileSync(path.join(ROOT, 'data', 'stores.json'), 'utf8'));
const enLaBase = new Set((await db.all('SELECT id FROM stores')).map((t) => t.id));
const puestasAlDia = tiendas.filter((t) => enLaBase.has(t.id));
for (const tienda of puestasAlDia) await upsertStore(db, tienda);
console.log(`Datos al día de ${puestasAlDia.length} tiendas (nombre, color, logo).`);

const moved = await recategorize(db);
if (moved) console.log(`${moved} productos pasaron a la categoría que dice su nombre.`);

const totals = await rebuildAggregates(db);
console.log(`Base lista: ${totals.products} productos, ${totals.offers} ofertas disponibles.`);
db.close();
