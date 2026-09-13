// Franja de logos de los supermercados que se comparan hoy. Se desliza sola de
// derecha a izquierda, se detiene al pasar el mouse o con el teclado, y queda
// quieta (con desplazamiento a mano) para quien prefiere menos movimiento.
import { html, storeLogo } from '../ui.js';

const MIN_ITEMS = 10; // logos suficientes para cubrir pantallas anchas sin huecos

export function storeMarquee(stores) {
  const active = [...stores.values()].filter((s) => s.offers > 0);
  if (!active.length) return '';
  const items = Array.from({ length: Math.ceil(MIN_ITEMS / active.length) }, () => active).flat();
  // Dos copias iguales: la animación corre una copia completa y vuelve a empezar sin salto.
  // Las repeticiones no se anuncian a lectores de pantalla ni reciben foco.
  const group = (copy) => html`
    <ul class="marquee-group" ${copy ? html`aria-hidden="true"` : ''}>
      ${items.map((s, i) => html`
        <li><a class="marquee-item" href="/tiendas" title="${s.name}"
          ${copy || i >= active.length ? html`tabindex="-1" aria-hidden="true"` : ''}>${storeLogo(s)}</a></li>`)}
    </ul>`;
  return html`
    <section class="section" aria-labelledby="store-strip-title">
      <div class="section-head">
        <h2 id="store-strip-title">Supermercados que comparamos</h2>
        <a class="link" href="/tiendas">Ver tiendas</a>
      </div>
      <div class="marquee" style="--duration:${items.length * 4}s">
        <div class="marquee-track">${group(false)}${group(true)}</div>
      </div>
    </section>`;
}
