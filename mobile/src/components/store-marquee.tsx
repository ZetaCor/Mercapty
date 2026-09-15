// Franja de logos de los supermercados que se comparan hoy. Se desliza sola de derecha
// a izquierda y queda quieta (con desplazamiento a mano) si el teléfono pide reducir el movimiento.
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { StoreLogo } from './store-avatar';

import { PAD } from '@/constants/theme';
import type { Store } from '@/lib/api';

const MIN_ITEMS = 6; // logos suficientes para cubrir la pantalla sin huecos

export function StoreMarquee({ stores }: { stores: Store[] }) {
  const still = useReducedMotion();
  const [groupWidth, setGroupWidth] = useState(0);
  if (!stores.length) return null;

  const items = Array.from({ length: Math.ceil(MIN_ITEMS / stores.length) }, () => stores).flat();
  const logos = (copy: boolean) =>
    items.map((s, i) => (
      <Pressable
        key={`${s.id}-${i}`}
        onPress={() => router.navigate('/tiendas')}
        accessible={!copy && i < stores.length}
        accessibilityRole="link"
        accessibilityLabel={s.name}>
        <StoreLogo store={s} />
      </Pressable>
    ));

  if (still) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.static}>
        {logos(false).slice(0, stores.length)}
      </ScrollView>
    );
  }

  // Dos copias iguales: la animación corre una copia completa y vuelve a empezar sin salto.
  return (
    <View style={styles.clip}>
      <Animated.View
        style={[
          styles.track,
          groupWidth > 0 && {
            animationName: { from: { transform: [{ translateX: 0 }] }, to: { transform: [{ translateX: -groupWidth }] } },
            animationDuration: items.length * 4000,
            animationTimingFunction: 'linear',
            animationIterationCount: 'infinite',
          },
        ]}>
        <View style={styles.group} onLayout={(e) => setGroupWidth(e.nativeEvent.layout.width)}>
          {logos(false)}
        </View>
        <View style={styles.group} aria-hidden>
          {logos(true)}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  track: { flexDirection: 'row' },
  group: { flexDirection: 'row', gap: 12, paddingRight: 12, paddingVertical: 4 },
  static: { gap: 12, paddingHorizontal: PAD, paddingVertical: 4 },
});
