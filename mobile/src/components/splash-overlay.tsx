// Arranque animado. El splash nativo muestra el cerdito quieto en el centro
// (assets/images/splash-icon*.png); esta capa se dibuja encima en el mismo lugar,
// esconde el nativo y pone al cerdito a correr mientras carga la app. Al terminar
// se desvanece y deja ver la bienvenida o la portada.
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { PiggyLoader } from './piggy-loader';
import { T } from './text';

import { C } from '@/constants/theme';
import { useI18n } from '@/lib/i18n';

const MIN_MS = 1600; // una vuelta completa del billete: se alcanza a ver al cerdito correr

export function SplashOverlay({ ready, fontsReady }: { ready: boolean; fontsReady: boolean }) {
  const [visible, setVisible] = useState(true);
  const { t } = useI18n();
  const [minElapsed, setMinElapsed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMinElapsed(true), MIN_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (ready && minElapsed) setVisible(false);
  }, [ready, minElapsed]);

  if (!visible) return null;
  return (
    <Animated.View
      exiting={FadeOut.duration(380)}
      style={styles.overlay}
      onLayout={() => {
        SplashScreen.hideAsync().catch(() => {});
      }}>
      <PiggyLoader width={240} />
      {fontsReady && (
        <Animated.View entering={FadeIn.duration(450)} style={styles.brand}>
          <T size={26} w={600} tight>
            Merca<T size={26} w={800} tight color={C.brand}>pty</T>
          </T>
          <T size={14} color={C.muted}>{t('Buscando los mejores precios…')}</T>
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 1000,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Debajo del cerdito sin moverlo del centro, para que calce con el splash nativo.
  brand: {
    position: 'absolute',
    top: '50%',
    marginTop: 76,
    alignItems: 'center',
    gap: 4,
  },
});

// Para las pantallas que cargan: el mismo cerdito que en la web.
export function LoadingPiggy({ text }: { text?: string }) {
  const { t } = useI18n();
  const label = text ?? t('Buscando los mejores precios…');
  return (
    <View style={loadingStyles.box} accessibilityRole="progressbar" accessibilityLabel={label}>
      <PiggyLoader width={200} />
      <T w={500} color={C.muted}>{label}</T>
    </View>
  );
}

const loadingStyles = StyleSheet.create({
  box: { alignItems: 'center', gap: 4, paddingVertical: 48, paddingHorizontal: 16 },
});
