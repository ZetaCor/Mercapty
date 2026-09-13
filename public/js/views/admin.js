// Panel para agregar fotos a los productos (#/admin). Protegido con la clave
// de administrador que muestra el servidor al iniciar.
import { adminRequest } from '../api.js';
import { html, productMedia, icons, toast } from '../ui.js';
import { getAdminKey, setAdminKey, clearAdminKey } from '../admin-auth.js';
import { uploadProductImage, removeProductImage } from '../images.js';

// Se conservan entre renders (por ejemplo, después de subir una foto).
const filters = { text: '', missingOnly: false };

const normalize = (s) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

function loginView(refresh, error = '') {
  return {
    html: html`
      <div class="login panel">
        <h1>Panel de imágenes</h1>
        <p class="muted">Ingresa la clave de administrador. La muestra el servidor al iniciar (<code>npm start</code>)
          y también está en <code>data/admin-key.txt</code>.</p>
        ${error ? html`<p><span class="tag promo">${error}</span></p>` : ''}
        <form id="login-form">
          <input class="input" name="key" type="password" placeholder="Clave" autocomplete="current-password" required>
          <button class="btn btn-primary" type="submit">Entrar</button>
        </form>
      </div>`,
    bind(root) {
      root.querySelector('#login-form').addEventListener('submit', (event) => {
        event.preventDefault();
        setAdminKey(new FormData(event.target).get('key').trim());
        refresh();
      });
    },
  };
}

function adminCard(p) {
  const source = p.customImage ? 'Foto subida por ti' : p.storeImage ? 'Foto de la tienda' : 'Sin foto';
  return html`
    <article class="card admin-card" data-id="${p.id}" data-has-image="${p.image ? '1' : ''}"
      data-search="${normalize(`${p.name} ${p.brand ?? ''} ${p.size ?? ''}`)}">
      <div class="media-wrap">${productMedia(p)}</div>
      <div class="card-body">
        <div class="name">${p.name}</div>
        <div class="meta">${[p.brand, p.size].filter(Boolean).join(' · ')}</div>
        <div class="tags"><span class="tag ${p.customImage ? 'good' : ''}">${source}</span></div>
        <div class="admin-actions">
          <label class="btn btn-soft btn-sm">
            ${icons.camera} ${p.image ? 'Cambiar' : 'Subir foto'}
            <input type="file" accept="image/*" data-upload hidden>
          </label>
          ${p.customImage
            ? html`<button class="btn btn-sm btn-danger" type="button" data-remove aria-label="Quitar foto" title="Quitar foto">${icons.trash}</button>`
            : ''}
        </div>
      </div>
    </article>`;
}

export async function renderAdmin({ refresh }) {
  if (!getAdminKey()) return loginView(refresh);

  let products;
  try {
    products = await adminRequest('/api/admin/products');
  } catch (err) {
    if (err.status !== 401) throw err;
    clearAdminKey();
    return loginView(refresh, 'La clave no es correcta.');
  }
  const withImage = products.filter((p) => p.image).length;

  return {
    html: html`
      <div class="admin-page">
        <div class="section-head">
          <div>
            <h1>Imágenes de productos</h1>
            <span class="muted">${withImage} de ${products.length} productos tienen foto</span>
          </div>
          <button class="btn btn-sm" type="button" data-logout>Salir</button>
        </div>
        <p class="drop-hint">Toca «Subir foto» o arrastra una imagen sobre el producto. Se ajusta el tamaño
          automáticamente. Las fotos que subes aquí reemplazan a las de las tiendas.</p>
        <div class="admin-toolbar">
          <input class="input" type="search" placeholder="Filtrar productos…" value="${filters.text}" data-filter aria-label="Filtrar productos">
          <label><input type="checkbox" data-missing ${filters.missingOnly ? html`checked` : ''}> Solo sin foto</label>
        </div>
        <div class="grid">${products.map(adminCard)}</div>
      </div>`,
    bind(root) {
      const page = root.querySelector('.admin-page');

      const applyFilters = () => {
        const needle = normalize(filters.text.trim());
        page.querySelectorAll('.admin-card').forEach((card) => {
          card.hidden = Boolean((needle && !card.dataset.search.includes(needle)) || (filters.missingOnly && card.dataset.hasImage));
        });
      };
      applyFilters();
      page.querySelector('[data-filter]').addEventListener('input', (event) => {
        filters.text = event.target.value;
        applyFilters();
      });
      page.querySelector('[data-missing]').addEventListener('change', (event) => {
        filters.missingOnly = event.target.checked;
        applyFilters();
      });
      page.querySelector('[data-logout]').addEventListener('click', () => {
        clearAdminKey();
        refresh();
      });

      const upload = async (card, file) => {
        const overlay = document.createElement('div');
        overlay.className = 'uploading';
        overlay.textContent = 'Subiendo…';
        card.querySelector('.media-wrap').append(overlay);
        try {
          await uploadProductImage(card.dataset.id, file);
          toast('Foto guardada');
          refresh();
        } catch (err) {
          overlay.remove();
          toast(err.message);
        }
      };

      page.addEventListener('change', (event) => {
        const input = event.target.closest('[data-upload]');
        if (input?.files[0]) upload(input.closest('.admin-card'), input.files[0]);
      });
      page.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-remove]');
        if (!button || !confirm('¿Quitar la foto que subiste?')) return;
        try {
          await removeProductImage(button.closest('.admin-card').dataset.id);
          toast('Foto quitada');
          refresh();
        } catch (err) {
          toast(err.message);
        }
      });

      // Arrastrar y soltar una imagen sobre la tarjeta del producto.
      page.addEventListener('dragover', (event) => {
        const card = event.target.closest('.admin-card');
        if (!card) return;
        event.preventDefault();
        card.classList.add('dragover');
      });
      page.addEventListener('dragleave', (event) => {
        event.target.closest('.admin-card')?.classList.remove('dragover');
      });
      page.addEventListener('drop', (event) => {
        const card = event.target.closest('.admin-card');
        if (!card) return;
        event.preventDefault();
        card.classList.remove('dragover');
        const file = event.dataTransfer.files[0];
        if (file) upload(card, file);
      });
    },
  };
}
