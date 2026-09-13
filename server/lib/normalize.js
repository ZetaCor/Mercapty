// Normalización compartida por los conectores y la API: texto, códigos de
// barras (GTIN) y presentaciones ("946 ml", "5 lb", "6 x 355 ml").

export function stripAccents(s) {
  return String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '');
}

// Texto para búsquedas y llaves de coincidencia: minúsculas, sin tildes,
// solo letras/números separados por un espacio.
export function normalizeText(s) {
  return stripAccents(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function gtinCheckDigit(body) {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const digit = Number(body[body.length - 1 - i]);
    sum += i % 2 === 0 ? digit * 3 : digit;
  }
  return String((10 - (sum % 10)) % 10);
}

export function isValidGtin(gtin) {
  return /^\d{8,14}$/.test(gtin) && gtinCheckDigit(gtin.slice(0, -1)) === gtin.slice(-1);
}

// Lleva cualquier EAN-8/UPC-A/EAN-13 a GTIN-14 rellenando con ceros a la
// izquierda. Algunas tiendas omiten el cero inicial del UPC (Super Xtra
// publica "88209972267" en vez de "088209972267"); al rellenar a 14 dígitos
// ambas formas terminan siendo el mismo código.
export function normalizeGtin(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 14) return null;
  return digits.padStart(14, '0');
}

const UNITS = {
  kg: ['g', 1000], g: ['g', 1], gr: ['g', 1], grs: ['g', 1], mg: ['g', 0.001],
  lb: ['g', 453.592], lbs: ['g', 453.592], oz: ['g', 28.3495],
  l: ['ml', 1000], lt: ['ml', 1000], lts: ['ml', 1000], litro: ['ml', 1000], litros: ['ml', 1000],
  ml: ['ml', 1], gal: ['ml', 3785.41],
  un: ['un', 1], und: ['un', 1], unid: ['un', 1], unidades: ['un', 1],
  rollos: ['un', 1], sobres: ['un', 1], pack: ['un', 1],
};
const SIZE_RE = /(?:(\d+)\s*[x×]\s*)?(\d+(?:[.,]\d+)?)\s*(kg|mg|grs|gr|g|lbs|lb|oz|ml|litros|litro|lts|lt|l|gal|unidades|unid|und|un|rollos|sobres|pack)(?![a-z])/;

// Devuelve { value, unit } en unidades base (g, ml, un) o null.
export function parseSize(text) {
  const m = SIZE_RE.exec(stripAccents(text).toLowerCase());
  if (!m) return null;
  const [, multiplier, amount, unitRaw] = m;
  const [unit, factor] = UNITS[unitRaw];
  const value = Number(amount.replace(',', '.')) * factor * (multiplier ? Number(multiplier) : 1);
  return { value: Math.round(value * 100) / 100, unit };
}

// Precio por kg, por litro o por unidad, para comparar presentaciones distintas.
export function unitPrice(price, sizeValue, sizeUnit) {
  if (!price || !sizeValue || !sizeUnit) return null;
  if (sizeUnit === 'g') return { amount: (price / sizeValue) * 1000, per: 'kg' };
  if (sizeUnit === 'ml') return { amount: (price / sizeValue) * 1000, per: 'L' };
  return { amount: price / sizeValue, per: 'unidad' };
}

// Cada súper nombra sus categorías a su manera ("Lácteos, Quesos y
// refrigerados", "Supermercado/Despensa/Leches"...). Se llevan a una lista
// común buscando palabras clave en la categoría y, si no hay, en el nombre.
// El orden importa: la primera regla que coincide gana.
const CATEGORY_RULES = [
  ['Bebé', /\b(bebe|bebes|panal|panales|toallitas|infantil|formula infantil)\b/],
  ['Mascotas', /\b(mascota|mascotas|perro|perros|gato|gatos)\b/],
  ['Frutas y verduras', /\b(fruta|frutas|verdura|verduras|vegetales|hortalizas)\b/],
  ['Carnes y embutidos', /\b(carne|carnes|pollo|res|cerdo|embutido|embutidos|jamon|salchicha|salchichas|mariscos|pescado|pescados|deli)\b/],
  ['Lácteos y huevos', /\b(lacteo|lacteos|leche|leches|queso|quesos|yogur|yogurt|mantequilla|huevo|huevos|refrigerados)\b/],
  ['Congelados', /\b(congelado|congelados|helado|helados)\b/],
  ['Panadería y snacks', /\b(pan|panes|panaderia|reposteria|galleta|galletas|snack|snacks|golosina|golosinas|dulces|chocolate|chocolates|cereal|cereales)\b/],
  ['Bebidas', /\b(bebida|bebidas|agua|jugo|jugos|refresco|refrescos|soda|sodas|cerveza|cervezas|vino|vinos|licor|licores|ron|whisky)\b/],
  ['Limpieza', /\b(limpieza|detergente|detergentes|cloro|desinfectante|lavaplatos|suavizante|lavanderia|hogar)\b/],
  ['Cuidado personal', /\b(cuidado personal|higiene|shampoo|champu|jabon|desodorante|dental|belleza|farmacia|papel higienico)\b/],
  ['Despensa', /\b(despensa|abarrotes|arroz|frijol|frijoles|aceite|aceites|azucar|pasta|pastas|enlatado|enlatados|condimento|condimentos|salsa|salsas|harina|granos|cafe|sopa|sopas|atun)\b/],
];

export function canonicalCategory(...texts) {
  for (const text of texts) {
    const normalized = normalizeText(text);
    if (!normalized) continue;
    const match = CATEGORY_RULES.find(([, re]) => re.test(normalized));
    if (match) return match[0];
  }
  return 'Otros';
}

// Llave para decidir si dos ofertas de tiendas distintas son el mismo producto.
// El código de barras es la única coincidencia confiable; sin él se usa
// marca + nombre + presentación, que sirve para socios con catálogos simples.
export function matchKey({ gtin, brand, name, sizeValue, sizeUnit }) {
  if (gtin) return `gtin:${gtin}`;
  const size = sizeValue ? `${Math.round(sizeValue)}${sizeUnit}` : '';
  return `name:${normalizeText(brand)}|${normalizeText(name)}|${size}`;
}
