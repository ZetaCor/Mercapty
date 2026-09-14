// Registro de conectores (bots). Cada tienda en data/stores.json elige uno con
// "connector": { "type": "..." }. Un conector exporta
// fetchOffers(store, ctx) -> Promise<ofertas crudas>.
import * as feed from './feed.js';
import * as instaleap from './instaleap.js';
import * as magento from './magento.js';
import * as ribasmith from './ribasmith.js';
import * as shopify from './shopify.js';
import * as vtex from './vtex.js';
import * as woocommerce from './woocommerce.js';

export const connectors = { feed, instaleap, magento, ribasmith, shopify, vtex, woocommerce };
