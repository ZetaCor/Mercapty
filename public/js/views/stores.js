import { getJson } from '../api.js';
import { html, storeAvatar, timeAgo, icons } from '../ui.js';

const SOURCE_LABEL = {
  vtex: 'precios de su web',
  woocommerce: 'precios de su web',
  feed: 'inventario compartido',
};

export async function renderStores() {
  const stores = await getJson('/api/stores'); // datos frescos: incluye visitas enviadas
  return {
    html: html`
      <div class="section-head">
        <div>
          <h1>Tiendas</h1>
          <span class="muted">Supermercados que Mercapty compara hoy.</span>
        </div>
      </div>
      <div class="grid wide">
        ${stores.map((s) => html`
          <article class="card store-card">
            <div class="store-head">
              ${storeAvatar(s.name, s.color, 'lg')}
              <div>
                <b>${s.name}</b>
                <div class="meta">${s.platform ?? '—'} · ${SOURCE_LABEL[s.source] ?? s.source}</div>
              </div>
            </div>
            <div class="store-stats">
              <div><b>${s.offers}</b><span>productos</span></div>
              <div><b>${s.bestCount}</b><span>mejor precio</span></div>
              <div><b>${s.clicks}</b><span>${s.clicks === 1 ? 'visita enviada' : 'visitas enviadas'}</span></div>
            </div>
            <div class="meta">Actualizado ${timeAgo(s.updatedAt)}</div>
            <a class="btn btn-sm" href="${s.homepage}" target="_blank" rel="noopener">Visitar tienda ${icons.external}</a>
          </article>`)}
      </div>
      <section class="cta-panel">
        <h2>¿Tienes un supermercado o minisúper?</h2>
        <p>Comparte tu inventario con Mercapty en un archivo CSV o Excel (código de barras, nombre, marca,
          presentación, precio, disponibilidad, enlace y foto) y apareces en las comparaciones. Los clientes
          llegan directo a tu tienda en línea para comprar.</p>
      </section>`,
  };
}
