// Idiomas de la web: español (el de siempre) e inglés. En el código los textos van en
// español y t() los cambia por su traducción cuando la persona eligió inglés; si falta
// una traducción, queda el español. La elección se guarda en el navegador y la primera
// vez se usa el idioma del navegador. El panel de imágenes (/admin) queda en español.
const KEY = 'mercapty:idioma';

function detect() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'es' || saved === 'en') return saved;
  } catch { /* almacenamiento bloqueado */ }
  return /^en\b/i.test(navigator.language ?? '') ? 'en' : 'es';
}

export const lang = detect();
export const dateLocale = lang === 'en' ? 'en-US' : 'es-PA';

// t('Ahorra {amount}', { amount: '$1.20' }) -> «Save $1.20» en inglés.
export function t(text, vars) {
  const out = (lang === 'en' && EN[text]) || text;
  return vars ? out.replace(/\{(\w+)\}/g, (m, key) => (key in vars ? String(vars[key]) : m)) : out;
}

// Nombre de una categoría (la dirección sigue usando el nombre en español).
export const category = (name) => (lang === 'en' && CATEGORIES_EN[name]) || name;

// Cambiar de idioma recarga la página: así todo, también lo fijo de index.html, sale traducido.
export function setLang(next) {
  try { localStorage.setItem(KEY, next); } catch { /* sin almacenamiento: dura hasta recargar */ }
  location.reload();
}

// Textos fijos de index.html: data-i18n traduce el texto del elemento y
// data-i18n-attr="placeholder,aria-label" traduce esos atributos.
export function translateStatic(root = document) {
  document.documentElement.lang = lang === 'en' ? 'en' : 'es-PA';
  if (lang === 'es') return;
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.textContent.trim().replace(/\s+/g, ' '));
  for (const el of root.querySelectorAll('[data-i18n-attr]')) {
    for (const attr of el.dataset.i18nAttr.split(',')) {
      if (el.hasAttribute(attr)) el.setAttribute(attr, t(el.getAttribute(attr)));
    }
  }
}

const CATEGORIES_EN = {
  'Lácteos y huevos': 'Dairy & eggs',
  Despensa: 'Pantry',
  Bebidas: 'Drinks',
  'Carnes y embutidos': 'Meat & deli',
  'Panadería y snacks': 'Bakery & snacks',
  Limpieza: 'Cleaning',
  'Cuidado personal': 'Personal care',
  Bebé: 'Baby',
  'Frutas y verduras': 'Fruits & vegetables',
  Congelados: 'Frozen',
  Mascotas: 'Pets',
  Otros: 'Other',
};

