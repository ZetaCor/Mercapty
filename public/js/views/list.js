import { postJson } from '../api.js';
import { html, money, storeAvatar, productMedia } from '../ui.js';
import { getList, setQty, clearList } from '../list-store.js';

function cheapestPlan({ split, bestSingle, savings }) {
  if (!split.stores.length) return '';
  const title = split.stores.length === 1
    ? `Todo en ${split.stores[0].storeName}`
    : `Repartir en ${split.stores.length} tiendas`;
  return html`
    <div class="plan best">
      <div class="best-label">Lo más barato</div>
      <div class="plan-head"><h2>${title}</h2><span class="price">${money(split.total)}</span></div>
      ${savings > 0 ? html`<div class="saving-note">Ahorras <b>${money(savings)}</b> frente a comprar todo en ${bestSingle.storeName}.</div>` : ''}
      ${split.stores.map((group) => html`
        <div class="plan-store">
          <div class="plan-head">
            <span class="cell-store">${storeAvatar(group.storeName, group.storeColor)} <b>${group.storeName}</b></span>
            <b>${money(group.subtotal)}</b>
          </div>
          <ul class="plan-lines">
            ${group.lines.map((line) => html`
              <li>
                <span>${line.qty} × ${line.label}</span>
                <a href="/go/${line.offerId}" target="_blank" rel="noopener">${money(line.subtotal)} ↗</a>
              </li>`)}
          </ul>
        </div>`)}
    </div>`;
}

function singleStorePlan({ bestSingle, split }) {
  if (!bestSingle || split.stores.length <= 1) return '';
  return html`
    <div class="plan">
      <div class="plan-head"><h2>Todo en una sola tienda</h2><span class="price">${money(bestSingle.total)}</span></div>
      <p class="cell-store">${storeAvatar(bestSingle.storeName, bestSingle.storeColor)} <b>${bestSingle.storeName}</b></p>
      <p class="muted">${bestSingle.complete
        ? 'Tiene todos tus productos: pagas un poco más, pero con un solo envío.'
        : `Le faltan: ${bestSingle.missing.join(', ')}.`}</p>
    </div>`;
}

function storeRanking({ perStore, considered }) {
  if (!perStore.length) return '';
  return html`
    <details class="panel">
      <summary>Comparar todas las tiendas</summary>
      <table class="store-rank">
        <thead><tr><th>Tienda</th><th>Tiene</th><th>Total</th></tr></thead>
        <tbody>
          ${perStore.map((s) => html`
            <tr>
              <td><span class="cell-store">${storeAvatar(s.storeName, s.storeColor)} ${s.storeName}</span></td>
              <td>${considered - s.missing.length}/${considered}</td>
              <td>${money(s.total)}</td>
            </tr>`)}
        </tbody>
      </table>
    </details>`;
}

export async function renderList({ refresh }) {
  const list = getList();
  if (!list.length) {
    return {
      html: html`
        <h1>Mi lista</h1>
        <div class="panel empty">
          <div class="big">🛒</div>
          <p>Tu lista está vacía.</p>
          <p>Agrega productos con el botón <b>+</b> y te decimos dónde te sale más barato comprarlos.</p>
          <a class="btn btn-primary" href="#/buscar">Ver productos</a>
        </div>`,
    };
  }

  const result = await postJson('/api/list/optimize', {
    items: list.map(({ productId, qty }) => ({ productId, qty })),
  });

  return {
    html: html`
      <div class="list-page">
        <div class="section-head">
          <div>
            <h1>Mi lista</h1>
            <span class="muted">${list.length} producto${list.length === 1 ? '' : 's'}</span>
          </div>
          <button class="btn btn-sm" type="button" data-clear>Vaciar lista</button>
        </div>
        <div class="list-layout">
          <section class="panel">
            ${list.map((item) => {
              const thumb = result.thumbs[item.productId] ?? {};
              return html`
                <div class="list-item">
                  ${productMedia({ image: thumb.image, category: thumb.category, name: item.label }, { className: 'thumb' })}
                  <a href="#/producto/${item.productId}">${item.label}</a>
                  <div class="qty">
                    <button type="button" data-qty="${item.productId}" data-delta="-1" aria-label="Quitar uno">−</button>
                    <span>${item.qty}</span>
                    <button type="button" data-qty="${item.productId}" data-delta="1" aria-label="Agregar uno">+</button>
                  </div>
                </div>`;
            })}
          </section>
          <section>
            ${cheapestPlan(result)}
            ${singleStorePlan(result)}
            ${storeRanking(result)}
            ${result.unavailable.length ? html`<p class="muted">Agotado en todas las tiendas: ${result.unavailable.join(', ')}.</p>` : ''}
            <p class="meta">Los totales no incluyen envío: cada tienda tiene su propia tarifa y monto mínimo.</p>
          </section>
        </div>
      </div>`,
    // Se enlaza al contenedor nuevo de cada render para no acumular listeners en #view.
    bind(root) {
      root.querySelector('.list-page').addEventListener('click', (event) => {
        const qtyButton = event.target.closest('[data-qty]');
        if (qtyButton) {
          const id = Number(qtyButton.dataset.qty);
          const item = getList().find((i) => i.productId === id);
          setQty(id, (item?.qty ?? 0) + Number(qtyButton.dataset.delta));
          refresh();
        } else if (event.target.closest('[data-clear]') && confirm('¿Vaciar tu lista?')) {
          clearList();
          refresh();
        }
      });
    },
  };
}
