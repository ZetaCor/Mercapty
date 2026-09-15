// Idiomas de la app: español (el de siempre) e inglés, como la web (public/js/i18n.js).
// En el código los textos van en español y t() los cambia por su traducción si la persona
// eligió inglés; si falta una traducción, queda el español. La elección se guarda en el
// teléfono y la primera vez se usa el idioma del teléfono. Cambiar de idioma es inmediato.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';

export type Lang = 'es' | 'en';
type Vars = Record<string, string | number>;
export type T = (text: string, vars?: Vars) => string;

const KEY = 'mercapty:idioma';
const deviceLang = (): Lang => (getLocales()[0]?.languageCode === 'en' ? 'en' : 'es');

function translate(lang: Lang, text: string, vars?: Vars) {
  const out = (lang === 'en' && EN[text]) || text;
  return vars ? out.replace(/\{(\w+)\}/g, (m, key: string) => (key in vars ? String(vars[key]) : m)) : out;
}

// «El [precio más bajo] de…» -> partes para resaltar lo que va entre corchetes.
export const hlParts = (text: string) =>
  text.split(/\[(.+?)\]/).map((part, i) => ({ text: part, hl: i % 2 === 1 })).filter((p) => p.text);

type I18n = {
  lang: Lang;
  ready: boolean; // ya se leyó la elección guardada
  setLang(lang: Lang): void;
  t: T;
  category(name: string): string; // nombre visible (el filtro sigue usando el nombre en español)
  locale: string; // para fechas y números
};

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ lang: Lang; ready: boolean }>({ lang: deviceLang(), ready: false });

  useEffect(() => {
    AsyncStorage.getItem(KEY).then(
      (saved) => setState({ lang: saved === 'en' || saved === 'es' ? saved : deviceLang(), ready: true }),
      () => setState((s) => ({ ...s, ready: true })),
    );
  }, []);

  const { lang } = state;
  const value: I18n = {
    lang,
    ready: state.ready,
    setLang: (next) => {
      setState({ lang: next, ready: true });
      AsyncStorage.setItem(KEY, next).catch(() => {});
    },
    t: (text, vars) => translate(lang, text, vars),
    category: (name) => (lang === 'en' && CATEGORIES_EN[name]) || name,
    locale: lang === 'en' ? 'en-US' : 'es-PA',
  };
  return <I18nContext value={value}>{children}</I18nContext>;
}

export function useI18n() {
  const ctx = use(I18nContext);
  if (!ctx) throw new Error('useI18n() va dentro de <I18nProvider>');
  return ctx;
}

