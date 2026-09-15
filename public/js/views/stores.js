import { getJson } from '../api.js';
import { html, storeAvatar, storeLogo, timeAgo, icons, whatsappWith } from '../ui.js';
import { t } from '../i18n.js';

const SOURCE_LABEL = {
  vtex: 'precios de su web',
  woocommerce: 'precios de su web',
  feed: 'inventario compartido',
};

// Botones para que un supermercado nos escriba (datos en server/contact.js).
function merchantActions(contact = {}) {
  if (!contact.whatsapp && !contact.email) return '';
  const subject = encodeURIComponent(t('Quiero sumar mi tienda a Mercapty'));
  return html`
    <div class="cta-actions">
      ${contact.whatsapp
        ? html`<a class="btn btn-primary" href="${whatsappWith(contact.whatsapp, t('Hola, tengo un supermercado y quiero aparecer en Mercapty.'))}" target="_blank" rel="noopener">${icons.whatsapp} ${t('Escríbenos por WhatsApp')}</a>`
        : ''}
      ${contact.email
        ? html`<a class="btn" href="${contact.email.url}?subject=${subject}">${icons.mail} ${t('Enviar un correo')}</a>`
        : ''}
    </div>`;
}

export async function renderStores() {
  const [stores, meta] = await Promise.all([
    getJson('/api/stores'), // datos frescos: incluye visitas enviadas
    getJson('/api/meta'),
  ]);
  return {
    title: t('Supermercados que comparamos'),
    html: html`
      <div class="section-head">
        <div>
          <h1>${t('Tiendas')}</h1>
          <span class="muted">${t('Supermercados que Mercapty compara hoy.')}</span>
        </div>
      </div>
      <div class="grid wide">
        ${stores.map((s) => html`
          <article class="card store-card">
            <div class="store-head">
              ${s.logo ? storeLogo(s, 'store-logo sm') : storeAvatar(s.name, s.color, 'lg')}
              <div>
                <b>${s.name}</b>
                <div class="meta">${s.platform ?? '—'} · ${SOURCE_LABEL[s.source] ? t(SOURCE_LABEL[s.source]) : s.source}</div>
              </div>
            </div>
            <div class="store-stats">
              <div><b>${s.offers}</b><span>${t('productos')}</span></div>
              <div><b>${s.bestCount}</b><span>${t('mejor precio')}</span></div>
              <div><b>${s.clicks}</b><span>${s.clicks === 1 ? t('visita enviada') : t('visitas enviadas')}</span></div>
            </div>
            <div class="meta">${t('Actualizado {ago}', { ago: timeAgo(s.updatedAt) })}</div>
            <a class="btn btn-sm" href="${s.homepage}" target="_blank" rel="noopener">${t('Visitar tienda')} ${icons.external}</a>
          </article>`)}
      </div>
      <section class="cta-panel">
        <h2>${t('¿Tienes un supermercado o minisúper?')}</h2>
        <p>${t('Comparte tu inventario con Mercapty en un archivo CSV o Excel (código de barras, nombre, marca, presentación, precio, disponibilidad, enlace y foto) y apareces en las comparaciones. Los clientes llegan directo a tu tienda en línea para comprar.')}</p>
        ${merchantActions(meta.contact)}
      </section>`,
  };
}
