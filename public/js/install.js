// Instalación de Mercapty como app web (PWA). Chrome y Edge avisan con
// «beforeinstallprompt»; Safari no: ahí se instala desde Compartir.
let deferredPrompt = null;
const notify = () => window.dispatchEvent(new CustomEvent('install-changed'));

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault(); // se usa el botón de la página de la app en lugar del aviso del navegador
  deferredPrompt = event;
  notify();
});
window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  notify();
});

export const canInstall = () => Boolean(deferredPrompt);

export const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

export async function promptInstall() {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  notify();
  return outcome === 'accepted';
}
