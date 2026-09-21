import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { LogBox, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { UpdateBanner } from '@/components/app-updates';
import { SplashOverlay } from '@/components/splash-overlay';
import { ToastProvider } from '@/components/toast';
import { C } from '@/constants/theme';
import { iniciarAnuncios } from '@/lib/ads';
import { prefetchHome } from '@/lib/api';
import { I18nProvider, useI18n } from '@/lib/i18n';
import { ListProvider } from '@/lib/list';
import { NotificationsProvider, useNotificationTaps } from '@/lib/notifications';
import { OnboardingProvider, useOnboarding } from '@/lib/onboarding';
import { PromosProvider } from '@/lib/promos';
import { StoresProvider } from '@/lib/stores';

// El splash nativo (cerdito quieto) queda hasta que SplashOverlay lo reemplaza.
SplashScreen.preventAutoHideAsync().catch(() => {});

// Aviso de desarrollo de expo-router, no de la app: su NavigationContainer pide la dirección
// inicial durante el primer render y, si React repite ese render, la respuesta llega a una
// copia que nunca se montó. No aparece en la versión publicada. Quitar cuando Expo lo arregle:
// https://github.com/expo/expo/issues/35224
if (__DEV__) LogBox.ignoreLogs(["Can't perform a React state update on a component that hasn't mounted yet"]);

// Si la red está lenta, el arranque no espera más que esto por los precios.
const PREFETCH_MAX_MS = 4000;

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <I18nProvider>
        <OnboardingProvider>
          <StoresProvider>
            <ListProvider>
              <NotificationsProvider>
                <PromosProvider>
                  <ToastProvider>
                    <App />
                  </ToastProvider>
                </PromosProvider>
              </NotificationsProvider>
            </ListProvider>
          </StoresProvider>
        </OnboardingProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}

function App() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });
  const fontsReady = fontsLoaded || fontError != null; // sin Inter, la app sigue con la letra del sistema
  const { seen } = useOnboarding();
  const { t, ready: langReady } = useI18n(); // el idioma guardado, antes de mostrar textos
  useNotificationTaps(); // tocar un aviso abre la ficha del producto

  // Mientras corre el cerdito se piden los datos de la portada y de la bienvenida, y se
  // enciende AdMob: los anuncios tardan unos segundos en llegar y así ya están cuando toca.
  const [dataReady, setDataReady] = useState(false);
  useEffect(() => {
    iniciarAnuncios();
    const timer = setTimeout(() => setDataReady(true), PREFETCH_MAX_MS);
    prefetchHome().then(() => setDataReady(true));
    return () => clearTimeout(timer);
  }, []);

  const ready = fontsReady && seen !== null && langReady;
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />
      {ready && (
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
          {/* La bienvenida solo existe hasta que el usuario toca «Empezar». */}
          <Stack.Protected guard={!seen}>
            <Stack.Screen name="bienvenida" options={{ animation: 'fade' }} />
          </Stack.Protected>
          <Stack.Protected guard={Boolean(seen)}>
            <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
            <Stack.Screen
              name="producto/[id]"
              options={{
                headerShown: true,
                title: '',
                headerBackButtonDisplayMode: 'minimal',
                headerShadowVisible: false,
                headerTintColor: C.text,
                headerStyle: { backgroundColor: C.bg },
              }}
            />
            <Stack.Screen name="escanear" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
            <Stack.Screen
              name="ajustes"
              options={{
                headerShown: true,
                title: t('Ajustes'),
                headerBackButtonDisplayMode: 'minimal',
                headerShadowVisible: false,
                headerTintColor: C.text,
                headerStyle: { backgroundColor: C.bg },
              }}
            />
          </Stack.Protected>
        </Stack>
      )}
      {/* Si se publicó una versión nueva, se descarga sola y aquí se ofrece aplicarla. */}
      <UpdateBanner />
      <SplashOverlay ready={ready && dataReady} fontsReady={fontsReady} />
    </View>
  );
}
