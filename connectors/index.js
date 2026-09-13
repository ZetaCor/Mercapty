// Registro de conectores. Cada tienda en data/stores.json elige uno con
// "connector": { "type": "..." }. Un conector exporta
// fetchOffers(store, ctx) -> Promise<ofertas crudas>.
import * as demo from './demo.js';
import * as feed from './feed.js';
import * as vtex from './vtex.js';

export const connectors = { demo, feed, vtex };
