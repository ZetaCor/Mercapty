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
};

export const money = (n) => (n == null ? '—' : `$${Number(n).toFixed(2)}`);

export function unitPriceText(up) {
  return up ? `${money(up.amount)} / ${up.per}` : '';
}

export function timeAgo(iso) {
  if (!iso) return 'sin datos';
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'hace un momento';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return `hace ${days} día${days === 1 ? '' : 's'}`;
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
export const loader = (text = 'Buscando los mejores precios…') =>
  html`<div class="loader" role="status"><img src="/loader.svg" alt="" width="240" height="120"><p>${text}</p></div>`;

// Íconos de todas las tiendas que venden el producto, de la más barata a la más cara.
function storeStack(item, stores) {
  const list = (item.storeIds ?? [item.bestStoreId]).map((id) => stores.get(id)).filter(Boolean);
  const names = list.map((s) => s.name).join(', ');
  return html`<span class="tag store-stack" title="${names}">
    <span class="stack" aria-hidden="true">${list.map((s) => storeAvatar(s.name, s.color))}</span>
    ${item.storeCount > 1 ? `${item.storeCount} tiendas` : '1 tienda'}<span class="sr-only">: ${names}</span></span>`;
}

export function productCard(item, stores) {
  const store = stores.get(item.bestStoreId);
  const href = item.path ?? `/producto/${item.id}`;
  return html`
    <article class="card">
      <div class="media-wrap">
        ${productMedia(item, { href })}
        ${item.bestListPrice ? html`<span class="badge">Oferta</span>` : ''}
        <button class="add-fab" type="button" data-add="${item.id}" data-label="${productLabel(item)}"
          aria-label="Agregar ${item.name} a mi lista" title="Agregar a mi lista">${icons.plus}</button>
      </div>
      <a class="card-body" href="${href}">
        <div class="price-row">
          <span class="price">${money(item.bestPrice)}</span>
          ${item.bestListPrice ? html`<span class="price-old">${money(item.bestListPrice)}</span>` : ''}
        </div>
        <div class="name">${item.name}</div>
        <div class="meta">${[item.brand, item.size].filter(Boolean).join(' · ')}</div>
        <div class="best-at">${storeAvatar(store?.name, store?.color)}<span>en <b>${store?.name ?? item.bestStoreId}</b></span></div>
        <div class="tags">
          ${item.savings > 0 ? html`<span class="tag good">Ahorra ${money(item.savings)}</span>` : ''}
          ${storeStack(item, stores)}
        </div>
      </a>
    </article>`;
}

export function productGrid(items, stores) {
  return html`<div class="grid">${items.map((item) => productCard(item, stores))}</div>`;
}

let toastTimer;
export function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
}
