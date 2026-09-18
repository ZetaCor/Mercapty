// Escribe la lista de tiendas que hay que recorrer, en JSON, para que GitHub Actions arme un
// trabajo por cada una (.github/workflows/precios.yml). Quedan fuera las apagadas y Súper 99,
// que tiene su propio bot porque hay que leer su web producto por producto.
//
// No importa nada del proyecto a propósito: el trabajo que lo llama no instala dependencias.
//
//   node scripts/tiendas.js   ->   ["superxtra","elmachetazo",...]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stores = JSON.parse(readFileSync(path.join(raiz, 'data', 'stores.json'), 'utf8'));

const ids = stores
  .filter((s) => s.enabled !== false && s.connector && s.connector.type !== 'pages')
  .map((s) => s.id);

console.log(JSON.stringify(ids));
