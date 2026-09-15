// Tarjeta de producto de la web: foto, «Oferta», botón +, mejor precio, tienda y ahorro.
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Icon } from './icons';
import { ProductMedia } from './product-media';
import { StoreAvatar, StoreStack } from './store-avatar';
import { T } from './text';
import { useToast } from './toast';

import { C, PAD, R } from '@/constants/theme';
import type { ProductSummary, Store } from '@/lib/api';
import { money, productLabel } from '@/lib/format';
import { useList } from '@/lib/list';
import { useStores } from '@/lib/stores';

const GAP = 12;

export function useAddToList() {
  const { add } = useList();
  const toast = useToast();
  return (item: { id: number; name: string; brand?: string | null; size?: string | null }) => {
    add({ productId: item.id, label: productLabel(item) });
    toast('Agregado a tu lista');
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };
}

export const openProduct = (id: number) => router.push({ pathname: '/producto/[id]', params: { id: String(id) } });

export function ProductCard({ item, width }: { item: ProductSummary; width: number }) {
  const store = useStores().byId.get(item.bestStoreId);
  const addToList = useAddToList();
  // El botón + va al lado de la tarjeta, no dentro (en la web un botón no puede ir dentro de otro).
  return (
    <View style={[styles.card, { width }]}>
      <Pressable
        onPress={() => openProduct(item.id)}
        style={({ pressed }) => [{ flex: 1 }, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, ${money(item.bestPrice)} en ${store?.name ?? item.bestStoreId}`}>
        <View>
          <ProductMedia image={item.image} category={item.category} name={item.name} style={styles.media} />
          {item.bestListPrice ? (
            <View style={styles.badge}>
              <T w={700} size={11} color="#fff">Oferta</T>
            </View>
          ) : null}
        </View>
        <Body item={item} store={store} />
      </Pressable>
      <Pressable
        onPress={() => addToList(item)}
        hitSlop={6}
        // abajo a la derecha de la foto (cuadrada, del ancho de la tarjeta sin sus bordes)
        style={({ pressed }) => [styles.fab, { top: width - 2 - 48 }, pressed && { backgroundColor: C.brand }]}
        accessibilityRole="button"
        accessibilityLabel={`Agregar ${item.name} a mi lista`}>
        {({ pressed }) => <Icon name="plus" size={20} color={pressed ? '#fff' : C.brand} />}
      </Pressable>
    </View>
  );
}

function Body({ item, store }: { item: ProductSummary; store?: Store }) {
  return (
    <View style={styles.body}>
      <View style={styles.priceRow}>
        <T w={800} size={20} tight>{money(item.bestPrice)}</T>
        {item.bestListPrice ? (
          <T size={13} color={C.muted} style={styles.old}>{money(item.bestListPrice)}</T>
        ) : null}
      </View>
      <T w={600} numberOfLines={2} style={{ lineHeight: 19 }}>{item.name}</T>
      <T size={12.5} color={C.muted} numberOfLines={1}>
        {[item.brand, item.size].filter(Boolean).join(' · ') || ' '}
      </T>
      <View style={styles.bestAt}>
        <StoreAvatar name={store?.name} color={store?.color} />
        <T size={12.5} color={C.text2} numberOfLines={1} style={{ flexShrink: 1 }}>
          en <T size={12.5} w={700} color={C.text2}>{store?.name ?? item.bestStoreId}</T>
        </T>
      </View>
      <View style={styles.tags}>
        {item.savings > 0 ? (
          <View style={[styles.tag, { backgroundColor: C.goodSoft }]}>
            <T w={600} size={11} color={C.good}>Ahorra {money(item.savings)}</T>
          </View>
        ) : null}
        <StoreStack ids={item.storeIds ?? [item.bestStoreId]} total={item.storeCount} />
      </View>
    </View>
  );
}

// Dos columnas, como la web en el celular.
export function useGridCardWidth() {
  const { width } = useWindowDimensions();
  return Math.floor((Math.min(width, 720) - PAD * 2 - GAP) / 2);
}

export function ProductGrid({ items }: { items: ProductSummary[] }) {
  const cardWidth = useGridCardWidth();
  return (
    <View style={styles.grid}>
      {items.map((item) => (
        <ProductCard key={item.id} item={item} width={cardWidth} />
      ))}
    </View>
  );
}

// Fila que se desliza de lado (productos parecidos).
export function ProductRail({ items }: { items: ProductSummary[] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
      {items.map((item) => (
        <ProductCard key={item.id} item={item} width={164} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.lg,
  },
  pressed: { opacity: 0.8 },
  media: { aspectRatio: 1 },
  badge: {
    position: 'absolute',
    top: 10,
    left: 10,
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: 999,
    backgroundColor: C.promo,
  },
  fab: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    boxShadow: '0 2px 10px rgba(15, 23, 42, 0.16)',
  },
  body: { flex: 1, gap: 2, paddingTop: 12, paddingHorizontal: 13, paddingBottom: 14 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 6 },
  old: { textDecorationLine: 'line-through' },
  bestAt: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 },
  tag: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999, backgroundColor: C.soft },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, paddingHorizontal: PAD },
  rail: { gap: GAP, paddingHorizontal: PAD },
});
