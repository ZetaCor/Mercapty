import { getJson } from '../api.js';
import { html, productGrid, categoryIcon, categoryTint, storeAvatar } from '../ui.js';
import { t, category } from '../i18n.js';
import { renderHero, bindHero } from './hero.js';
import { storeMarquee } from './store-marquee.js';
import { adSlot } from '../ads.js';
import { navigate } from '../nav.js';

const SORT_OPTIONS = [
  ['relevancia', 'Más relevantes'],
  ['nombre', 'Nombre'],
  ['precio', 'Menor precio'],
  ['ahorro', 'Mayor ahorro entre tiendas'],
];

const PAGE_SIZE = 48;

function searchHref({ q = '', categoria = '', orden = '', pagina = 1 }) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (categoria) params.set('categoria', categoria);
  if (orden) params.set('orden', orden);
  if (pagina > 1) params.set('pagina', String(pagina));
  const qs = params.toString();
  return `/buscar${qs ? `?${qs}` : ''}`;
}

function categoryTiles(categories) {
  return html`
    <nav class="cats" aria-label="${t('Categorías')}">
      ${categories.map((c) => html`
        <a class="cat" href="${searchHref({ categoria: c.name })}">
          <span class="cat-icon" style="--ph:${categoryTint(c.name)}" aria-hidden="true">${categoryIcon(c.name)}</span>
          ${category(c.name)}
        </a>`)}
    </nav>`;
}

function categoryChips(categories, current) {
  return html`
    <nav class="chips" aria-label="${t('Categorías')}">
      <a class="chip ${current.categoria ? '' : 'is-active'}" href="${searchHref({ ...current, categoria: '' })}">${t('Todo')}</a>
      ${categories.map((c) => html`
        <a class="chip ${current.categoria === c.name ? 'is-active' : ''}" href="${searchHref({ ...current, categoria: c.name })}">
          ${categoryIcon(c.name)} ${category(c.name)}
        </a>`)}
    </nav>`;
}

// Lo que hoy tiene descuento por el día en algún súper («Martes de frutas y verduras»).
function promoStrip(promos, stores) {
  if (!promos?.length) return '';
  return html`
    <section class="promo-day">
      ${promos.map((p) => {
        const store = stores.get(p.storeId);
        const name = store?.name ?? p.storeId;
        return html`
          <div class="promo-row">
            ${storeAvatar(name, store?.color)}
            <div class="promo-text">
              <b>${p.name}</b>
              <span>${p.discount ? t('Hoy −{n}% en {store}', { n: p.discount, store: name }) : t('Hoy en {store}', { store: name })}</span>
            </div>
            ${p.categories.length === 1
              ? html`<a class="btn btn-sm" href="${searchHref({ categoria: p.categories[0] })}">${t('Ver productos')}</a>`
              : ''}
          </div>`;
      })}
      <p class="meta">${t('Lo anuncia la tienda: confirma el descuento al pagar.')}</p>
    </section>`;
}

export async function renderHome({ stores, promos }) {
  const [meta, deals, categories, all] = await Promise.all([
    getJson('/api/meta'),
    getJson('/api/deals?limit=8'),
    getJson('/api/categories'),
    getJson('/api/products?limit=12'),
  ]);
  return {
    html: html`
      ${renderHero({ meta, stores, deals })}
      ${promoStrip(promos, stores)}
      ${storeMarquee(stores)}

      <section class="section">
        <div class="section-head"><h2>${t('Categorías')}</h2></div>
        ${categoryTiles(categories)}
      </section>

      <section class="section">
        <div class="section-head">
          <h2>${t('Donde más ahorras eligiendo bien')}</h2>
          <a class="link" href="${searchHref({ orden: 'ahorro' })}">${t('Ver más')}</a>
        </div>
        ${productGrid(deals, stores)}
      </section>

      ${adSlot('home')}

      <section class="section">
        <div class="section-head">
          <h2>${t('Productos')}</h2>
          <a class="link" href="/buscar">${t('Ver todos ({n})', { n: all.total })}</a>
        </div>
        ${productGrid(all.items, stores)}
      </section>`,
    bind: bindHero,
  };
}

export async function renderSearch({ params, stores }) {
  const current = {
    q: params.get('q') ?? '',
    categoria: params.get('categoria') ?? '',
    orden: params.get('orden') ?? 'relevancia',
  };
  const page = Math.max(1, Number.parseInt(params.get('pagina'), 10) || 1);
  const qs = new URLSearchParams({ ...current, limit: String(PAGE_SIZE * page) });
  const [result, categories] = await Promise.all([
    getJson(`/api/products?${qs}`),
    getJson('/api/categories'),
  ]);
  const title = current.q
    ? t('Resultados para «{q}»', { q: current.q })
    : current.categoria ? category(current.categoria) : t('Todos los productos');

  return {
    title,
    html: html`
      <div class="section-head">
        <div>
          <h1>${title}</h1>
          <span class="muted">${result.total === 1 ? t('1 producto') : t('{n} productos', { n: result.total })}</span>
        </div>
        <select id="sort" aria-label="${t('Ordenar por')}">
          ${SORT_OPTIONS.map(([value, text]) => html`<option value="${value}" ${value === current.orden ? html`selected` : ''}>${t(text)}</option>`)}
        </select>
      </div>
      ${categoryChips(categories, current)}
      ${result.approximate
        ? html`<p class="notice-soft">${t('No encontramos productos con todas las palabras de «{q}». Te mostramos los más parecidos.', { q: current.q })}</p>`
        : ''}
      ${result.items.length
        ? productGrid(result.items, stores)
        : html`<div class="empty">
            <div class="big">🔎</div>
            <p>${t('No encontramos productos para esa búsqueda.')}</p>
            <p>${t('Prueba con otra palabra (por ejemplo «leche», «arroz» o una marca) o')} <a href="/buscar">${t('mira todo el catálogo')}</a>.</p>
          </div>`}
      ${result.items.length ? adSlot('search') : ''}
      ${result.total > result.items.length
        ? html`<div class="more"><button class="btn" type="button" data-more>${t('Ver más')} (${result.total - result.items.length})</button></div>`
        : ''}`,
    bind(root) {
      root.querySelector('#sort').addEventListener('change', (event) => {
        navigate(searchHref({ ...current, orden: event.target.value }));
      });
      // "Ver más" cambia la dirección sin saltar al inicio de la página.
      root.querySelector('[data-more]')?.addEventListener('click', () => {
        navigate(searchHref({ ...current, pagina: page + 1 }), { replace: true });
      });
    },
  };
}
