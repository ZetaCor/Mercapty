// Mi lista: compara «todo en una tienda» contra «repartir cada producto donde está más barato».
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, openLink } from '@/components/button';
import { Icon } from '@/components/icons';
import { openProduct } from '@/components/product-card';
import { ProductMedia } from '@/components/product-media';
import { LoadingPiggy } from '@/components/splash-overlay';
import { StoreAvatar } from '@/components/store-avatar';
import { T } from '@/components/text';
import { EmptyState, ErrorState, Note, Panel } from '@/components/ui';
import { C, PAD, R, shadow } from '@/constants/theme';
import { goUrl, postJson, type OptimizeResult } from '@/lib/api';
import { money } from '@/lib/format';
import { useList } from '@/lib/list';

function confirm(title: string, action: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(title)) onConfirm();
    return;
  }
  Alert.alert(title, undefined, [
    { text: 'Cancelar', style: 'cancel' },
    { text: action, style: 'destructive', onPress: onConfirm },
  ]);
}

export default function Lista() {
  const insets = useSafeAreaInsets();
  const { items, setQty, clear } = useList();
  const [result, setResult] = useState<OptimizeResult | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [retry, setRetry] = useState(0);
  const [showAll, setShowAll] = useState(false);

  // Cada cambio de cantidad vuelve a calcular (con una pausa corta si se tocan varios botones).
  const key = items.map((i) => `${i.productId}x${i.qty}`).join(',');
  useEffect(() => {
    if (!items.length) return;
    let alive = true;
    const timer = setTimeout(() => {
      postJson<OptimizeResult>('/api/list/optimize', { items: items.map(({ productId, qty }) => ({ productId, qty })) }).then(
        (r) => {
          if (!alive) return;
          setResult(r);
          setError(null);
        },
        (err: Error) => alive && setError(err),
      );
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [key, retry]);

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View>
          <T w={800} size={26} tight accessibilityRole="header">Mi lista</T>
          {items.length > 0 && <T size={13.5} color={C.muted}>{items.length} producto{items.length === 1 ? '' : 's'}</T>}
        </View>
        {items.length > 0 && (
          <Button title="Vaciar lista" size="sm" onPress={() => confirm('¿Vaciar tu lista?', 'Vaciar', clear)} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {!items.length ? (
          <EmptyState
            emoji="🛒"
            title="Tu lista está vacía"
            text="Agrega productos con el botón + y te decimos dónde te sale más barato comprarlos."
            action="Ver productos"
            onAction={() => router.navigate('/buscar')}
          />
        ) : (
          <>
            <Panel style={{ paddingVertical: 6 }}>
              {items.map((item, i) => {
                const thumb = result?.thumbs[item.productId];
                return (
                  <View key={item.productId} style={[styles.item, i > 0 && styles.itemBorder]}>
                    <ProductMedia image={thumb?.image ?? null} category={thumb?.category} emojiSize={24} inset={6} style={styles.thumb} />
                    <Pressable onPress={() => openProduct(item.productId)} style={{ flex: 1 }} accessibilityRole="link">
                      <T w={500} size={14.5} numberOfLines={3} style={{ lineHeight: 19 }}>{item.label}</T>
                    </Pressable>
                    <View style={styles.qty}>
                      <Pressable onPress={() => setQty(item.productId, item.qty - 1)} style={styles.qtyButton} accessibilityLabel="Quitar uno">
                        <Icon name={item.qty === 1 ? 'trash' : 'minus'} size={16} color={item.qty === 1 ? C.promo : C.text} />
                      </Pressable>
                      <T w={700} size={14.5} style={styles.qtyValue}>{item.qty}</T>
                      <Pressable onPress={() => setQty(item.productId, item.qty + 1)} style={styles.qtyButton} accessibilityLabel="Agregar uno">
                        <Icon name="plus" size={16} color={C.text} />
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </Panel>

            {error && !result ? (
              <ErrorState message={error.message} onRetry={() => setRetry((n) => n + 1)} />
            ) : !result ? (
              <LoadingPiggy text="Comparando tu lista en cada tienda…" />
            ) : (
              <Plans result={result} showAll={showAll} onToggleAll={() => setShowAll((v) => !v)} />
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Plans({ result, showAll, onToggleAll }: { result: OptimizeResult; showAll: boolean; onToggleAll: () => void }) {
  const { split, bestSingle, savings, perStore, considered, unavailable } = result;
  return (
    <View style={{ gap: 14, marginTop: 20 }}>
      {split.stores.length > 0 && (
        <View style={[styles.plan, styles.planBest]}>
          <T w={700} size={12} color={C.good} style={{ letterSpacing: 0.7 }}>LO MÁS BARATO</T>
          <View style={styles.planHead}>
            <T w={700} size={17} style={{ flexShrink: 1 }}>
              {split.stores.length === 1 ? `Todo en ${split.stores[0].storeName}` : `Repartir en ${split.stores.length} tiendas`}
            </T>
            <T w={800} size={20} tight>{money(split.total)}</T>
          </View>
          {savings != null && savings > 0 && bestSingle && (
            <Note>Ahorras <T w={700} size={14} color={C.good}>{money(savings)}</T> frente a comprar todo en {bestSingle.storeName}.</Note>
          )}
          {split.stores.map((group) => (
            <View key={group.storeId} style={styles.planStore}>
              <View style={styles.planHead}>
                <View style={styles.cellStore}>
                  <StoreAvatar name={group.storeName} color={group.storeColor} />
                  <T w={700}>{group.storeName}</T>
                </View>
                <T w={700}>{money(group.subtotal)}</T>
              </View>
              {group.lines.map((line) => (
                <View key={line.productId} style={styles.planLine}>
                  <T size={13.5} color={C.text2} style={{ flex: 1 }}>{line.qty} × {line.label}</T>
                  <Pressable onPress={() => openLink(goUrl(line.offerId))} hitSlop={8} accessibilityRole="link">
                    <T w={600} size={13.5} color={C.brand}>{money(line.subtotal)} ↗</T>
                  </Pressable>
                </View>
              ))}
            </View>
          ))}
        </View>
      )}

      {bestSingle && split.stores.length > 1 && (
        <View style={styles.plan}>
          <View style={styles.planHead}>
            <T w={700} size={17}>Todo en una sola tienda</T>
            <T w={800} size={20} tight>{money(bestSingle.total)}</T>
          </View>
          <View style={[styles.cellStore, { marginTop: 10 }]}>
            <StoreAvatar name={bestSingle.storeName} color={bestSingle.storeColor} />
            <T w={700}>{bestSingle.storeName}</T>
          </View>
          <T size={14} color={C.muted} style={{ marginTop: 8 }}>
            {bestSingle.complete
              ? 'Tiene todos tus productos: pagas un poco más, pero con un solo envío.'
              : `Le faltan: ${bestSingle.missing.join(', ')}.`}
          </T>
        </View>
      )}

      {perStore.length > 0 && (
        <View style={styles.plan}>
          <Pressable onPress={onToggleAll} style={styles.planHead} accessibilityRole="button" accessibilityState={{ expanded: showAll }}>
            <T w={600}>Comparar todas las tiendas</T>
            <Icon name={showAll ? 'down' : 'next'} size={18} color={C.muted} />
          </Pressable>
          {showAll && (
            <View style={{ marginTop: 10 }}>
              <View style={styles.rankRow}>
                <T w={600} size={11.5} color={C.muted} style={{ flex: 1 }}>TIENDA</T>
                <T w={600} size={11.5} color={C.muted} style={styles.rankCell}>TIENE</T>
                <T w={600} size={11.5} color={C.muted} style={styles.rankTotal}>TOTAL</T>
              </View>
              {perStore.map((s) => (
                <View key={s.storeId} style={styles.rankRow}>
                  <View style={[styles.cellStore, { flex: 1 }]}>
                    <StoreAvatar name={s.storeName} color={s.storeColor} />
                    <T size={14} numberOfLines={1} style={{ flexShrink: 1 }}>{s.storeName}</T>
                  </View>
                  <T size={14} style={styles.rankCell}>{considered - s.missing.length}/{considered}</T>
                  <T size={14} style={styles.rankTotal}>{money(s.total)}</T>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {unavailable.length > 0 && <T size={14} color={C.muted}>Agotado en todas las tiendas: {unavailable.join(', ')}.</T>}
      <T size={12.5} color={C.muted}>Los totales no incluyen envío: cada tienda tiene su propia tarifa y monto mínimo.</T>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: PAD,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  content: { padding: PAD, paddingBottom: 40 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  itemBorder: { borderTopWidth: 1, borderTopColor: C.border },
  thumb: { width: 52, height: 52, borderRadius: 12 },
  qty: { flexDirection: 'row', alignItems: 'center', gap: 2, padding: 3, borderRadius: 999, backgroundColor: C.soft },
  qtyButton: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)' },
  qtyValue: { minWidth: 24, textAlign: 'center' },
  plan: { padding: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: C.border, borderRadius: R.lg },
  planBest: { borderWidth: 2, borderColor: C.good, boxShadow: shadow },
  planHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  planStore: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.border, gap: 6 },
  planLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cellStore: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: C.border },
  rankCell: { width: 48, textAlign: 'center' },
  rankTotal: { width: 72, textAlign: 'right' },
});
