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

// Texto para direcciones web: "Leche Entera Estrella Azul 946ml" -> "leche-entera-estrella-azul-946ml"
export function slugify(text, max = 80) {
  return normalizeText(text).replace(/ /g, '-').slice(0, max).replace(/-+$/, '');
}

// Dirección pública de un producto. El número basta para encontrarlo; el
// nombre ayuda a Google y a quien ve el enlace.
export const productPath = (id, name) => `/producto/${id}${name ? `-${slugify(name)}` : ''}`;

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
  const gtin = digits.padStart(14, '0');
  // Códigos de circulación interna (prefijos 2, 02 y 04), que cada tienda
  // inventa para productos pesados o propios, y números cuyo dígito
  // verificador no cuadra (SKU internos): no sirven para comparar entre tiendas.
  return /^(02|002|004)/.test(gtin) || !isValidGtin(gtin) ? null : gtin;
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

// Devuelve { value, unit, count } en unidades base (g, ml, un) o null. En
// "6 x 355 ml", value es el total (2130 ml) y count las unidades (6).
export function parseSize(text) {
  const m = SIZE_RE.exec(stripAccents(text).toLowerCase());
  if (!m) return null;
  const [, multiplier, amount, unitRaw] = m;
  const [unit, factor] = UNITS[unitRaw];
  const count = multiplier ? Number(multiplier) : 1;
  const value = Number(amount.replace(',', '.')) * factor * count;
  return { value: Math.round(value * 100) / 100, unit, count };
}

// Paquetes de varias unidades: "Pack de 12", "6 pack", "3pack", "Paquete de 3", "Caja de 24".
const PACK_RE = /(?:pack|paquete|caja)\s*(?:de\s*)?(\d{1,3})\b|\b(\d{1,3})\s*(?:pack|pk)\b/;
export function parsePack(text) {
  const m = PACK_RE.exec(normalizeText(text).replace(/(\d)(pack|pk)\b/g, '$1 $2'));
  const n = m ? Number(m[1] ?? m[2]) : 1;
  return n > 1 && n <= 100 ? n : 1;
}

// Precio por kg, por litro o por unidad, para comparar presentaciones distintas.
export function unitPrice(price, sizeValue, sizeUnit) {
  if (!price || !sizeValue || !sizeUnit) return null;
  if (sizeUnit === 'g') return { amount: (price / sizeValue) * 1000, per: 'kg' };
  if (sizeUnit === 'ml') return { amount: (price / sizeValue) * 1000, per: 'L' };
  return { amount: price / sizeValue, per: 'unidad' };
}

