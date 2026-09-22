// Anuncios de Google AdMob dentro de la app. (La web usa AdSense, que es otra cosa:
// public/js/ads.js y server/app.js.)
//
// Los identificadores viven en app.json, en expo.extra.admob. Mientras estén vacíos se usan
// los de prueba de Google: se ven anuncios de mentira, sirven para revisar el diseño y no
// arriesgan la cuenta. Cómo sacar los de verdad y dónde pegarlos: README principal,
// «Anuncios en la app (AdMob)».
//
// El módulo nativo de AdMob solo existe en una versión compilada (EAS Build o
// `npx expo run:android`). En Expo Go no está, así que aquí se carga con cuidado: si no
// aparece, la app funciona igual y los anuncios sencillamente no salen. En la web manda
// ads.web.tsx, que tampoco muestra nada.
import Constants from 'expo-constants';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { T } from '@/components/text';
import { C, PAD, R } from '@/constants/theme';
import { useI18n } from '@/lib/i18n';

type AdMob = typeof import('react-native-google-mobile-ads');

const admob: AdMob | null = (() => {
  try {
    return require('react-native-google-mobile-ads') as AdMob;
  } catch {
    return null; // Expo Go: la app corre, pero sin anuncios
  }
})();

// app.json -> expo.extra.admob = { android: { banner, interstitial }, ios: { … } }
type Unidades = { banner?: string; interstitial?: string };
const propios: Unidades = ((Constants.expoConfig?.extra?.admob ?? {}) as Record<string, Unidades>)[Platform.OS] ?? {};

// Bloque de anuncio: el tuyo si ya está puesto en app.json, y si no el de prueba de Google.
const BANNER = propios.banner || admob?.TestIds.BANNER || null;
const INTERSTICIAL = propios.interstitial || admob?.TestIds.INTERSTITIAL || null;

// Cómo le fue al arranque de AdMob. Se guarda porque, si algo falla aquí, lo único que se ve
// en la app es que no salen anuncios, y eso se confunde con no tener anuncios que mostrar.
let encendido = false;
let motivo: string | null = admob ? null : 'el módulo nativo no está en esta versión de la app';

const porQue = (e: unknown) => (e instanceof Error && e.message ? e.message : String(e));

// Se llama una vez al arrancar la app. Primero el permiso de datos —en Europa AdMob lo exige y
// en el resto del mundo no pregunta nada— y después se enciende el SDK. Cada paso se cuida por
// separado: la configuración es un extra y, si se cae, el SDK tiene que encenderse igual.
export function iniciarAnuncios() {
  if (!admob) return;
  const { AdsConsent, MaxAdContentRating, default: mobileAds } = admob;
  AdsConsent.gatherConsent()
    .catch(() => {}) // sin consentimiento se sigue igual: Google sirve anuncios sin personalizar
    .then(() => {
      try {
        mobileAds().setRequestConfiguration({ maxAdContentRating: MaxAdContentRating.PG }).catch(() => {});
      } catch {
        // Da igual: solo limita el tipo de anuncio, no hace falta para encender el SDK.
      }
      return mobileAds().initialize();
    })
    .then(() => { encendido = true; })
    .catch((e: unknown) => { motivo = porQue(e); });
}

// Inspector de AdMob: abre una pantalla de Google, encima de la app, que dice qué pidió y qué
// contestó cada bloque («sin relleno», «app no aprobada»…). Es la forma de saber por qué no
// sale un anuncio sin adivinar. Va escondido detrás de una pulsación larga en Ajustes, porque
// es para revisar, no algo que un usuario deba encontrar.
//
// Cuando no se puede abrir, el error dice por qué con todas las letras: si el inspector falla,
// lo que falla casi siempre son también los anuncios, y ese motivo es justo lo que se busca.
export function abrirInspector(): Promise<void> {
  if (!admob) return Promise.reject(new Error(`AdMob no está: ${motivo}`));
  if (!encendido) return Promise.reject(new Error(`AdMob no encendió: ${motivo ?? 'todavía está arrancando'}`));
  return admob.default().openAdInspector().catch((e: unknown) => {
    throw new Error(`El inspector no abrió: ${porQue(e)}`);
  });
}

