import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';

// La bienvenida («Get started») aparece solo la primera vez que se abre la app.
const KEY = 'mercapty:bienvenida';

type OnboardingApi = {
  seen: boolean | null; // null mientras se lee del teléfono
  finish(): void;
  reset(): void;
};

const OnboardingContext = createContext<OnboardingApi | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [seen, setSeen] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then(
      (value) => setSeen(value === '1'),
      () => setSeen(false),
    );
  }, []);

  const api: OnboardingApi = {
    seen,
    finish: () => {
      setSeen(true);
      AsyncStorage.setItem(KEY, '1').catch(() => {});
    },
    reset: () => {
      setSeen(false);
      AsyncStorage.removeItem(KEY).catch(() => {});
    },
  };
  return <OnboardingContext value={api}>{children}</OnboardingContext>;
}

export function useOnboarding() {
  const ctx = use(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding() va dentro de <OnboardingProvider>');
  return ctx;
}
