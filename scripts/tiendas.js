// Escribe la lista de tiendas que hay que recorrer, en JSON, para que GitHub Actions arme un
// trabajo por cada una (.github/workflows/precios.yml). Quedan fuera las apagadas y Súper 99,
// que tiene su propio bot porque hay que leer su web producto por producto.
//
// No importa nada del proyecto a propósito: el trabajo que lo llama no instala dependencias.
//
//   node scripts/tiendas.js                     ->  ["superxtra","elmachetazo",...]
//   node scripts/tiendas.js superbaru,elfuerte  ->  ["superbaru","elfuerte"]
//
// Lo segundo sirve para meter una tienda nueva sin recorrer otra vez las demás.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stores = JSON.parse(readFileSync(path.join(raiz, 'data', 'stores.json'), 'utf8'));

const pedidas = (process.argv[2] ?? '').split(',').map((s) => s.trim()).filter(Boolean);

const ids = stores
  .filter((s) => s.enabled !== false && s.connector && s.connector.type !== 'pages')
  .filter((s) => !pedidas.length || pedidas.includes(s.id))
  .map((s) => s.id);

const sobran = pedidas.filter((id) => !ids.includes(id));
if (sobran.length) throw new Error('no hay tienda activa con ese nombre: ' + sobran.join(', '));

console.log(JSON.stringify(ids));
