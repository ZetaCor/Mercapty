import { getJson } from './api.js';
import { html, mount, toast, setStoreInfo, setPromos, loader, contactLinks } from './ui.js';
import { addToList, listCount } from './list-store.js';
import { setAdminKey } from './admin-auth.js';
import { navigate } from './nav.js';
import { setAdsConfig, activateAds } from './ads.js';
import { renderHome, renderSearch } from './views/home.js';
import { renderProduct } from './views/product.js';
import { renderList } from './views/list.js';
import { renderStores } from './views/stores.js';
import { renderAdmin } from './views/admin.js';
import { renderAppPage } from './views/app-page.js';
import { t, lang, setLang, translateStatic } from './i18n.js';
import './install.js'; // escucha el aviso de instalación desde que carga la página

const view = document.getElementById('view');
const searchInput = document.getElementById('search-input');
const DEFAULT_TITLE = t('Mercapty · Compara precios de supermercados en Panamá');

// Idioma: los textos fijos de la página y los botones «EN / ES» (arriba y en el pie).
translateStatic();
const otherLang = lang === 'en' ? 'es' : 'en';
for (const button of document.querySelectorAll('[data-lang-toggle]')) {
  const label = button.querySelector('[data-lang-label]') ?? button;
  label.textContent = button.dataset.langToggle === 'short' ? otherLang.toUpperCase() : otherLang === 'en' ? 'English' : 'Español';
  button.lang = otherLang;
  button.setAttribute('aria-label', otherLang === 'en' ? 'Switch to English' : 'Cambiar a español');
  button.addEventListener('click', () => setLang(otherLang));
}

// [ruta, vista, sección del menú]
const ROUTES = [
  [/^\/$/, renderHome, 'inicio'],
  [/^\/buscar\/?$/, renderSearch, 'buscar'],
  [/^\/producto\/(\d+)(?:-[a-z0-9-]*)?\/?$/, renderProduct, null],
  [/^\/lista\/?$/, renderList, 'lista'],
  [/^\/tiendas\/?$/, renderStores, 'tiendas'],
  [/^\/app\/?$/, renderAppPage, 'app'],
  [/^\/admin\/?$/, renderAdmin, null],
];
const isAppRoute = (pathname) => ROUTES.some(([re]) => re.test(pathname));

function renderNotFound() {
  return {
    title: t('Página no encontrada'),
    html: html`
      <div class="empty">
        <div class="big">🧭</div>
        <h1>${t('No encontramos esta página')}</h1>
        <p><a href="/">${t('Vuelve al inicio')}</a> ${t('o busca un producto arriba.')}</p>
      </div>`,
  };
}

// Los enlaces viejos con # (por ejemplo /#/producto/12) pasan a la dirección normal,
// tanto al abrir la página como si solo cambia la parte después del #.
function upgradeLegacyHash() {
  if (!location.hash.startsWith('#/')) return false;
  history.replaceState(null, '', location.hash.slice(1));
  return true;
}
upgradeLegacyHash();

let storesPromise;
function loadStores() {
  storesPromise ??= getJson('/api/stores').then((list) => {
    setStoreInfo(list);
    return new Map(list.map((s) => [s.id, s]));
  });
  return storesPromise;
}

// Días de descuento de hoy. Si fallan, la página sigue igual: van aparte de los precios.
let promosPromise;
function loadPromos() {
  promosPromise ??= getJson('/api/promos').then((list) => {
    setPromos(list);
    return list;
  }, () => []);
  return promosPromise;
}

