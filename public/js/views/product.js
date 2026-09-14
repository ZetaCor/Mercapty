import { getJson } from '../api.js';
import { html, money, storeAvatar, unitPriceText, timeAgo, productLabel, productMedia, productGrid, icons, toast } from '../ui.js';
import { isAdmin } from '../admin-auth.js';
import { uploadProductImage, removeProductImage } from '../images.js';
import { adSlot } from '../ads.js';

const formatDay = (day) => new Date(`${day}T12:00:00`).toLocaleDateString('es-PA', { day: 'numeric', month: 'short' });

// GTIN-14 guardado -> EAN-13 como aparece impreso en el empaque.
const displayGtin = (gtin) => gtin.replace(/^0(?=\d{13}$)/, '');

const titleCase = (s) => (s === s.toUpperCase() ? s.toLowerCase().replace(/(^|\s)(\p{L})/gu, (m, sp, ch) => sp + ch.toUpperCase()) : s);

// Parecidos: primero la misma marca (otros tamaños o variantes) y luego otras marcas.
function similarSection(similar, stores) {
  const { brand, sameBrand = [], others = [] } = similar ?? {};
  if (!sameBrand.length && !others.length) return '';
  return html`
    <section class="section">
      <div class="section-head"><h2>Productos parecidos</h2></div>
      ${sameBrand.length ? html`<h3 class="subhead">Más de ${titleCase(brand)}</h3>${productGrid(sameBrand, stores)}` : ''}
      ${others.length ? html`${sameBrand.length ? html`<h3 class="subhead">Otras marcas</h3>` : ''}${productGrid(others, stores)}` : ''}
    </section>`;
}

function offerRow(offer) {
  return html`
    <div class="offer ${offer.isBest ? 'best' : ''} ${offer.inStock ? '' : 'out'}">
      ${storeAvatar(offer.storeName, offer.storeColor, 'lg')}
      <div>
        <div class="offer-name">
          ${offer.storeName}
          ${offer.isBest ? html`<span class="tag good">Mejor precio</span>` : ''}
          ${offer.listPrice && offer.inStock ? html`<span class="tag promo">Oferta</span>` : ''}
          ${offer.storeSource === 'demo' ? html`<span class="tag demo">demo</span>` : ''}
        </div>
        <div class="offer-sub">${offer.inStock ? 'Disponible' : 'Agotado'} · actualizado ${timeAgo(offer.updatedAt)}</div>
      </div>
      <div class="offer-price">
        <span class="price">${money(offer.price)}</span>${offer.listPrice ? html` <span class="price-old">${money(offer.listPrice)}</span>` : ''}
        <small>${[unitPriceText(offer.unitPrice), offer.diff > 0 ? `+${money(offer.diff)}` : ''].filter(Boolean).join(' · ')}</small>
      </div>
      ${offer.inStock
        ? html`<a class="btn ${offer.isBest ? 'btn-primary' : ''}" href="/go/${offer.id}" target="_blank" rel="noopener">Comprar ${icons.external}</a>`
        : html`<button class="btn" type="button" disabled>Agotado</button>`}
    </div>`;
}

