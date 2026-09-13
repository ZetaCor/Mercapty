// URL a la que se envía al cliente cuando no hay enlace directo al producto:
// la página de búsqueda de la tienda, o su portada si no tiene una conocida.
export function storeSearchUrl(store, query) {
  if (!store.searchUrl) return store.homepage;
  return store.searchUrl.replaceAll('{q}', encodeURIComponent(query));
}

// Los bots se identifican y piden JSON, igual que el sitio de la tienda.
export const BOT_HEADERS = {
  'User-Agent': 'MercaptyBot/0.3 (comparador de precios de supermercados de Panama)',
  Accept: 'application/json',
};

// Términos que usan los bots que buscan por palabra (Instaleap, y VTEX si no se
// recorre por categorías): lo más comprado en un súper, con marcas muy buscadas.
export const GROCERY_QUERIES = [
  // Lácteos y huevos
  'leche', 'queso', 'yogurt', 'mantequilla', 'margarina', 'huevos', 'crema',
  // Despensa
  'arroz', 'frijoles', 'lentejas', 'garbanzos', 'aceite', 'azucar', 'sal', 'cafe', 'te', 'pasta', 'spaghetti',
  'harina', 'avena', 'cereal', 'atun', 'sardina', 'salsa', 'ketchup', 'mayonesa', 'mostaza', 'vinagre', 'sopa',
  'consome', 'maiz', 'galletas', 'pan', 'tortillas', 'mermelada', 'miel', 'chocolate',
  // Bebidas
  'agua', 'jugo', 'soda', 'coca cola', 'pepsi', 'sprite', 'fanta', 'gatorade', 'malta', 'te frio', 'cerveza',
  'energizante',
  // Carnes, embutidos y congelados
  'pollo', 'carne', 'cerdo', 'jamon', 'salchichas', 'chorizo', 'tocino', 'pescado', 'camaron', 'helado',
  // Frutas y verduras
  'platano', 'papa', 'cebolla', 'tomate', 'lechuga', 'zanahoria', 'limon', 'manzana', 'guineo',
  // Snacks
  'papitas', 'doritos', 'mani',
  // Limpieza
  'papel higienico', 'servilletas', 'detergente', 'cloro', 'suavizante', 'lavaplatos', 'desinfectante', 'jabon',
  'bolsas basura',
  // Cuidado personal
  'shampoo', 'acondicionador', 'pasta dental', 'cepillo dental', 'desodorante', 'toallas sanitarias',
  // Bebé y mascotas
  'panales', 'toallitas', 'formula infantil', 'compota', 'alimento perro', 'alimento gato',
];

// Lista separada por comas en una variable de entorno, útil para pruebas
// rápidas: INGEST_QUERIES="leche,arroz" npm run ingest
export function envList(name) {
  const value = process.env[name];
  return value ? value.split(',').map((s) => s.trim()).filter(Boolean) : null;
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