let renderSeq = 0;
async function router({ keepScroll = false } = {}) {
  const seq = ++renderSeq; // si el usuario navega de nuevo, la respuesta vieja se descarta
  const path = location.pathname;
  const params = new URLSearchParams(location.search);

  // Enlace de acceso al panel (/admin#clave=...): se guarda la clave y se quita de la dirección.
  if (/^\/admin\/?$/.test(path)) {
    const key = new URLSearchParams(location.hash.slice(1)).get('clave') ?? params.get('clave');
    if (key) {
      setAdminKey(key);
      history.replaceState(null, '', '/admin');
    }
  }

  const [pattern, renderView, section] = ROUTES.find(([re]) => re.test(path)) ?? [null, renderNotFound, null];
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === section) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  searchInput.value = path.startsWith('/buscar') ? params.get('q') ?? '' : '';

  // Si la página tarda, el cerdito corre tras el billete mientras llegan los precios.
  const slow = keepScroll ? null : setTimeout(() => { if (seq === renderSeq) mount(view, loader()); }, 350);
  try {
    const [stores, promos] = await Promise.all([loadStores(), loadPromos()]);
    const out = await renderView({ params, match: pattern && path.match(pattern), stores, promos, refresh: () => router({ keepScroll: true }) });
    if (seq !== renderSeq) return;
    mount(view, out.html);
    document.title = out.title ? `${out.title} · Mercapty` : DEFAULT_TITLE;
    out.bind?.(view);
    activateAds(view);
  } catch (err) {
    if (seq !== renderSeq) return;
    mount(view, html`<div class="empty"><div class="big">😕</div><p>${t('No pudimos cargar esta página.')}</p><p>${err.message}</p></div>`);
  }
  clearTimeout(slow);
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
  navigate(q ? `/buscar?q=${encodeURIComponent(q)}` : '/buscar');
});

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-add]');
  if (!button) return;
  event.preventDefault();
  addToList({ productId: Number(button.dataset.add), label: button.dataset.label });
  toast(t('Agregado a tu lista'));
});

// Los enlaces internos cambian de página sin recargar; los externos, los que
// abren otra pestaña y los que usan Ctrl/Cmd se comportan como siempre.
document.addEventListener('click', (event) => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest('a[href]');
  if (!link || link.target || link.hasAttribute('download')) return;
  const url = new URL(link.href, location.href);
  if (url.origin !== location.origin || !isAppRoute(url.pathname)) return;
  event.preventDefault();
  navigate(url.pathname + url.search);
});

// El ícono de una tienda aparece cuando termina de cargar; mientras, sus iniciales.
document.addEventListener('load', (event) => {
  if (event.target instanceof HTMLImageElement && event.target.hasAttribute('data-store-img')) event.target.classList.add('loaded');
}, true);

// Si la foto de una tienda deja de existir, se muestra el ícono de la categoría.
// Si falla el logo o el ícono de una tienda, quedan su nombre o sus iniciales.
document.addEventListener('error', (event) => {
  const img = event.target;
  if (!(img instanceof HTMLImageElement)) return;
  if (img.hasAttribute('data-store-img')) {
    if (img.dataset.name) img.replaceWith(Object.assign(document.createElement('b'), { textContent: img.dataset.name }));
    else img.remove();
    return;
  }
  if (!img.dataset.fallback) return;
  const placeholder = document.createElement('span');
  placeholder.className = 'ph-emoji';
  placeholder.textContent = img.dataset.fallback;
  img.replaceWith(placeholder);
}, true);

window.addEventListener('navigate', (event) => router({ keepScroll: event.detail?.keepScroll }));
window.addEventListener('popstate', () => router());
window.addEventListener('hashchange', () => { if (upgradeLegacyHash()) router(); });
window.addEventListener('list-changed', updateCount);
window.addEventListener('storage', updateCount); // cambios desde otra pestaña

getJson('/api/meta')
  .then((meta) => {
    document.getElementById('demo-banner').hidden = !meta.demo;
    // Pie de página: WhatsApp, correo y redes (solo los canales que tienen dato).
    const contact = contactLinks(meta.contact);
    document.getElementById('footer-contact-col').hidden = !contact.length;
    mount(document.getElementById('footer-contact'), contact);
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
