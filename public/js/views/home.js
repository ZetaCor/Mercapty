import { getJson } from '../api.js';
import { html, productGrid, categoryIcon, categoryTint } from '../ui.js';
import { renderHero, bindHero } from './hero.js';
import { adSlot } from '../ads.js';
import { navigate } from '../nav.js';

const SORT_OPTIONS = [
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
    <nav class="cats" aria-label="Categorías">
      ${categories.map((c) => html`
        <a class="cat" href="${searchHref({ categoria: c.name })}">
          <span class="cat-icon" style="--ph:${categoryTint(c.name)}" aria-hidden="true">${categoryIcon(c.name)}</span>
          ${c.name}
        </a>`)}
    </nav>`;
}

function categoryChips(categories, current) {
  return html`
    <nav class="chips" aria-label="Categorías">
      <a class="chip ${current.categoria ? '' : 'is-active'}" href="${searchHref({ ...current, categoria: '' })}">Todo</a>
      ${categories.map((c) => html`
        <a class="chip ${current.categoria === c.name ? 'is-active' : ''}" href="${searchHref({ ...current, categoria: c.name })}">
          ${categoryIcon(c.name)} ${c.name}
        </a>`)}
    </nav>`;
}

export async function renderHome({ stores }) {
  const [meta, deals, categories, all] = await Promise.all([
    getJson('/api/meta'),
    getJson('/api/deals?limit=8'),
    getJson('/api/categories'),
    getJson('/api/products?limit=12'),
  ]);
  return {
    html: html`
      ${renderHero({ meta, stores, deals })}

      <section class="section">
        <div class="section-head"><h2>Categorías</h2></div>
        ${categoryTiles(categories)}
      </section>

      <section class="section">
        <div class="section-head">
          <h2>Donde más ahorras eligiendo bien</h2>
          <a class="link" href="${searchHref({ orden: 'ahorro' })}">Ver más</a>
        </div>
        ${productGrid(deals, stores)}
      </section>

      ${adSlot('home')}

      <section class="section">
        <div class="section-head">
          <h2>Productos</h2>
          <a class="link" href="/buscar">Ver todos (${all.total})</a>
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
    orden: params.get('orden') ?? 'nombre',
  };
  const page = Math.max(1, Number.parseInt(params.get('pagina'), 10) || 1);
  const qs = new URLSearchParams({ ...current, limit: String(PAGE_SIZE * page) });
  const [result, categories] = await Promise.all([
    getJson(`/api/products?${qs}`),
    getJson('/api/categories'),
  ]);
  const title = current.q ? `Resultados para «${current.q}»` : current.categoria || 'Todos los productos';

  return {
    title,
    html: html`
      <div class="section-head">
        <div>
          <h1>${title}</h1>
          <span class="muted">${result.total} producto${result.total === 1 ? '' : 's'}</span>
        </div>
        <select id="sort" aria-label="Ordenar por">
          ${SORT_OPTIONS.map(([value, text]) => html`<option value="${value}" ${value === current.orden ? html`selected` : ''}>${text}</option>`)}
        </select>
      </div>
      ${categoryChips(categories, current)}
      ${result.items.length
        ? productGrid(result.items, stores)
        : html`<div class="empty">
            <div class="big">🔎</div>
            <p>No encontramos productos para esa búsqueda.</p>
            <p>Prueba con otra palabra (por ejemplo «leche», «arroz» o una marca) o <a href="/buscar">mira todo el catálogo</a>.</p>
          </div>`}
      ${result.items.length ? adSlot('search') : ''}
      ${result.total > result.items.length
        ? html`<div class="more"><button class="btn" type="button" data-more>Ver más productos (${result.total - result.items.length})</button></div>`
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
