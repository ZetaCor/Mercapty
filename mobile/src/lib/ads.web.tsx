// En la web de la app no va AdMob: los anuncios del sitio los pone AdSense desde el servidor
// (public/js/ads.js). Aquí quedan las mismas piezas sin hacer nada, para que las pantallas se
// escriban una sola vez. La pareja de verdad está en ads.tsx.
export type Intersticial = { listo: boolean; mostrar: () => void };

const SIN_ANUNCIO: Intersticial = { listo: false, mostrar: () => {} };

export const iniciarAnuncios = () => {};
export const estadoDeLosAnuncios = () => 'En la web los anuncios los pone AdSense, no AdMob.';
export const abrirInspector = (): Promise<void> => Promise.reject(new Error('AdMob no está: la web usa AdSense'));
export const AdBanner = () => null;
export const useIntersticial = (): Intersticial => SIN_ANUNCIO;
