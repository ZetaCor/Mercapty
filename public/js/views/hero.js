// Hero de la portada: carrusel de tres diapositivas (comparar, armar la
// canasta y la app que viene). Se desliza con el dedo, con los puntos o las
// flechas, y avanza solo cada pocos segundos.
import { html, hl, money, storeAvatar, productMedia, timeAgo, icons } from '../ui.js';
import { t, lang } from '../i18n.js';

const SLIDE_MS = 7000;
const BASKET = [['🍚', 'Arroz'], ['🍗', 'Pollo'], ['🥚', 'Huevos'], ['🥛', 'Leche']];
const listFormat = new Intl.ListFormat(lang, { style: 'long', type: 'conjunction' });

// El número y los nombres salen de las tiendas que hoy tienen precios, para
// que el texto nunca prometa más supermercados de los que se comparan.
function activeStores(stores) {
  const names = [...stores.values()].filter((s) => s.offers > 0).map((s) => s.name);
  return {
    where: names.length === 1
      ? t('en 1 supermercado')
      : names.length ? t('en {n} supermercados a la vez', { n: names.length }) : t('en los supermercados de Panamá'),
    list: names.length ? listFormat.format(names) : t('los principales supermercados en línea de Panamá'),
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
      <div class="basket-head">${t('Tu canasta')}</div>
      ${BASKET.map(([emoji, name]) => html`
        <div class="basket-row"><span class="basket-emoji">${emoji}</span>${t(name)}<span class="basket-check">✓</span></div>`)}
      <div class="basket-total">${t('Te decimos dónde te cuesta menos')}</div>
    </div>`;
}

// El teléfono de la portada enseña la app de verdad: el mismo saludo con el cerdito, la
// misma búsqueda y las mismas tarjetas de precio. Está dibujado con HTML, no con una
// captura, así se queda nítido en cualquier pantalla, pesa nada y habla los dos idiomas.
export function phoneVisual() {
  const hora = new Date().getHours();
  // Igual que la app: de 6 de la mañana a 6 de la tarde, sol; el resto, luna.
  const dia = hora >= 6 && hora < 18;
  const saludo = !dia ? t('Hola, buenas noches') : hora < 12 ? t('Hola, buenos días') : t('Hola, buenas tardes');
  const card = (emoji, name, price, store, saving) => html`
    <div class="phone-card">
      <span>${emoji}</span>
      <div>
        <b>${price}</b>
        <i>${name}</i>
        <small>${t('en {store}', { store })}${saving ? html` · <em>${t('Ahorra {amount}', { amount: saving })}</em>` : ''}</small>
      </div>
    </div>`;
  return html`
    <div class="phone" aria-hidden="true">
      <div class="phone-notch"></div>
      <div class="phone-screen">
        <div class="phone-brand">Merca<b>pty</b></div>
        <div class="phone-search">${t('Busca leche, arroz…')}</div>
        <div class="phone-hello">
          <img src="/piggy-hello.svg" alt="" width="44" height="44" loading="lazy">
          <div>
            <b>${saludo}</b>
            <small>${t('¿Qué vas a comprar hoy?')}</small>
          </div>
          <span class="phone-sky ${dia ? 'day' : 'night'}">${dia ? icons.sun : icons.moon}</span>
        </div>
        ${card('🥛', t('Leche entera'), '$1.19', 'Super Xtra', '$0.30')}
        ${card('🍚', t('Arroz 5 lb'), '$3.45', 'El Machetazo', '')}
        <div class="phone-scan">${t('Escanear código de barras')}</div>
        <div class="phone-tabs">
          <span class="on">${t('Inicio')}</span><span>${t('Buscar')}</span><span>${t('Mi lista')}</span><span>${t('Tiendas')}</span>
        </div>
      </div>
    </div>`;
}

export function renderHero({ meta, stores, deals }) {
  const { where, list } = activeStores(stores);
  const slides = [
    {
      className: 'slide-main',
      label: t('El precio más bajo de tu canasta'),
      visual: priceStack(deals, stores),
      body: html`
        <span class="eyebrow">${t('Canasta básica · Panamá')}</span>
        <h1>${hl(t('El [precio más bajo] de tu canasta básica, {where}.', { where }))}</h1>
        <p>${t('Mercapty compara arroz, pollo, huevos, leche y decenas de productos en {list}. Arma tu canasta y te decimos exactamente dónde te costará menos.', { list })}</p>
        <div class="hero-actions">
          <a class="btn btn-primary btn-lg" href="/buscar">${t('Arma tu canasta')}</a>
          <a class="btn btn-lg" href="/buscar?orden=ahorro">${t('Ver dónde se ahorra más')}</a>
        </div>
        <div class="hero-stats">
          <div><b>${meta.products}</b><span>${t('productos')}</span></div>
          <div><b>${meta.offers}</b><span>${t('precios comparados')}</span></div>
        </div>
        <div class="meta hero-updated">${t('Precios actualizados {ago}', { ago: timeAgo(meta.updatedAt) })}</div>`,
    },
    {
      className: 'slide-list',
      label: t('Arma tu canasta'),
      visual: basketVisual(),
      body: html`
        <span class="eyebrow">${t('Mi lista')}</span>
        <h2 class="slide-title">${t('Arma tu canasta y ahorra en cada compra')}</h2>
        <p>${t('Agrega lo que compras cada semana y te decimos si conviene comprar todo en un súper o repartir la compra entre varios.')}</p>
        <div class="hero-actions">
          <a class="btn btn-primary btn-lg" href="/buscar">${t('Empezar mi lista')}</a>
          <a class="btn btn-lg" href="/lista">${t('Ver mi lista')}</a>
        </div>`,
    },
    {
      className: 'slide-app',
      label: t('La app de Mercapty'),
      visual: phoneVisual(),
      body: html`
        <span class="eyebrow">${t('Muy pronto')}</span>
        <h2 class="slide-title">${t('Mercapty en tu celular')}</h2>
        <p>${t('Compara precios desde el pasillo del súper, escanea el código de barras y recibe un aviso cuando baje lo que siempre compras.')}</p>
        <div class="store-badges">
          <span class="store-badge">${icons.phone}<span><small>${t('Próximamente en')}</small>App Store</span></span>
          <span class="store-badge">${icons.phone}<span><small>${t('Próximamente en')}</small>Google Play</span></span>
        </div>
        <div class="hero-actions"><a class="btn btn-lg" href="/app">${t('Conoce la app')}</a></div>`,
    },
  ];

  return html`
    <section class="hero-slider" aria-roledescription="${t('carrusel')}" aria-label="${t('Novedades de Mercapty')}">
      <div class="slides" tabindex="0">
        ${slides.map((s, i) => html`
          <article class="slide ${s.className}" aria-roledescription="${t('diapositiva')}"
            aria-label="${t('{i} de {n}: {label}', { i: i + 1, n: slides.length, label: s.label })}">
            <div class="slide-copy">${s.body}</div>
            ${s.visual ? html`<div class="slide-visual">${s.visual}</div>` : ''}
          </article>`)}
      </div>
      <div class="hero-controls">
        <div class="hero-dots">
          ${slides.map((s, i) => html`<button type="button" class="hero-dot" data-slide="${i}" aria-label="${t('Ir a: {label}', { label: s.label })}"></button>`)}
        </div>
        <div class="hero-arrows">
          <button type="button" class="hero-arrow" data-dir="-1" aria-label="${t('Diapositiva anterior')}">${icons.back}</button>
          <button type="button" class="hero-arrow" data-dir="1" aria-label="${t('Diapositiva siguiente')}">${icons.next}</button>
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
