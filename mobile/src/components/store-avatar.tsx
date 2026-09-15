// Ícono de la tienda sobre sus iniciales (si el ícono no carga, quedan las iniciales),
// logo horizontal y fila de tiendas superpuestas, como en la web.
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { T } from './text';

import { C } from '@/constants/theme';
import type { Store } from '@/lib/api';
import { initials, safeColor, tint } from '@/lib/format';
import { useStores } from '@/lib/stores';

export function StoreAvatar({ name, color, size = 22 }: { name?: string | null; color?: string | null; size?: number }) {
  const icon = useStores().byName.get(name ?? '')?.icon;
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>('loading');
  const c = safeColor(color);
  return (
    <View
      aria-hidden
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size > 30 ? 13 : size / 2,
          backgroundColor: tint(c),
          borderColor: state === 'loaded' ? C.border : 'transparent',
        },
      ]}>
      <T w={800} size={Math.round(size * (size > 30 ? 0.3 : 0.42))} color={c} style={{ letterSpacing: -0.3 }}>
        {initials(name)}
      </T>
      {icon && state !== 'failed' && (
        <Image
          source={{ uri: icon }}
          contentFit="contain"
          style={[StyleSheet.absoluteFill, styles.icon, { opacity: state === 'loaded' ? 1 : 0 }]}
          onLoad={() => setState('loaded')}
          onError={() => setState('failed')}
        />
      )}
    </View>
  );
}

// Logo horizontal de la tienda; sin logo (o si no carga), su ícono y su nombre.
export function StoreLogo({ store, small = false }: { store: Store; small?: boolean }) {
  const [failed, setFailed] = useState(false);
  const box = small ? styles.logoSm : styles.logoLg;
  if (!store.logo || failed) {
    return (
      <View style={[styles.logo, box, styles.logoText]}>
        <StoreAvatar name={store.name} color={store.color} />
        <T w={700} size={small ? 12 : 14} numberOfLines={1} style={{ flexShrink: 1 }}>
          {store.name}
        </T>
      </View>
    );
  }
  return (
    <View style={[styles.logo, box, { backgroundColor: store.logoBg ? safeColor(store.logoBg) : '#fff' }]}>
      <Image
        source={{ uri: store.logo }}
        contentFit="contain"
        style={styles.fill}
        accessibilityLabel={store.name}
        onError={() => setFailed(true)}
      />
    </View>
  );
}

// Tiendas que venden el producto, de la más barata a la más cara: «(●●●) 5 tiendas».
export function StoreStack({ ids, total }: { ids: string[]; total: number }) {
  const { byId } = useStores();
  const list = ids.map((id) => byId.get(id)).filter((s): s is Store => Boolean(s));
  return (
    <View style={styles.stackTag} accessibilityLabel={`${total} tiendas: ${list.map((s) => s.name).join(', ')}`}>
      <View style={styles.stack}>
        {list.map((s, i) => (
          <View key={s.id} style={[styles.ring, i > 0 && { marginLeft: -6 }]}>
            <StoreAvatar name={s.name} color={s.color} size={16} />
          </View>
        ))}
      </View>
      <T w={600} size={11} color={C.muted}>
        {total > 1 ? `${total} tiendas` : '1 tienda'}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1 },
  icon: { backgroundColor: '#fff' },
  logo: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: '#fff',
  },
  logoLg: { width: 168, height: 76, paddingVertical: 14, paddingHorizontal: 19, borderRadius: 18 },
  logoSm: { width: 112, height: 56, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 14 },
  logoText: { flexDirection: 'row', gap: 8 },
  fill: { width: '100%', height: '100%' },
  stackTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 2,
    paddingLeft: 3,
    paddingRight: 8,
    borderRadius: 999,
    backgroundColor: C.soft,
  },
  stack: { flexDirection: 'row' },
  ring: { padding: 1.5, borderRadius: 999, backgroundColor: C.soft },
});
