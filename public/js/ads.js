// Anuncios de Google AdSense. No hace nada hasta que el servidor entrega la
// configuración (variable ADSENSE_CLIENT en Vercel). Las vistas marcan cada
// espacio con adSlot('nombre') y app.js lo activa después de mostrarlo.
import { html } from './ui.js';
import { t } from './i18n.js';

let config = null;
const isLocal = () => ['localhost', '127.0.0.1'].includes(location.hostname);

// El script de AdSense ya viene en el HTML que entrega el servidor (adsenseTags en
// server/app.js). Aquí solo se guarda la configuración; si por lo que sea no estuviera, se
// carga desde aquí.
export function setAdsConfig(ads) {
  config = ads ?? null;
  if (!config || document.getElementById('adsbygoogle-js')) return;
  const script = document.createElement('script');
  script.id = 'adsbygoogle-js';
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(config.client)}`;
  document.head.append(script);
}

export const adSlot = (name) => html`<div class="ad-slot" data-ad="${name}" hidden></div>`;

// Segunda red: lo que se le pida a los anuncios nunca sube a app.js, donde el catch del router
// cambiaría toda la página por «No pudimos cargar esta página». Ni un fallo que hoy no vemos
// venir puede costar los precios.
export function activateAds(root) {
  try {
    colocarAnuncios(root);
  } catch (err) {
    console.warn('No se pudieron colocar los anuncios:', err?.message ?? err);
  }
}

function colocarAnuncios(root) {
  if (!config && !isLocal()) return; // sin anuncios configurados, los espacios no se muestran
  for (const box of root.querySelectorAll('[data-ad]:not([data-ad-ready])')) {
    box.dataset.adReady = '1';
    if (!config) {
      // En local se ve dónde irá cada anuncio, para revisar el diseño.
      box.textContent = t('Espacio para anuncio · {name}', { name: box.dataset.ad });
      box.classList.add('ad-preview');
      box.hidden = false;
      continue;
    }
    const slot = config.slots?.[box.dataset.ad];
    if (!slot) continue; // sin bloque definido, los anuncios automáticos de AdSense deciden
    const label = document.createElement('span');
    label.className = 'ad-label';
    label.textContent = t('Publicidad');
    const ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.style.display = 'block';
    ins.dataset.adClient = config.client;
    ins.dataset.adSlot = slot;
    ins.dataset.adFormat = 'auto';
    ins.dataset.fullWidthResponsive = 'true';
    box.replaceChildren(label, ins);
    box.hidden = false;
    mostrarCuandoTengaAncho(box, ins);
  }
}

// AdSense necesita saber de qué ancho pedir el anuncio. Si el espacio todavía mide 0 —la vista
// se acaba de montar y el navegador no ha calculado el diseño, la ventana está minimizada o la
// pestaña se abrió en segundo plano— push() lanza «No slot size for availableWidth=0». Así que
// se espera a que el espacio tenga ancho antes de pedir nada.
function mostrarCuandoTengaAncho(box, ins) {
  if (ins.offsetWidth > 0) return pedirAnuncio(box, ins);
  if (typeof ResizeObserver !== 'function') {
    requestAnimationFrame(() => pedirAnuncio(box, ins));
    return;
  }
  const observer = new ResizeObserver(() => {
    if (!ins.isConnected) return observer.disconnect(); // se cambió de página antes de tiempo
    if (ins.offsetWidth > 0) {
      observer.disconnect();
      pedirAnuncio(box, ins);
    }
  });
  observer.observe(ins);
}

// Un anuncio no puede tumbar la página. activateAds corre dentro del try de app.js, así que
// cualquier excepción de AdSense borraba la vista entera y dejaba «No pudimos cargar esta
// página» en lugar de los precios. El fallo se queda aquí dentro y, como mucho, el sitio se
// queda sin ese anuncio.
function pedirAnuncio(box, ins) {
  if (!ins.isConnected) return;
  try {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  } catch (err) {
    console.warn('AdSense no pudo mostrar este anuncio:', err?.message ?? err);
    box.hidden = true; // mejor sin hueco que un recuadro vacío con su rótulo «Publicidad»
  }
}
