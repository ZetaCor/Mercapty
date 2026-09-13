import { getJson } from './api.js';
import { html, mount, toast } from './ui.js';
import { addToList, listCount } from './list-store.js';
import { setAdminKey } from './admin-auth.js';
import { renderHome, renderSearch } from './views/home.js';
import { renderProduct } from './views/product.js';
import { renderList } from './views/list.js';
import { renderStores } from './views/stores.js';
import { renderAdmin } from './views/admin.js';
import { renderAppPage } from './views/app-page.js';
import { setAdsConfig, activateAds } from './ads.js';
import './install.js'; // escucha el aviso de instalación desde que carga la página

const view = document.getElementById('view');
const searchInput = document.getElementById('search-input');

// [ruta, vista, sección del menú]
const ROUTES = [
  [/^\/$/, renderHome, 'inicio'],
  [/^\/buscar$/, renderSearch, 'buscar'],
  [/^\/producto\/(\d+)$/, renderProduct, null],
  [/^\/lista$/, renderList, 'lista'],
  [/^\/tiendas$/, renderStores, 'tiendas'],
  [/^\/admin$/, renderAdmin, null],
  [/^\/app$/, renderAppPage, 'app'],
];

let storesPromise;
function loadStores() {
  storesPromise ??= getJson('/api/stores').then((list) => new Map(list.map((s) => [s.id, s])));
  return storesPromise;
}

let renderSeq = 0;
async function router({ keepScroll = false } = {}) {
  const seq = ++renderSeq; // si el usuario navega de nuevo, la respuesta vieja se descarta
  const [path, query = ''] = (location.hash.slice(1) || '/').split('?');
  const params = new URLSearchParams(query);

  // Enlace de acceso al panel (#/admin?clave=...): se guarda la clave y se quita de la URL.
  if (path === '/admin' && params.has('clave')) {
    setAdminKey(params.get('clave'));
    params.delete('clave');
    history.replaceState(null, '', '#/admin');
  }

  const [pattern, renderView, section] = ROUTES.find(([re]) => re.test(path)) ?? ROUTES[0];
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === section) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  searchInput.value = path === '/buscar' ? params.get('q') ?? '' : '';

  try {
    const stores = await loadStores();
    const out = await renderView({ params, match: path.match(pattern), stores, refresh: () => router({ keepScroll: true }) });
    if (seq !== renderSeq) return;
    mount(view, out.html);
    out.bind?.(view);
    activateAds(view);
  } catch (err) {
    if (seq !== renderSeq) return;
    mount(view, html`<div class="empty"><div class="big">😕</div><p>No pudimos cargar esta página.</p><p>${err.message}</p></div>`);
  }
  if (!keepScroll) {
    window.scrollTo(0, 0);
    view.focus({ preventScroll: true });
  }
}

function updateCount() {
  const n = listCount();
  document.querySelectorAll('.list-count').forEach((el) => {
    el.hidden = n === 0;
    el.textContent = String(n);
  });
}

document.getElementById('search-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const q = searchInput.value.trim();
  location.hash = q ? `#/buscar?q=${encodeURIComponent(q)}` : '#/buscar';
});

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-add]');
  if (!button) return;
  event.preventDefault();
  addToList({ productId: Number(button.dataset.add), label: button.dataset.label });
  toast('Agregado a tu lista');
});

// Si la foto de una tienda deja de existir, se muestra el ícono de la categoría.
document.addEventListener('error', (event) => {
  const img = event.target;
  if (!(img instanceof HTMLImageElement) || !img.dataset.fallback) return;
  const placeholder = document.createElement('span');
  placeholder.className = 'ph-emoji';
  placeholder.textContent = img.dataset.fallback;
  img.replaceWith(placeholder);
}, true);

window.addEventListener('hashchange', () => router());
window.addEventListener('list-changed', updateCount);
window.addEventListener('storage', updateCount); // cambios desde otra pestaña

getJson('/api/meta')
  .then((meta) => {
    document.getElementById('demo-banner').hidden = !meta.demo;
    setAdsConfig(meta.ads);
    activateAds(view);
  })
  .catch(() => {});

// Necesario para instalar Mercapty como app y abrir la portada sin conexión.
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

// Pie de página: solo los supermercados que hoy tienen precios.
loadStores()
  .then((stores) => {
    const active = [...stores.values()].filter((s) => s.offers > 0);
    if (!active.length) return;
    document.getElementById('footer-stores').replaceChildren(...active.map((s) => {
      const link = document.createElement('a');
      link.href = s.homepage;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = s.name;
      return link;
    }));
  })
  .catch(() => {});
document.getElementById('footer-year').textContent = String(new Date().getFullYear());
updateCount();
router();