// Qué es el producto según cómo empieza su nombre: en español casi siempre lo
// dice la primera palabra («Aceite Pam», «Arepa de maíz», «Pasta dental
// Colgate»), venga de la tienda que venga. Gana la frase más larga. Las
// palabras que pueden ser muchas cosas («crema», «jabón», «gel») no están:
// ahí decide la categoría de la tienda.
const NAME_HEADS = {
  'Cuidado personal': 'pasta dental|crema dental|cepillo dental|hilo dental|enjuague bucal|papel higienico|toallas sanitarias|toalla sanitaria|protectores diarios|agua oxigenada|alcohol|shampoo|champu|acondicionador|desodorante|antitranspirante|afeitadora|rastrillo|protector solar|bloqueador solar|talco',
  'Bebé': 'panales|panal|toallitas humedas|toallitas|formula infantil|formula|compota|compotas|cereal infantil|aceite de bebe|colonia de bebe|biberon|pacha',
  'Mascotas': 'alimento para perro|alimento para perros|alimento para gato|alimento para gatos|comida para perro|comida para gato|arena para gato|arena sanitaria|snack para perro|snacks para perro',
  'Lácteos y huevos': 'arroz con leche|crema de leche|bebida de soya|bebida de almendra|bebida de avena|bebida lactea|leche|leches|lechera|queso|quesos|yogurt|yogur|kumis|mantequilla|margarina|natilla|requeson|huevo|huevos|cheese|milk',
  Despensa: 'mantequilla de mani|leche de coco|leche coco|crema para cafe|nescafe|maizena|fecula|chicheme|aceite|aceites|arroz|frijol|frijoles|lenteja|lentejas|garbanzo|garbanzos|poroto|porotos|arveja|arvejas|azucar|sal|harina|pasta|pastas|spaghetti|espagueti|fideo|fideos|macarrones|coditos|tallarines|salsa|salsas|ketchup|mayonesa|mostaza|vinagre|aderezo|dip|sopa|sopas|consome|caldo|atun|sardina|sardinas|ajo|ajos|adobo|condimento|sazonador|sazon|pimienta|oregano|comino|canela|achiote|curry|cafe|avena|maicena|gelatina|flan|pudin|mermelada|jalea|miel|maiz|pure|levadura|polvo de hornear',
  'Carnes y embutidos': 'carne|carnes|res|cerdo|pollo|pechuga|pechugas|muslo|muslos|chuleta|chuletas|costilla|costillas|bistec|lomo|molida|filete|jamon|salchicha|salchichas|chorizo|chorizos|tocino|mortadela|salami|pavo|pescado|camaron|camarones|langostino|langostinos|pulpo|calamar|corvina|salmon|tilapia|hamburguesa|hamburguesas',
  'Panadería y snacks': 'pan|panes|arepa|arepas|arepitas|tortilla|tortillas|bollo|bollos|galleta|galletas|cereal|cereales|papitas|papas fritas|papas rizadas|papas onduladas|papas tostadas|chips|chocolate|chocolates|bombones|caramelos|gomitas|chicles|mani|bizcocho|pastel|rosquitas|tostadas|palomitas|granola|dulce|dulces',
  Bebidas: 'agua de coco|agua|jugo|jugos|nectar|soda|sodas|refresco|refrescos|gaseosa|bebida|bebidas|te|malta|cerveza|cervezas|vino|vinos|ron|seco|whisky|vodka|ginebra|tequila|licor|sangria|energizante|hidratante',
  Limpieza: 'detergente|cloro|suavizante|lavaplatos|desinfectante|limpiador|limpiavidrios|desengrasante|blanqueador|jabon para ropa|jabon en polvo|servilletas|toallas de papel|papel toalla|bolsas de basura|bolsas para basura|esponja|esponjas|escoba|trapeador|insecticida|ambientador|aromatizante|papel aluminio|guantes',
  Congelados: 'helado|helados|papas congeladas|nuggets|hielo',
  'Frutas y verduras': 'manzana|manzanas|banano|guineo|platano|platanos|papa|cebolla|cebollas|tomate|tomates|lechuga|zanahoria|zanahorias|limon|limones|naranja|naranjas|pina|papaya|sandia|melon|uva|uvas|fresa|fresas|aguacate|yuca|name|otoe|culantro|pimenton|pepino|repollo|brocoli|apio|mango|mandarina|pera|peras',
};
// Palabras con que empiezan algunos nombres y no dicen qué es: «3pack», «Promo», «Caja de».
const HEAD_FILLER = /^(\d+([.,]\d+)?(pack|pk|u|un|und|x)?|x\d+|pack|paquete|caja|six|promo|oferta|combo|kit|set|display|nuevo|nueva|mini|maxi|de|la|el|los|las|del)$/;
const NAME_PHRASES = new Map(); // primera palabra -> [[palabras, categoría]], de la frase más larga a la más corta
for (const [category, list] of Object.entries(NAME_HEADS)) {
  for (const phrase of list.split('|')) {
    const words = phrase.split(' ');
    if (!NAME_PHRASES.has(words[0])) NAME_PHRASES.set(words[0], []);
    NAME_PHRASES.get(words[0]).push([words, category]);
  }
}
for (const list of NAME_PHRASES.values()) list.sort((a, b) => b[0].length - a[0].length);

// Categoría según cómo empieza el nombre, o null si su primera palabra no lo dice.
export function categoryFromName(name = '') {
  const words = normalizeText(name).split(' ').filter(Boolean);
  let start = 0;
  while (start < words.length - 1 && HEAD_FILLER.test(words[start])) start++;
  const match = NAME_PHRASES.get(words[start])?.find(([phrase]) => phrase.every((w, i) => words[start + i] === w));
  return match?.[1] ?? null;
}