// Lo último que contestó Google a cada clase de anuncio. El inspector de arriba solo abre en
// un teléfono registrado como dispositivo de pruebas en AdMob, que es un rodeo largo para lo
// que casi siempre se quiere saber: si el anuncio no se pidió, no llegó, o llegó y no se vio.
// Esto se lee sin registrar nada.
let ultimaFranja: string | null = null;
let ultimoIntersticial: string | null = null;

/** Un párrafo en castellano con el estado de los anuncios, para el diagnóstico de Ajustes. */
export function estadoDeLosAnuncios(): string {
  if (!admob) return `AdMob no está en esta versión de la app: ${motivo}`;
  if (!encendido) return `AdMob no encendió: ${motivo ?? 'todavía está arrancando'}`;
  const dePrueba = !propios.banner && !propios.interstitial;
  return [
    `AdMob encendido${dePrueba ? ', con los bloques de prueba de Google' : ''}.`,
    `Franja: ${ultimaFranja ?? 'todavía sin respuesta (abre Inicio o Buscar y vuelve)'}.`,
    `Pantalla completa: ${ultimoIntersticial ?? 'todavía sin respuesta (entra al Juego y vuelve)'}.`,
    '',
    '«Sin anuncio» (no fill) quiere decir que Google recibió la petición y contestó que no tenía nada que mandar. Los dos motivos normales son que la cuenta de AdMob siga en revisión («Account not approved yet»: tarda hasta 24 h, a veces semanas) o que la app todavía no esté publicada en una tienda que AdMob reconozca.',
  ].join('\n');
}

type BannerProps = { style?: StyleProp<ViewStyle> };

/** Lo que una pantalla necesita saber del anuncio de pantalla completa. */
export type Intersticial = { listo: boolean; mostrar: () => void };

const SIN_ANUNCIO: Intersticial = { listo: false, mostrar: () => {} };

// Las dos piezas se arman al cargar el archivo, no en cada dibujo: así el componente y el
// hook que ve React son siempre los mismos, tanto si hay módulo nativo como si no.
export const AdBanner: (props: BannerProps) => ReactElement | null = admob ? construirBanner(admob) : () => null;
export const useIntersticial: () => Intersticial = admob ? construirIntersticial(admob) : () => SIN_ANUNCIO;

// Franja de anuncio. No ocupa sitio hasta que Google manda uno: si no hay nada que mostrar,
// no queda un hueco vacío en medio de la página.
function construirBanner(lib: AdMob) {
  return function AdBanner({ style }: BannerProps) {
    const { t } = useI18n();
    const [cargado, setCargado] = useState(false);
    if (!BANNER) return null;
    return (
      <View style={[styles.caja, !cargado && styles.plegado, style]}>
        {cargado && <T size={11} color={C.muted} style={styles.etiqueta}>{t('Publicidad')}</T>}
        <lib.BannerAd
          unitId={BANNER}
          size={lib.BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
          onAdLoaded={() => { ultimaFranja = 'llegó y se está viendo'; setCargado(true); }}
          onAdFailedToLoad={(e) => { ultimaFranja = porQue(e); setCargado(false); }}
        />
      </View>
    );
  };
}

// Anuncio de pantalla completa. Se va cargando solo por detrás y, en cuanto uno se cierra,
// empieza a cargar el siguiente: así el de dentro de cinco tiros ya está listo cuando toca.
function construirIntersticial(lib: AdMob) {
  return function useIntersticial(): Intersticial {
    const anuncio = lib.useInterstitialAd({ adUnitId: INTERSTICIAL });
    const { status, show, load } = anuncio;
    const fallo = anuncio.error?.message ?? null;
    useEffect(() => {
      if (status === 'loaded') ultimoIntersticial = 'listo para salir';
      else if (status === 'no-fill') ultimoIntersticial = `sin anuncio disponible (${fallo ?? 'no fill'})`;
      else if (status === 'error') ultimoIntersticial = fallo ?? 'error sin mensaje';
    }, [fallo, status]);
    useEffect(() => {
      if (status === 'closed') load();
    }, [load, status]);
    const mostrar = useCallback(() => {
      if (status === 'loaded') show();
    }, [show, status]);
    return { listo: status === 'loaded', mostrar };
  };
}

const styles = StyleSheet.create({
  caja: { marginHorizontal: PAD, alignItems: 'center', gap: 4, borderRadius: R.md, overflow: 'hidden' },
  plegado: { height: 0 },
  etiqueta: { alignSelf: 'flex-start' },
});