function priceHistory(history, currentBest) {
  if (history.length < 2) return '';
  const prices = history.map((h) => h.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  const w = 100;
  const h = 40;
  const points = history.map((p, i) => [(i / (history.length - 1)) * w, h - 4 - ((p.price - min) / span) * (h - 8)]);
  const line = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  let verdict = '';
  if (currentBest != null && currentBest <= min) verdict = 'Hoy está en su precio más bajo registrado: buen momento para comprar.';
  else if (currentBest != null && currentBest >= max) verdict = 'Hoy está en su precio más alto registrado.';

  return html`
    <section class="panel history">
      <div class="section-head">
        <h2>Historial del mejor precio</h2>
        <span class="muted">${money(min)} – ${money(max)}</span>
      </div>
      ${verdict ? html`<div class="saving-note">${verdict}</div>` : ''}
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Mejor precio entre ${money(min)} y ${money(max)}">
        <path class="area" d="${line} L${w},${h} L0,${h} Z"/>
        <path class="line" d="${line}"/>
      </svg>
      <div class="history-range"><span>${formatDay(history[0].day)}</span><span>${formatDay(history.at(-1).day)}</span></div>
    </section>`;
}

function adminControls(product) {
  if (!isAdmin()) return '';
  return html`
    <div class="pd-admin">
      <label class="btn btn-soft btn-sm">
        ${icons.camera} ${product.image ? 'Cambiar foto' : 'Agregar foto'}
        <input type="file" accept="image/*" data-upload hidden>
      </label>
      ${product.hasCustomImage ? html`<button class="btn btn-sm btn-danger" type="button" data-remove-image>${icons.trash} Quitar foto</button>` : ''}
      <a class="btn btn-sm" href="/admin">Panel de imágenes</a>
    </div>`;
}

export async function renderProduct({ match, stores, refresh }) {
  const product = await getJson(`/api/products/${match[1]}`);
  const best = product.offers.find((o) => o.isBest);
  const available = product.offers.filter((o) => o.inStock).length;

  return {
    title: product.name,
    html: html`
      <div class="product-page">
        <a class="back" href="/buscar">${icons.back} Todos los productos</a>
        <div class="pd">
          <div class="pd-media">
            ${productMedia(product)}
            ${adminControls(product)}
          </div>
          <div class="pd-info">
            ${product.brand ? html`<div class="pd-brand">${product.brand}</div>` : ''}
            <h1>${product.name}</h1>
            <div class="meta">
              ${[product.size, product.category, product.gtin ? `Código ${displayGtin(product.gtin)}` : ''].filter(Boolean).join(' · ')}
            </div>
            ${best
              ? html`
                <div class="best-box">
                  <div class="best-label">Mejor precio</div>
                  <div class="price-xl">${money(best.price)}</div>
                  <div class="best-store">${storeAvatar(best.storeName, best.storeColor)} en <b>${best.storeName}</b></div>
                  <div class="best-actions">
                    <a class="btn btn-primary btn-lg" href="/go/${best.id}" target="_blank" rel="noopener">Comprar en ${best.storeName} ${icons.external}</a>
                    <button class="btn btn-lg" type="button" data-add="${product.id}" data-label="${productLabel(product)}"
                      aria-label="Agregar a mi lista" title="Agregar a mi lista">${icons.plus}</button>
                  </div>
                  ${product.savings > 0
                    ? html`<div class="saving-note">Te ahorras hasta <b>${money(product.savings)}</b> frente a la tienda más cara.</div>`
                    : ''}
                </div>`
              : html`<div class="best-box"><b>Por ahora ninguna tienda lo tiene disponible.</b></div>`}
          </div>
        </div>

        <section class="section">
          <div class="section-head"><h2>Compara en ${available} tienda${available === 1 ? '' : 's'}</h2></div>
          <div class="offers">${product.offers.map(offerRow)}</div>
        </section>
        ${similarSection(product.similar, stores)}
        ${adSlot('product')}
        ${priceHistory(product.history, product.bestPrice)}
      </div>`,
    bind(root) {
      // La barra del navegador muestra la dirección completa con el nombre del producto.
      if (product.path && location.pathname !== product.path) history.replaceState(null, '', product.path);
      const page = root.querySelector('.product-page');
      page.querySelector('[data-upload]')?.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        try {
          toast('Subiendo foto…');
          await uploadProductImage(product.id, file);
          toast('Foto guardada');
          refresh();
        } catch (err) {
          toast(err.message);
        }
      });
      page.querySelector('[data-remove-image]')?.addEventListener('click', async () => {
        if (!confirm('¿Quitar la foto que subiste para este producto?')) return;
        try {
          await removeProductImage(product.id);
          toast('Foto quitada');
          refresh();
        } catch (err) {
          toast(err.message);
        }
      });
    },
  };
}
