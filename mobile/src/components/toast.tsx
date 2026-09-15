// Aviso corto al pie de la pantalla («Agregado a tu lista»), como el toast de la web.
import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { T } from './text';

import { C, shadow } from '@/constants/theme';

const ToastContext = createContext<(text: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <ToastContext value={(text: string) => setToast({ id: Date.now(), text })}>
      {children}
      <View style={[styles.wrap, { bottom: insets.bottom + 92 }]}>
        {toast && (
          <Animated.View key={toast.id} entering={FadeInDown.duration(220)} exiting={FadeOut.duration(200)} style={styles.toast}>
            <T w={500} color="#fff" accessibilityLiveRegion="polite">
              {toast.text}
            </T>
          </Animated.View>
        )}
      </View>
    </ToastContext>
  );
}

export const useToast = () => use(ToastContext);

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center', zIndex: 900, pointerEvents: 'none' },
  toast: {
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: C.text,
    boxShadow: shadow,
  },
});
