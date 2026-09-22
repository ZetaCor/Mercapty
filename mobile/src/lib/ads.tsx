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

// Se llama una vez al arrancar la app. Primero el permiso de datos —en Europa AdMob lo exige
// y en el resto del mundo no pregunta nada— y después se enciende el SDK.
export function iniciarAnuncios() {
  if (!admob) return;
  const { AdsConsent, MaxAdContentRating, default: mobileAds } = admob;
  AdsConsent.gatherConsent()
    .catch(() => {}) // sin consentimiento se sigue igual: Google sirve anuncios sin personalizar
    .then(() => mobileAds().setRequestConfiguration({ maxAdContentRating: MaxAdContentRating.PG }))
    .then(() => mobileAds().initialize())
    .catch(() => {});
}

// Inspector de AdMob: abre una pantalla de Google, encima de la app, que dice qué pidió y qué
// contestó cada bloque («sin relleno», «app no aprobada»…). Es la forma de saber por qué no
// sale un anuncio sin adivinar. Va escondido detrás de una pulsacion larga en Ajustes, porque
// es para revisar, no algo que un usuario deba encontrar.
export function abrirInspector(): Promise<void> {
  if (!admob) return Promise.reject(new Error('sin AdMob en esta version'));
  return admob.default().openAdInspector();
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
          onAdLoaded={() => setCargado(true)}
          onAdFailedToLoad={() => setCargado(false)}
        />
      </View>
    );
  };
}

// Anuncio de pantalla completa. Se va cargando solo por detrás y, en cuanto uno se cierra,
// empieza a cargar el siguiente: así el de dentro de cinco tiros ya está listo cuando toca.
function construirIntersticial(lib: AdMob) {
  return function useIntersticial(): Intersticial {
    const { status, show, load } = lib.useInterstitialAd({ adUnitId: INTERSTICIAL });
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
