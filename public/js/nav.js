// Navegación sin recargar la página: cambia la dirección con la History API y
// avisa a app.js para que muestre la vista nueva.
export function navigate(url, { replace = false } = {}) {
  history[replace ? 'replaceState' : 'pushState'](null, '', url);
  window.dispatchEvent(new CustomEvent('navigate', { detail: { keepScroll: replace } }));
}
