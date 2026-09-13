// Anuncios de Google AdSense. No hace nada hasta que el servidor entrega la
// configuración (variable ADSENSE_CLIENT en Vercel). Las vistas marcan cada
// espacio con adSlot('nombre') y app.js lo activa después de mostrarlo.
import { html } from './ui.js';

let config = null;
const isLocal = () => ['localhost', '127.0.0.1'].includes(location.hostname);

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

export function activateAds(root) {
  if (!config && !isLocal()) return; // sin anuncios configurados, los espacios no se muestran
  for (const box of root.querySelectorAll('[data-ad]:not([data-ad-ready])')) {
    box.dataset.adReady = '1';
    if (!config) {
      // En local se ve dónde irá cada anuncio, para revisar el diseño.
      box.textContent = `Espacio para anuncio · ${box.dataset.ad}`;
      box.classList.add('ad-preview');
      box.hidden = false;
      continue;
    }
    const slot = config.slots?.[box.dataset.ad];
    if (!slot) continue; // sin bloque definido, los anuncios automáticos de AdSense deciden
    const label = document.createElement('span');
    label.className = 'ad-label';
    label.textContent = 'Publicidad';
    const ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.style.display = 'block';
    ins.dataset.adClient = config.client;
    ins.dataset.adSlot = slot;
    ins.dataset.adFormat = 'auto';
    ins.dataset.fullWidthResponsive = 'true';
    box.replaceChildren(label, ins);
    box.hidden = false;
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  }
}
