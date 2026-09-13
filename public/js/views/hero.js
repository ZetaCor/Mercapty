// Hero de la portada: carrusel de tres diapositivas (comparar, armar la
// canasta y la app que viene). Se desliza con el dedo, con los puntos o las
// flechas, y avanza solo cada pocos segundos.
import { html, money, storeAvatar, productMedia, timeAgo, icons } from '../ui.js';

const SLIDE_MS = 7000;
const BASKET = [['🍚', 'Arroz'], ['🍗', 'Pollo'], ['🥚', 'Huevos'], ['🥛', 'Leche']];
const listFormat = new Intl.ListFormat('es', { style: 'long', type: 'conjunction' });

// El número y los nombres salen de las tiendas que hoy tienen precios, para
// que el texto nunca prometa más supermercados de los que se comparan.
function activeStores(stores) {
  const names = [...stores.values()].filter((s) => s.offers > 0).map((s) => s.name);
  return {
    where: names.length === 1 ? 'en 1 supermercado' : names.length ? `en ${names.length} supermercados a la vez` : 'en los supermercados de Panamá',
    list: names.length ? listFormat.format(names) : 'los principales supermercados en línea de Panamá',
  };
}

// Tres productos reales con su mejor precio, flotando junto al texto.
function priceStack(deals, stores) {
  const items = deals.filter((d) => d.image).slice(0, 3);
  if (!items.length) return '';
  return html`
    <div class="price-stack" aria-hidden="true">
      ${items.map((item, i) => {
        const store = stores.get(item.bestStoreId);
        return html`
          <div class="price-chip chip-${i + 1}">
            ${productMedia(item, { className: 'price-chip-img' })}
            <div>
              <div class="price-chip-name">${item.name}</div>
              <div class="price-chip-row"><b>${money(item.bestPrice)}</b>${storeAvatar(store?.name, store?.color)}<span>${store?.name}</span></div>
            </div>
          </div>`;
      })}
    </div>`;
}

function basketVisual() {
  return html`
    <div class="basket" aria-hidden="true">
      <div class="basket-head">Tu canasta</div>
      ${BASKET.map(([emoji, name]) => html`
        <div class="basket-row"><span class="basket-emoji">${emoji}</span>${name}<span class="basket-check">✓</span></div>`)}
      <div class="basket-total">Te decimos dónde te cuesta menos</div>
    </div>`;
}

export function phoneVisual() {
  return html`
    <div class="phone" aria-hidden="true">
      <div class="phone-notch"></div>
      <div class="phone-screen">
        <div class="phone-brand">Merca<b>pty</b></div>
        <div class="phone-search">Busca leche, arroz…</div>
        <div class="phone-card"><span>🥛</span><div><b>Leche entera</b><small>Bajó de precio</small></div></div>
        <div class="phone-card"><span>🍚</span><div><b>Arroz 5 lb</b><small>Más barato hoy</small></div></div>
        <div class="phone-scan">Escanear código de barras</div>
      </div>
    </div>`;
}

