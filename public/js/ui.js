import { t } from './i18n.js';

// Plantillas HTML seguras: todo lo interpolado se escapa salvo lo que ya es html``.
class SafeHtml {
  constructor(value) { this.value = value; }
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function render(value) {
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(render).join('');
  if (value == null || value === false) return '';
  return escapeHtml(value);
}

export function html(strings, ...values) {
  return new SafeHtml(strings.reduce((out, s, i) => out + s + (i < values.length ? render(values[i]) : ''), ''));
}

export function mount(el, content) {
  el.innerHTML = render(content);
}

// Frase traducida con una parte resaltada: «El [precio más bajo]…» -> El <span>precio más bajo</span>…
export function hl(text, tag = 'span') {
  return new SafeHtml(escapeHtml(text).replace(/\[(.+?)\]/g, `<${tag}>$1</${tag}>`));
}

const icon = (body) => new SafeHtml(
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`,
);
export const icons = {
  plus: icon('<path d="M12 5v14M5 12h14"/>'),
  external: icon('<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>'),
  camera: icon('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  trash: icon('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  back: icon('<path d="M15 18l-6-6 6-6"/>'),
  next: icon('<path d="M9 6l6 6-6 6"/>'),
  phone: icon('<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>'),
  mail: icon('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m4 7 8 6 8-6"/>'),
  whatsapp: icon('<path d="M20.5 11.8a8.5 8.5 0 0 1-12.4 7.5L3.5 20.5l1.3-4.4a8.5 8.5 0 1 1 15.7-4.3z"/><path d="M9 8.6c0 3.2 2.9 6.3 6.3 6.4l1.2-1.4-1.9-.9-.9.8a4.4 4.4 0 0 1-2.6-2.6l.8-.9-.9-1.9z"/>'),
  instagram: icon('<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.2 6.8h.01"/>'),
  facebook: icon('<path d="M14.5 8.5H17V5h-2.5A3.5 3.5 0 0 0 11 8.5V11H8.5v3.5H11V21h3.5v-6.5H17l.5-3.5h-3V9a.5.5 0 0 1 .5-.5z"/>'),
  sun: icon('<circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.4M12 19v2.4M4.4 4.4l1.7 1.7M17.9 17.9l1.7 1.7M2.6 12H5M19 12h2.4M4.4 19.6l1.7-1.7M17.9 6.1l1.7-1.7"/>'),
  moon: icon('<path d="M20 14.2A8.4 8.4 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2z"/>'),
};

// Contacto y redes: vienen de /api/meta y se configuran en server/contact.js.
const CONTACT_CHANNELS = [
  ['whatsapp', 'WhatsApp', icons.whatsapp],
  ['email', t('Correo'), icons.mail],
  ['instagram', 'Instagram', icons.instagram],
  ['facebook', 'Facebook', icons.facebook],
];

// Enlace de WhatsApp con un mensaje ya escrito.
export const whatsappWith = (channel, text) => `${channel.url}?text=${encodeURIComponent(text)}`;

export function contactLinks(contact = {}, className = 'contact-link') {
  return CONTACT_CHANNELS.filter(([id]) => contact[id]).map(([id, label, svg]) => {
    const { url, text } = contact[id];
    const href = id === 'whatsapp' ? whatsappWith(contact[id], t('Hola, les escribo desde Mercapty.')) : url;
    const external = /^https?:/.test(href);
    return html`<a class="${className}" href="${href}" ${external ? html`target="_blank" rel="noopener"` : ''}
      aria-label="${label}: ${text}">${svg}<span>${text}</span></a>`;
  });
}

export const money = (n) => (n == null ? '—' : `$${Number(n).toFixed(2)}`);

export function unitPriceText(up) {
  return up ? `${money(up.amount)} / ${t(up.per)}` : '';
}

export function timeAgo(iso) {
  if (!iso) return t('sin datos');
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return t('hace un momento');
  if (minutes < 60) return t('hace {n} min', { n: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t('hace {n} h', { n: hours });
  const days = Math.round(hours / 24);
  return days === 1 ? t('hace 1 día') : t('hace {n} días', { n: days });
}

// Ícono y color de fondo por categoría, para productos que aún no tienen foto.
const CATEGORY_STYLE = {
  'Lácteos y huevos': ['🥛', '#eaf2ff'],
  Despensa: ['🥫', '#fff3e4'],
  Bebidas: ['🥤', '#e5f6fb'],
  'Carnes y embutidos': ['🍗', '#fdeceb'],
  'Panadería y snacks': ['🍞', '#fdf5e1'],
  Limpieza: ['🧴', '#e8f7ee'],
  'Cuidado personal': ['🪥', '#f5ebfd'],
  Bebé: ['🍼', '#fdedf3'],
  'Frutas y verduras': ['🥬', '#ebf7e6'],
  Congelados: ['🧊', '#e7f3fb'],
  Mascotas: ['🐾', '#f4efe8'],
  Electrodomésticos: ['🔌', '#eef2ff'],
  'Ferretería y hogar': ['🔧', '#f1f5f9'],
  Farmacia: ['💊', '#ecfeff'],
  Licores: ['🍷', '#fdf2f8'],
  'Juguetería y deportes': ['🧸', '#fef2f8'],
  'Escolar y oficina': ['✏️', '#fffbeb'],
  'Ropa y calzado': ['👕', '#f5f3ff'],
  'Comida preparada': ['🍽️', '#fff7ed'],
};
const categoryStyle = (category) => CATEGORY_STYLE[category] ?? ['🛒', '#f1f4f8'];
export const categoryIcon = (category) => categoryStyle(category)[0];
export const categoryTint = (category) => categoryStyle(category)[1];

// Foto del producto, o el ícono de su categoría si todavía no tiene.
export function productMedia(product, { className = 'media', href = null } = {}) {
  const emoji = categoryIcon(product.category);
  const inner = product.image
    ? html`<img src="${product.image}" alt="${product.name}" loading="lazy" data-fallback="${emoji}">`
    : html`<span class="ph-emoji" aria-hidden="true">${emoji}</span>`;
  const style = product.image ? '' : `--ph:${categoryTint(product.category)}`;
  return href
    ? html`<a class="${className}" href="${href}" style="${style}" tabindex="-1" aria-hidden="true">${inner}</a>`
    : html`<div class="${className}" style="${style}">${inner}</div>`;
}

const safeColor = (c) => (/^#[0-9a-f]{3,8}$/i.test(c ?? '') ? c : '#64748b');
function initials(name) {
  const words = String(name ?? '').replace(/\(.*?\)/g, '').split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2)).toUpperCase();
}

// Logo e ícono de cada tienda, por nombre (llegan con /api/stores al abrir la página).
const storeInfo = new Map();
export function setStoreInfo(stores) {
  for (const s of stores) storeInfo.set(s.name, s);
}

// Días de descuento que anuncian los súper hoy (/api/promos). Se guardan aquí para que
// cada tarjeta pueda marcar si al producto le toca uno.
let todaysPromos = [];
export function setPromos(list) {
  todaysPromos = Array.isArray(list) ? list : [];
}

const withoutAccents = (text) => String(text ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// La promoción de hoy que le aplica a un producto: tiene que ser de una tienda que lo
// vende, de su categoría y, si la promoción afina por palabras, llevar alguna en el nombre.
export function promoFor(item) {
  const inStores = item.storeIds ?? [item.bestStoreId];
  const name = withoutAccents(item.name);
  return todaysPromos.find((p) => {
    if (!inStores.includes(p.storeId)) return false;
    if (p.categories.length && !p.categories.includes(item.category)) return false;
    if (p.keywords.length && !p.keywords.some((k) => name.includes(k))) return false;
    return true;
  });
}

// «Hoy −25% en Súper 99» sobre la tarjeta del producto.
export function promoTag(item, stores) {
  const promo = promoFor(item);
  if (!promo) return '';
  const store = stores?.get(promo.storeId)?.name ?? promo.storeId;
  const text = promo.discount
    ? t('Hoy −{n}% en {store}', { n: promo.discount, store })
    : t('Hoy en {store}', { store });
  return html`<span class="tag promo" title="${promo.name}">${text}</span>`;
}

// Ícono de la tienda sobre sus iniciales: si el ícono no carga, quedan las iniciales.
export function storeAvatar(name, color, size = '') {
  const icon = storeInfo.get(name)?.icon;
  return html`<span class="avatar ${size}" style="--c:${safeColor(color)}" aria-hidden="true">${initials(name)}${
    icon ? html`<img src="${icon}" alt="" loading="lazy" data-store-img>` : ''}</span>`;
}

// Logo horizontal de la tienda; sin logo, su ícono y su nombre.
export function storeLogo(store, className = 'store-logo') {
  if (!store.logo) return html`<span class="${className} is-text">${storeAvatar(store.name, store.color)}<span>${store.name}</span></span>`;
  const bg = store.logoBg ? `--logo-bg:${safeColor(store.logoBg)}` : '';
  return html`<span class="${className}" style="${bg}"><img src="${store.logo}" alt="${store.name}" loading="lazy" data-store-img data-name="${store.name}"></span>`;
}

export const productLabel = (p) => [p.name, p.brand, p.size].filter(Boolean).join(' · ');

// El cerdito corriendo tras un billete (public/loader.svg) mientras carga una página.
export const loader = (text = t('Buscando los mejores precios…')) =>
  html`<div class="loader" role="status"><img src="/loader.svg" alt="" width="240" height="120"><p>${text}</p></div>`;

// Íconos de todas las tiendas que venden el producto, de la más barata a la más cara.
function storeStack(item, stores) {
  const list = (item.storeIds ?? [item.bestStoreId]).map((id) => stores.get(id)).filter(Boolean);
  const names = list.map((s) => s.name).join(', ');
  return html`<span class="tag store-stack" title="${names}">
    <span class="stack" aria-hidden="true">${list.map((s) => storeAvatar(s.name, s.color))}</span>
    ${item.storeCount > 1 ? t('{n} tiendas', { n: item.storeCount }) : t('1 tienda')}<span class="sr-only">: ${names}</span></span>`;
}

export function productCard(item, stores) {
  const store = stores.get(item.bestStoreId);
  const href = item.path ?? `/producto/${item.id}`;
  return html`
    <article class="card">
      <div class="media-wrap">
        ${productMedia(item, { href })}
        ${item.bestListPrice ? html`<span class="badge">${t('Oferta')}</span>` : ''}
        <button class="add-fab" type="button" data-add="${item.id}" data-label="${productLabel(item)}"
          aria-label="${t('Agregar {name} a mi lista', { name: item.name })}" title="${t('Agregar a mi lista')}">${icons.plus}</button>
      </div>
      <a class="card-body" href="${href}">
        <div class="price-row">
          <span class="price">${money(item.bestPrice)}</span>
          ${item.bestListPrice ? html`<span class="price-old">${money(item.bestListPrice)}</span>` : ''}
        </div>
        <div class="name">${item.name}</div>
        <div class="meta">${[item.brand, item.size].filter(Boolean).join(' · ')}</div>
        <div class="best-at">${storeAvatar(store?.name, store?.color)}<span>${t('en')} <b>${store?.name ?? item.bestStoreId}</b></span></div>
        <div class="tags">
          ${promoTag(item, stores)}
          ${item.savings > 0 ? html`<span class="tag good">${t('Ahorra {amount}', { amount: money(item.savings) })}</span>` : ''}
          ${storeStack(item, stores)}
        </div>
      </a>
    </article>`;
}

export function productGrid(items, stores) {
  return html`<div class="grid">${items.map((item) => productCard(item, stores))}</div>`;
}

let toastTimer;
// Aviso al pie de la pantalla. Con `action` lleva un botón («Deshacer») y dura un poco más.
export function toast(message, { action, onAction } = {}) {
  const el = document.getElementById('toast');
  el.replaceChildren(message);
  if (action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = action;
    button.addEventListener('click', () => {
      clearTimeout(toastTimer);
      el.hidden = true;
      onAction();
    });
    el.append(button);
  }
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, action ? 6000 : 2200);
}
