// Página «Descarga la app» (/app). Hoy Mercapty se instala como app web,
// sin tienda de aplicaciones; las versiones de App Store y Google Play vienen después.
import { html, icons } from '../ui.js';
import { phoneVisual } from './hero.js';
import { canInstall, isStandalone, promptInstall } from '../install.js';

const FEATURES = [
  ['🔎', 'Compara al instante', 'Busca cualquier producto y mira su precio en cada supermercado.', true],
  ['🛒', 'Tu lista siempre contigo', 'Arma la canasta en casa y revísala en el pasillo del súper.', true],
  ['📷', 'Escanea el código de barras', 'Apunta la cámara a un producto y mira dónde está más barato.', false],
  ['🔔', 'Alertas de precio', 'Te avisamos cuando baje lo que siempre compras.', false],
];

export async function renderAppPage() {
  return {
    title: 'Descarga la app',
    html: html`
      <div class="app-page">
        <section class="app-hero">
          <div class="app-hero-copy">
            <span class="eyebrow">App de Mercapty</span>
            <h1>El precio más bajo, en tu bolsillo</h1>
            <p>Instala Mercapty en tu celular en segundos. Se abre como una app, casi no ocupa espacio y no necesitas
              pasar por ninguna tienda de aplicaciones.</p>
            <div class="hero-actions">
              <button class="btn btn-primary btn-lg" type="button" data-install hidden>Instalar Mercapty</button>
              <button class="btn btn-lg" type="button" data-scroll>Cómo instalarla</button>
            </div>
            <p class="installed-note" data-installed hidden>✓ Ya tienes Mercapty instalada en este dispositivo.</p>
            <div class="store-badges on-light">
              <span class="store-badge">${icons.phone}<span><small>Próximamente en</small>App Store</span></span>
              <span class="store-badge">${icons.phone}<span><small>Próximamente en</small>Google Play</span></span>
            </div>
          </div>
          <div class="app-hero-visual">${phoneVisual()}</div>
        </section>

        <section class="section">
          <div class="section-head"><h2>Lo que puedes hacer con la app</h2></div>
          <div class="feature-grid">
            ${FEATURES.map(([emoji, title, text, ready]) => html`
              <article class="feature">
                <span class="feature-icon" aria-hidden="true">${emoji}</span>
                <h3>${title}</h3>
                <p>${text}</p>
                <span class="tag ${ready ? 'good' : ''}">${ready ? 'Disponible' : 'Próximamente'}</span>
              </article>`)}
          </div>
        </section>

        <section class="section" id="instalar">
          <div class="section-head"><h2>Instálala hoy</h2></div>
          <div class="install-steps">
            <div class="panel">
              <h3>Android · Chrome</h3>
              <ol>
                <li>Abre Mercapty en Chrome.</li>
                <li>Toca el menú <b>⋮</b> y elige <b>Instalar app</b> o <b>Agregar a la pantalla principal</b>.</li>
                <li>Confirma: el cerdito aparecerá en tu pantalla.</li>
              </ol>
            </div>
            <div class="panel">
              <h3>iPhone · Safari</h3>
              <ol>
                <li>Abre Mercapty en Safari.</li>
                <li>Toca <b>Compartir</b> (el cuadro con la flecha hacia arriba).</li>
                <li>Elige <b>Agregar a inicio</b> y luego <b>Agregar</b>.</li>
              </ol>
            </div>
          </div>
        </section>
      </div>`,
    bind(root) {
      const page = root.querySelector('.app-page');
      const installButton = page.querySelector('[data-install]');
      const refresh = () => {
        installButton.hidden = !canInstall();
        page.querySelector('[data-installed]').hidden = !isStandalone();
      };
      const onChange = () => {
        if (!page.isConnected) return window.removeEventListener('install-changed', onChange);
        refresh();
      };
      window.addEventListener('install-changed', onChange);
      refresh();

      installButton.addEventListener('click', async () => {
        await promptInstall();
        refresh();
      });
      page.querySelector('[data-scroll]').addEventListener('click', () => {
        page.querySelector('#instalar').scrollIntoView({ behavior: 'smooth' });
      });
    },
  };
}