// Si el nombre no lo dice, se usa la categoría de la tienda ("Lácteos, Quesos
// y refrigerados", "Supermercado/Despensa/Leches"...) buscando palabras clave
// y, si no hay, el resto del nombre. El orden importa: la primera regla que
// coincide gana. «Refrigerados» no cuenta: ahí las tiendas meten de todo.
const CATEGORY_RULES = [
  ['Bebé', /\b(bebe|bebes|panal|panales|toallitas|infantil|formula infantil)\b/],
  ['Mascotas', /\b(mascota|mascotas|perro|perros|gato|gatos)\b/],
  ['Frutas y verduras', /\b(fruta|frutas|verdura|verduras|vegetales|hortalizas)\b/],
  ['Carnes y embutidos', /\b(carne|carnes|pollo|res|cerdo|embutido|embutidos|jamon|salchicha|salchichas|mariscos|pescado|pescados|deli)\b/],
  ['Lácteos y huevos', /\b(lacteo|lacteos|leche|leches|queso|quesos|yogur|yogurt|mantequilla|huevo|huevos)\b/],
  ['Congelados', /\b(congelado|congelados|helado|helados)\b/],
  ['Panadería y snacks', /\b(pan|panes|panaderia|reposteria|galleta|galletas|snack|snacks|golosina|golosinas|dulces|chocolate|chocolates|cereal|cereales|arepa|arepas|tortilla|tortillas|bollo|bollos)\b/],
  ['Bebidas', /\b(bebida|bebidas|agua|jugo|jugos|refresco|refrescos|soda|sodas|gaseosa|gaseosas|cola|malta|energizante|energizantes|energetica|energeticas|hidratante|isotonica|cerveza|cervezas|vino|vinos|licor|licores|ron|whisky)\b/],
  ['Limpieza', /\b(limpieza|detergente|detergentes|cloro|desinfectante|lavaplatos|suavizante|lavanderia|hogar)\b/],
  ['Cuidado personal', /\b(cuidado personal|higiene|shampoo|champu|jabon|desodorante|dental|belleza|farmacia|papel higienico)\b/],
  ['Despensa', /\b(despensa|abarrotes|arroz|frijol|frijoles|aceite|aceites|azucar|pasta|pastas|enlatado|enlatados|condimento|condimentos|salsa|salsas|harina|granos|cafe|sopa|sopas|atun)\b/],
];

export function canonicalCategory(categoryText = '', name = '') {
  const fromName = categoryFromName(name);
  if (fromName) return fromName;
  const category = normalizeText(categoryText);
  const title = normalizeText(name);
  const byCategory = category ? CATEGORY_RULES.filter(([, re]) => re.test(category)) : [];
  // Categorías mezcladas de la tienda ("Snacks y Bebidas"): decide el nombre del producto.
  if (byCategory.length > 1) return (byCategory.find(([, re]) => re.test(title)) ?? byCategory[0])[0];
  if (byCategory.length === 1) return byCategory[0][0];
  return CATEGORY_RULES.find(([, re]) => re.test(title))?.[0] ?? 'Otros';
}

// Llave para decidir si dos ofertas de tiendas distintas son el mismo producto.
// El código de barras es la única coincidencia confiable; sin él se usa
// marca + nombre + presentación, que sirve para socios con catálogos simples.
export function matchKey({ gtin, brand, name, sizeValue, sizeUnit, pack = 1 }) {
  // Un paquete de 12 no es lo mismo que una unidad, aunque la tienda use el
  // código de barras de la unidad (Superunico lo hace).
  if (gtin) return pack > 1 ? `gtin:${gtin}|x${pack}` : `gtin:${gtin}`;
  const size = sizeValue ? `${Math.round(sizeValue)}${sizeUnit}` : '';
  return `name:${normalizeText(brand)}|${normalizeText(name)}|${size}`;
}