const CATEGORIES_EN: Record<string, string> = {
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

// Español -> inglés. «[...]» marca la parte resaltada de una frase (ver hlParts).
const EN: Record<string, string> = {
  // Generales
  'Buscando los mejores precios…': 'Finding the best prices…',
  'Sin conexión. Revisa tu internet e intenta de nuevo.': 'No connection. Check your internet and try again.',
  'No pudimos cargar esta página': 'We couldn’t load this page',
  Reintentar: 'Try again',
  'sin datos': 'no data',
  'hace un momento': 'just now',
  'hace {n} min': '{n} min ago',
  'hace {n} h': '{n} h ago',
  'hace 1 día': '1 day ago',
  'hace {n} días': '{n} days ago',
  unidad: 'unit',
  y: 'and',
  Inicio: 'Home',
  Buscar: 'Search',
  'Mi lista': 'My list',
  Tiendas: 'Stores',
  'Agregado a tu lista': 'Added to your list',
  Oferta: 'Sale',
  'Agregar {name} a mi lista': 'Add {name} to my list',
  'Agregar a mi lista': 'Add to my list',
  '{name}, {price} en {store}': '{name}, {price} at {store}',
  en: 'at',
  'Ahorra {amount}': 'Save {amount}',
  '1 tienda': '1 store',
  '{n} tiendas': '{n} stores',
  '{n} tiendas: {names}': '{n} stores: {names}',
  '1 producto': '1 product',
  '{n} productos': '{n} products',
  Correo: 'Email',
  'Hola, les escribo desde la app de Mercapty.': 'Hi, I’m writing from the Mercapty app.',

  // Bienvenida
  Saltar: 'Skip',
  'Saltar la bienvenida': 'Skip the welcome',
  'Canasta básica · Panamá': 'Grocery basics · Panama',
  'El [precio más bajo], en {n} supermercados a la vez': 'The [lowest price], at {n} supermarkets at once',
  'El [precio más bajo] de tu canasta básica': 'The [lowest price] for your grocery basics',
  'Compara {n} productos del súper y mira, tienda por tienda, dónde te sale más barato.':
    'Compare {n} grocery products and see, store by store, where it’s cheapest.',
  'Compara arroz, pollo, huevos, leche y miles de productos del súper, y mira dónde te sale más barato.':
    'Compare rice, chicken, eggs, milk and thousands of grocery products, and see where it’s cheapest.',
  'Arma tu canasta y [ahorra en cada compra]': 'Build your basket and [save on every purchase]',
  'Agrega lo que compras cada semana y te decimos si conviene comprar todo en un súper o repartir la compra entre varios.':
    'Add what you buy every week and we’ll tell you whether it’s better to buy everything at one supermarket or split your shopping across several.',
  'Directo a tu súper': 'Straight to your supermarket',
  'Compra donde está [más barato]': 'Buy where it’s [cheapest]',
  'Con un toque te llevamos a la tienda en línea con el mejor precio. La compra, el pago y la entrega los haces en tu súper.':
    'With one tap we take you to the online store with the best price. You buy, pay and get delivery from your supermarket.',
  Siguiente: 'Next',
  'Empezar a ahorrar': 'Start saving',
  'Leche entera': 'Whole milk',
  'Arroz 5 lb': 'Rice 5 lb',
  Huevos: 'Eggs',
  'Más barato hoy': 'Cheapest today',
  'Bajó de precio': 'Price dropped',
  'Mejor precio': 'Best price',
  Arroz: 'Rice',
  Pollo: 'Chicken',
  Leche: 'Milk',
  'Tu canasta': 'Your basket',
  'Te decimos dónde te cuesta menos': 'We tell you where it costs less',

  // Inicio
  'Busca leche, arroz, café…': 'Search milk, rice, coffee…',
  'Buscar productos': 'Search products',
  'Modo demostración: los precios son de ejemplo.': 'Demo mode: prices are examples.',
  'Supermercados que comparamos': 'Supermarkets we compare',
  'Ver tiendas': 'See stores',
  Categorías: 'Categories',
  'Donde más ahorras eligiendo bien': 'Where choosing well saves you the most',
  'Ver más': 'See more',
  Productos: 'Products',
  'Ver todos ({n})': 'See all ({n})',
  'Los precios se toman de las webs de cada supermercado y pueden cambiar: confirma el precio final en la tienda antes de pagar. Mercapty no vende productos; la compra, el pago y la entrega se hacen en la tienda.':
    'Prices are taken from each supermarket’s website and may change: confirm the final price at the store before paying. Mercapty doesn’t sell products; purchase, payment and delivery happen at the store.',
  'en 1 supermercado': 'at 1 supermarket',
  'en {n} supermercados a la vez': 'at {n} supermarkets at once',
  'en los supermercados de Panamá': 'at Panama’s supermarkets',
  'los principales supermercados en línea de Panamá': 'Panama’s main online supermarkets',
  'El [precio más bajo] de tu canasta básica, {where}.': 'The [lowest price] for your grocery basics, {where}.',
  'Mercapty compara arroz, pollo, huevos, leche y miles de productos en {list}. Arma tu canasta y te decimos exactamente dónde te costará menos.':
    'Mercapty compares rice, chicken, eggs, milk and thousands of products at {list}. Build your basket and we’ll tell you exactly where it will cost you less.',
  'Arma tu canasta': 'Build your basket',
  'Ver dónde se ahorra más': 'See where you save the most',
  productos: 'products',
  'precios comparados': 'prices compared',
  'Precios actualizados {ago}': 'Prices updated {ago}',

  // Buscar
  'Más relevantes': 'Most relevant',
  Nombre: 'Name',
  'Menor precio': 'Lowest price',
  'Mayor ahorro entre tiendas': 'Biggest savings across stores',
  'Borrar búsqueda': 'Clear search',
  Todo: 'All',
  'Resultados para «{q}»': 'Results for “{q}”',
  'Todos los productos': 'All products',
  'No encontramos productos con todas las palabras de «{q}». Te mostramos los más parecidos.':
    'We didn’t find products with all the words in “{q}”. Here are the closest matches.',
  'No encontramos productos para esa búsqueda': 'We didn’t find products for that search',
  'Prueba con otra palabra (por ejemplo «leche», «arroz» o una marca) o mira todo el catálogo.':
    'Try another word (for example “milk”, “rice” or a brand) or browse the whole catalog.',
  'Ver todo el catálogo': 'Browse the whole catalog',

  // Ficha de producto
  'Compartir producto': 'Share product',
  '{name}: desde {price} en {store}': '{name}: from {price} at {store}',
  'MEJOR PRECIO': 'BEST PRICE',
  'Comprar en {store}': 'Buy at {store}',
  'Te ahorras hasta [{amount}] frente a la tienda más cara.': 'You save up to [{amount}] compared with the most expensive store.',
  'Por ahora ninguna tienda lo tiene disponible.': 'No store has it available right now.',
  'Compara en 1 tienda': 'Compare at 1 store',
  'Compara en {n} tiendas': 'Compare at {n} stores',
  'Productos parecidos': 'Similar products',
  'Más de {brand}': 'More from {brand}',
  'Otras marcas': 'Other brands',
  Disponible: 'In stock',
  Agotado: 'Out of stock',
  'actualizado {ago}': 'updated {ago}',
  'Comprar ↗': 'Buy ↗',
  'Comprar en {store} a {price}': 'Buy at {store} for {price}',
  'Hoy está en su precio más bajo registrado: buen momento para comprar.': 'Today it’s at its lowest recorded price: a good time to buy.',
  'Hoy está en su precio más alto registrado.': 'Today it’s at its highest recorded price.',
  'Historial del mejor precio': 'Best price history',
  'Mejor precio entre {min} y {max}': 'Best price between {min} and {max}',
  'Código {code}': 'Code {code}',

  // Mi lista
  '¿Vaciar tu lista?': 'Clear your list?',
  Vaciar: 'Clear',
  Cancelar: 'Cancel',
  'Vaciar lista': 'Clear list',
  'Tu lista está vacía': 'Your list is empty',
  'Agrega productos con el botón + y te decimos dónde te sale más barato comprarlos.':
    'Add products with the + button and we’ll tell you where they’re cheapest.',
  'Ver productos': 'See products',
  'Quitar uno': 'Remove one',
  'Agregar uno': 'Add one',
  'Comparando tu lista en cada tienda…': 'Comparing your list at every store…',
  'LO MÁS BARATO': 'CHEAPEST',
  'Todo en {store}': 'Everything at {store}',
  'Repartir en {n} tiendas': 'Split across {n} stores',
  'Ahorras [{amount}] frente a comprar todo en {store}.': 'You save [{amount}] compared with buying everything at {store}.',
  'Todo en una sola tienda': 'Everything at one store',
  'Tiene todos tus productos: pagas un poco más, pero con un solo envío.': 'It has all your products: you pay a bit more, but with a single delivery.',
  'Le faltan: {items}.': 'Missing: {items}.',
  'Comparar todas las tiendas': 'Compare all stores',
  TIENDA: 'STORE',
  TIENE: 'HAS',
  'Agotado en todas las tiendas: {items}.': 'Out of stock at every store: {items}.',
  'Los totales no incluyen envío: cada tienda tiene su propia tarifa y monto mínimo.':
    'Totals don’t include delivery: each store has its own fee and minimum order.',

  // Tiendas
  'Supermercados que Mercapty compara hoy.': 'Supermarkets Mercapty compares today.',
  'precios de su web': 'prices from its website',
  'inventario compartido': 'shared inventory',
  'mejor precio': 'best price',
  'visita enviada': 'visit sent',
  'visitas enviadas': 'visits sent',
  'Actualizado {ago}': 'Updated {ago}',
  'Visitar tienda': 'Visit store',
  '¿Tienes un supermercado o minisúper?': 'Do you run a supermarket or mini-market?',
  'Comparte tu inventario con Mercapty en un archivo CSV o Excel (código de barras, nombre, marca, presentación, precio, disponibilidad, enlace y foto) y apareces en las comparaciones. Los clientes llegan directo a tu tienda en línea para comprar.':
    'Share your inventory with Mercapty in a CSV or Excel file (barcode, name, brand, size, price, availability, link and photo) and you’ll appear in the comparisons. Customers go straight to your online store to buy.',
  'Hola, tengo un supermercado y quiero aparecer en Mercapty.': 'Hi, I have a supermarket and I’d like to be listed on Mercapty.',
  'Escríbenos por WhatsApp': 'Message us on WhatsApp',
  'Enviar un correo': 'Send an email',
  'Quiero sumar mi tienda a Mercapty': 'I want to add my store to Mercapty',
  'Contacto y redes': 'Contact and social media',
  'Ver la bienvenida otra vez': 'See the welcome again',
};