export function renderHero({ meta, stores, deals }) {
  const { where, list } = activeStores(stores);
  const slides = [
    {
      className: 'slide-main',
      label: 'El precio más bajo de tu canasta',
      visual: priceStack(deals, stores),
      body: html`
        <span class="eyebrow">Canasta básica · Panamá</span>
        <h1>El <span>precio más bajo</span> de tu canasta básica, ${where}.</h1>
        <p>Mercapty compara arroz, pollo, huevos, leche y decenas de productos en ${list}. Arma tu canasta y te
          decimos exactamente dónde te costará menos.</p>
        <div class="hero-actions">
          <a class="btn btn-primary btn-lg" href="/buscar">Arma tu canasta</a>
          <a class="btn btn-lg" href="/buscar?orden=ahorro">Ver dónde se ahorra más</a>
        </div>
        <div class="hero-stats">
          <div><b>${meta.products}</b><span>productos</span></div>
          <div><b>${meta.offers}</b><span>precios comparados</span></div>
        </div>
        <div class="meta hero-updated">Precios actualizados ${timeAgo(meta.updatedAt)}</div>`,
    },
    {
      className: 'slide-list',
      label: 'Arma tu canasta',
      visual: basketVisual(),
      body: html`
        <span class="eyebrow">Mi lista</span>
        <h2 class="slide-title">Arma tu canasta y ahorra en cada compra</h2>
        <p>Agrega lo que compras cada semana y te decimos si conviene comprar todo en un súper o repartir la compra
          entre varios.</p>
        <div class="hero-actions">
          <a class="btn btn-primary btn-lg" href="/buscar">Empezar mi lista</a>
          <a class="btn btn-lg" href="/lista">Ver mi lista</a>
        </div>`,
    },
    {
      className: 'slide-app',
      label: 'La app de Mercapty',
      visual: phoneVisual(),
      body: html`
        <span class="eyebrow">Muy pronto</span>
        <h2 class="slide-title">Mercapty en tu celular</h2>
        <p>Compara precios desde el pasillo del súper, escanea el código de barras y recibe un aviso cuando baje lo
          que siempre compras.</p>
        <div class="store-badges">
          <span class="store-badge">${icons.phone}<span><small>Próximamente en</small>App Store</span></span>
          <span class="store-badge">${icons.phone}<span><small>Próximamente en</small>Google Play</span></span>
        </div>
        <div class="hero-actions"><a class="btn btn-lg" href="/app">Conoce la app</a></div>`,
    },
  ];

  return html`
    <section class="hero-slider" aria-roledescription="carrusel" aria-label="Novedades de Mercapty">
      <div class="slides" tabindex="0">
        ${slides.map((s, i) => html`
          <article class="slide ${s.className}" aria-roledescription="diapositiva" aria-label="${i + 1} de ${slides.length}: ${s.label}">
            <div class="slide-copy">${s.body}</div>
            ${s.visual ? html`<div class="slide-visual">${s.visual}</div>` : ''}
          </article>`)}
      </div>
      <div class="hero-controls">
        <div class="hero-dots">
          ${slides.map((s, i) => html`<button type="button" class="hero-dot" data-slide="${i}" aria-label="Ir a: ${s.label}"></button>`)}
        </div>
        <div class="hero-arrows">
          <button type="button" class="hero-arrow" data-dir="-1" aria-label="Diapositiva anterior">${icons.back}</button>
          <button type="button" class="hero-arrow" data-dir="1" aria-label="Diapositiva siguiente">${icons.next}</button>
        </div>
      </div>
    </section>`;
}

export function bindHero(root) {
  const slider = root.querySelector('.hero-slider');
  if (!slider) return;
  const track = slider.querySelector('.slides');
  const dots = [...slider.querySelectorAll('.hero-dot')];
  let index = 0;

  const go = (i) => {
    index = (i + dots.length) % dots.length;
    track.scrollTo({ left: index * track.clientWidth, behavior: 'smooth' });
  };
  const sync = () => {
    index = Math.round(track.scrollLeft / track.clientWidth);
    dots.forEach((dot, i) => dot.setAttribute('aria-current', String(i === index)));
  };
  track.addEventListener('scroll', () => requestAnimationFrame(sync), { passive: true });
  sync();

  slider.addEventListener('click', (event) => {
    const dot = event.target.closest('[data-slide]');
    if (dot) go(Number(dot.dataset.slide));
    const arrow = event.target.closest('[data-dir]');
    if (arrow) go(index + Number(arrow.dataset.dir));
  });

  // Avance automático: se pausa mientras el usuario lo usa y no corre si
  // prefiere menos movimiento en pantalla.
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let paused = false;
  slider.addEventListener('mouseenter', () => { paused = true; });
  slider.addEventListener('mouseleave', () => { paused = false; });
  slider.addEventListener('focusin', () => { paused = true; });
  slider.addEventListener('focusout', () => { paused = false; });
  slider.addEventListener('touchstart', () => { paused = true; }, { passive: true });
  const timer = setInterval(() => {
    if (!slider.isConnected) return clearInterval(timer); // el usuario salió de la portada
    if (!paused && !document.hidden) go(index + 1);
  }, SLIDE_MS);
}