// Español -> inglés. «[...]» marca la parte resaltada de una frase (ver hl() en ui.js).
const EN = {
  // index.html y app.js
  'Mercapty · Compara precios de supermercados en Panamá': 'Mercapty · Compare supermarket prices in Panama',
  'Mercapty, inicio': 'Mercapty, home',
  'Busca leche, arroz, café…': 'Search milk, rice, coffee…',
  'Buscar productos': 'Search products',
  Buscar: 'Search',
  Principal: 'Main',
  Inicio: 'Home',
  Tiendas: 'Stores',
  'Mi lista': 'My list',
  'Modo demostración:': 'Demo mode:',
  'los precios son de ejemplo. Los botones «Comprar» sí te llevan a la búsqueda del producto en cada tienda.':
    'prices are examples. The “Buy” buttons do take you to the product search at each store.',
  'Compara los precios del súper en Panamá y ahorra en cada compra.': 'Compare supermarket prices in Panama and save on every purchase.',
  'La app llega pronto': 'The app is coming soon',
  'Próximamente en': 'Coming soon on',
  Explorar: 'Explore',
  'Mayores ahorros': 'Biggest savings',
  'Descarga la app': 'Get the app',
  Supermercados: 'Supermarkets',
  'Ver tiendas': 'See stores',
  'Para comercios': 'For businesses',
  '¿Tienes un súper o minisúper? Comparte tu inventario y llega a más clientes.':
    'Do you run a supermarket or mini-market? Share your inventory and reach more customers.',
  'Cómo sumarte': 'How to join',
  Contacto: 'Contact',
  'Contacto y redes': 'Contact and social media',
  'Mercapty. Los precios se toman de las webs de cada supermercado y pueden cambiar: confirma el precio final en la tienda antes de pagar. Mercapty no vende productos; la compra, el pago y la entrega se hacen en la tienda.':
    'Mercapty. Prices are taken from each supermarket’s website and may change: confirm the final price at the store before paying. Mercapty doesn’t sell products; purchase, payment and delivery happen at the store.',
  'Política de privacidad': 'Privacy policy',
  'Página no encontrada': 'Page not found',
  'No encontramos esta página': 'We couldn’t find this page',
  'Vuelve al inicio': 'Go back home',
  'o busca un producto arriba.': 'or search for a product above.',
  'No pudimos cargar esta página.': 'We couldn’t load this page.',
  'Agregado a tu lista': 'Added to your list',

  // ui.js
  'sin datos': 'no data',
  'hace un momento': 'just now',
  'hace {n} min': '{n} min ago',
  'hace {n} h': '{n} h ago',
  'hace 1 día': '1 day ago',
  'hace {n} días': '{n} days ago',
  unidad: 'unit',
  'Buscando los mejores precios…': 'Finding the best prices…',
  '1 tienda': '1 store',
  '{n} tiendas': '{n} stores',
  Oferta: 'Sale',
  'Agregar {name} a mi lista': 'Add {name} to my list',
  'Agregar a mi lista': 'Add to my list',
  en: 'at',
  'Ahorra {amount}': 'Save {amount}',
  Correo: 'Email',
  'Hola, les escribo desde Mercapty.': 'Hi, I’m writing from Mercapty.',

  // ads.js
  Publicidad: 'Advertisement',
  'Espacio para anuncio · {name}': 'Ad space · {name}',

  // Portada y búsqueda (home.js, hero.js, store-marquee.js)
  'Más relevantes': 'Most relevant',
  Nombre: 'Name',
  'Menor precio': 'Lowest price',
  'Mayor ahorro entre tiendas': 'Biggest savings across stores',
  Categorías: 'Categories',
  Todo: 'All',
  'Donde más ahorras eligiendo bien': 'Where choosing well saves you the most',
  'Ver más': 'See more',
  Productos: 'Products',
  'Ver todos ({n})': 'See all ({n})',
  'Resultados para «{q}»': 'Results for “{q}”',
  'Todos los productos': 'All products',
  '1 producto': '1 product',
  '{n} productos': '{n} products',
  'Ordenar por': 'Sort by',
  'No encontramos productos con todas las palabras de «{q}». Te mostramos los más parecidos.':
    'We didn’t find products with all the words in “{q}”. Here are the closest matches.',
  'No encontramos productos para esa búsqueda.': 'We didn’t find products for that search.',
  'Prueba con otra palabra (por ejemplo «leche», «arroz» o una marca) o': 'Try another word (for example “milk”, “rice” or a brand) or',
  'mira todo el catálogo': 'browse the whole catalog',
  'en 1 supermercado': 'at 1 supermarket',
  'en {n} supermercados a la vez': 'at {n} supermarkets at once',
  'en los supermercados de Panamá': 'at Panama’s supermarkets',
  'los principales supermercados en línea de Panamá': 'Panama’s main online supermarkets',
  Arroz: 'Rice',
  Pollo: 'Chicken',
  Huevos: 'Eggs',
  Leche: 'Milk',
  'Tu canasta': 'Your basket',
  'Te decimos dónde te cuesta menos': 'We tell you where it costs less',
  'Busca leche, arroz…': 'Search milk, rice…',
  'Leche entera': 'Whole milk',
  'Bajó de precio': 'Price dropped',
  'Arroz 5 lb': 'Rice 5 lb',
  'Más barato hoy': 'Cheapest today',
  'Escanear código de barras': 'Scan barcode',
  'El precio más bajo de tu canasta': 'The lowest price for your basket',
  'Canasta básica · Panamá': 'Grocery basics · Panama',
  'El [precio más bajo] de tu canasta básica, {where}.': 'The [lowest price] for your grocery basics, {where}.',
  'Mercapty compara arroz, pollo, huevos, leche y decenas de productos en {list}. Arma tu canasta y te decimos exactamente dónde te costará menos.':
    'Mercapty compares rice, chicken, eggs, milk and dozens of products at {list}. Build your basket and we’ll tell you exactly where it will cost you less.',
  'Arma tu canasta': 'Build your basket',
  'Ver dónde se ahorra más': 'See where you save the most',
  productos: 'products',
  'precios comparados': 'prices compared',
  'Precios actualizados {ago}': 'Prices updated {ago}',
  'Arma tu canasta y ahorra en cada compra': 'Build your basket and save on every purchase',
  'Agrega lo que compras cada semana y te decimos si conviene comprar todo en un súper o repartir la compra entre varios.':
    'Add what you buy every week and we’ll tell you whether it’s better to buy everything at one supermarket or split your shopping across several.',
  'Empezar mi lista': 'Start my list',
  'Ver mi lista': 'See my list',
  'La app de Mercapty': 'The Mercapty app',
  'Muy pronto': 'Coming soon',
  'Mercapty en tu celular': 'Mercapty on your phone',
  'Compara precios desde el pasillo del súper, escanea el código de barras y recibe un aviso cuando baje lo que siempre compras.':
    'Compare prices from the supermarket aisle, scan barcodes and get an alert when what you always buy goes down in price.',
  'Conoce la app': 'Discover the app',
  carrusel: 'carousel',
  'Novedades de Mercapty': 'What’s new at Mercapty',
  diapositiva: 'slide',
  '{i} de {n}: {label}': '{i} of {n}: {label}',
  'Ir a: {label}': 'Go to: {label}',
  'Diapositiva anterior': 'Previous slide',
  'Diapositiva siguiente': 'Next slide',
  'Supermercados que comparamos': 'Supermarkets we compare',

  // Ficha de producto (product.js)
  'Productos parecidos': 'Similar products',
  'Más de {brand}': 'More from {brand}',
  'Otras marcas': 'Other brands',
  'Mejor precio': 'Best price',
  Disponible: 'In stock',
  Agotado: 'Out of stock',
  'actualizado {ago}': 'updated {ago}',
  Comprar: 'Buy',
  'Hoy está en su precio más bajo registrado: buen momento para comprar.': 'Today it’s at its lowest recorded price: a good time to buy.',
  'Hoy está en su precio más alto registrado.': 'Today it’s at its highest recorded price.',
  'Historial del mejor precio': 'Best price history',
  'Mejor precio entre {min} y {max}': 'Best price between {min} and {max}',
  'Código {code}': 'Code {code}',
  'Comprar en {store}': 'Buy at {store}',
  'Te ahorras hasta [{amount}] frente a la tienda más cara.': 'You save up to [{amount}] compared with the most expensive store.',
  'Por ahora ninguna tienda lo tiene disponible.': 'No store has it available right now.',
  'Compara en 1 tienda': 'Compare at 1 store',
  'Compara en {n} tiendas': 'Compare at {n} stores',

  // Mi lista (list.js)
  'Todo en {store}': 'Everything at {store}',
  'Repartir en {n} tiendas': 'Split across {n} stores',
  'Lo más barato': 'Cheapest',
  'Ahorras [{amount}] frente a comprar todo en {store}.': 'You save [{amount}] compared with buying everything at {store}.',
  'Todo en una sola tienda': 'Everything at one store',
  'Tiene todos tus productos: pagas un poco más, pero con un solo envío.': 'It has all your products: you pay a bit more, but with a single delivery.',
  'Le faltan: {items}.': 'Missing: {items}.',
  'Comparar todas las tiendas': 'Compare all stores',
  Tienda: 'Store',
  Tiene: 'Has',
  'Tu lista está vacía.': 'Your list is empty.',
  'Agrega productos con el botón [+] y te decimos dónde te sale más barato comprarlos.':
    'Add products with the [+] button and we’ll tell you where they’re cheapest.',
  'Ver productos': 'See products',
  'Vaciar lista': 'Clear list',
  'Quitar uno': 'Remove one',
  'Agregar uno': 'Add one',
  'Agotado en todas las tiendas: {items}.': 'Out of stock at every store: {items}.',
  'Los totales no incluyen envío: cada tienda tiene su propia tarifa y monto mínimo.':
    'Totals don’t include delivery: each store has its own fee and minimum order.',
  '¿Vaciar tu lista?': 'Clear your list?',

  // Tiendas (stores.js)
  'precios de su web': 'prices from its website',
  'inventario compartido': 'shared inventory',
  'Hola, tengo un supermercado y quiero aparecer en Mercapty.': 'Hi, I have a supermarket and I’d like to be listed on Mercapty.',
  'Escríbenos por WhatsApp': 'Message us on WhatsApp',
  'Enviar un correo': 'Send an email',
  'Quiero sumar mi tienda a Mercapty': 'I want to add my store to Mercapty',
  'Supermercados que Mercapty compara hoy.': 'Supermarkets Mercapty compares today.',
  'mejor precio': 'best price',
  'visita enviada': 'visit sent',
  'visitas enviadas': 'visits sent',
  'Actualizado {ago}': 'Updated {ago}',
  'Visitar tienda': 'Visit store',
  '¿Tienes un supermercado o minisúper?': 'Do you run a supermarket or mini-market?',
  'Comparte tu inventario con Mercapty en un archivo CSV o Excel (código de barras, nombre, marca, presentación, precio, disponibilidad, enlace y foto) y apareces en las comparaciones. Los clientes llegan directo a tu tienda en línea para comprar.':
    'Share your inventory with Mercapty in a CSV or Excel file (barcode, name, brand, size, price, availability, link and photo) and you’ll appear in the comparisons. Customers go straight to your online store to buy.',

  // Página de la app (app-page.js)
  'Compara al instante': 'Compare instantly',
  'Busca cualquier producto y mira su precio en cada supermercado.': 'Search any product and see its price at every supermarket.',
  'Tu lista siempre contigo': 'Your list always with you',
  'Arma la canasta en casa y revísala en el pasillo del súper.': 'Build your basket at home and check it in the supermarket aisle.',
  'Escanea el código de barras': 'Scan the barcode',
  'Apunta la cámara a un producto y mira dónde está más barato.': 'Point the camera at a product and see where it’s cheapest.',
  'Alertas de precio': 'Price alerts',
  'Te avisamos cuando baje lo que siempre compras.': 'We’ll let you know when what you always buy goes down in price.',
  'App de Mercapty': 'Mercapty app',
  'El precio más bajo, en tu bolsillo': 'The lowest price, in your pocket',
  'Instala Mercapty en tu celular en segundos. Se abre como una app, casi no ocupa espacio y no necesitas pasar por ninguna tienda de aplicaciones.':
    'Install Mercapty on your phone in seconds. It opens like an app, takes up almost no space and you don’t need to go through any app store.',
  'Instalar Mercapty': 'Install Mercapty',
  'Cómo instalarla': 'How to install it',
  '✓ Ya tienes Mercapty instalada en este dispositivo.': '✓ Mercapty is already installed on this device.',
  'Lo que puedes hacer con la app': 'What you can do with the app',
  Próximamente: 'Coming soon',
  'Instálala hoy': 'Install it today',
  'Abre Mercapty en Chrome.': 'Open Mercapty in Chrome.',
  'Toca el menú [⋮] y elige [Instalar app] o [Agregar a la pantalla principal].': 'Tap the [⋮] menu and choose [Install app] or [Add to Home screen].',
  'Confirma: el cerdito aparecerá en tu pantalla.': 'Confirm: the piggy will appear on your screen.',
  'Abre Mercapty en Safari.': 'Open Mercapty in Safari.',
  'Toca [Compartir] (el cuadro con la flecha hacia arriba).': 'Tap [Share] (the square with the arrow pointing up).',
  'Elige [Agregar a inicio] y luego [Agregar].': 'Choose [Add to Home Screen] and then [Add].',
};
