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
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SplashOverlay } from '@/components/splash-overlay';
import { ToastProvider } from '@/components/toast';
import { C } from '@/constants/theme';
import { prefetchHome } from '@/lib/api';
import { I18nProvider, useI18n } from '@/lib/i18n';
import { ListProvider } from '@/lib/list';
import { OnboardingProvider, useOnboarding } from '@/lib/onboarding';
import { StoresProvider } from '@/lib/stores';

// El splash nativo (cerdito quieto) queda hasta que SplashOverlay lo reemplaza.
SplashScreen.preventAutoHideAsync().catch(() => {});

// Si la red está lenta, el arranque no espera más que esto por los precios.
const PREFETCH_MAX_MS = 4000;

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <I18nProvider>
        <OnboardingProvider>
          <StoresProvider>
            <ListProvider>
              <ToastProvider>
                <App />
              </ToastProvider>
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
  const { ready: langReady } = useI18n(); // el idioma guardado, antes de mostrar textos

  // Mientras corre el cerdito se piden los datos de la portada y de la bienvenida.
  const [dataReady, setDataReady] = useState(false);
  useEffect(() => {
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
          </Stack.Protected>
        </Stack>
      )}
      <SplashOverlay ready={ready && dataReady} fontsReady={fontsReady} />
    </View>
  );
}
