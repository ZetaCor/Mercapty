// Ficha de producto: mejor precio, precio en cada tienda, parecidos e historial (como la web).
import { Stack, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { Button, openLink } from '@/components/button';
import { Icon } from '@/components/icons';
import { ProductRail, useAddToList } from '@/components/product-card';
import { ProductMedia } from '@/components/product-media';
import { LoadingPiggy } from '@/components/splash-overlay';
import { StoreAvatar } from '@/components/store-avatar';
import { T } from '@/components/text';
import { ErrorState, Note, Panel, SectionHead, Tag } from '@/components/ui';
import { C, PAD, R, shadow } from '@/constants/theme';
import { goUrl, WEB_URL, type Offer, type Product } from '@/lib/api';
import { displayGtin, formatDay, money, timeAgo, titleCase, unitPriceText } from '@/lib/format';
import { useFetch } from '@/lib/use-fetch';

export default function Producto() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { data: product, error, refresh } = useFetch<Product>(`/api/products/${id}`);
  const addToList = useAddToList();

  const best = product?.offers.find((o) => o.isBest);
  const share = () => {
    if (!product) return;
    const price = best ? `: desde ${money(best.price)} en ${best.storeName}` : '';
    Share.share({ message: `${product.name}${price}\n${WEB_URL}${product.path}` }).catch(() => {});
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () =>
            product ? (
              <Pressable onPress={share} hitSlop={10} accessibilityRole="button" accessibilityLabel="Compartir producto">
                <Icon name="share" size={22} color={C.text} />
              </Pressable>
            ) : null,
        }}
      />
      {error && !product ? (
        <ErrorState message={error.message} onRetry={refresh} />
      ) : !product ? (
        <LoadingPiggy />
      ) : (
        <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
          <View style={styles.top}>
            <ProductMedia image={product.image} category={product.category} name={product.name} emojiSize={96} inset="10%" style={styles.media} />
            {product.brand ? <T w={600} size={14} color={C.brand}>{product.brand}</T> : null}
            <T w={800} size={24} tight accessibilityRole="header">{product.name}</T>
            <T size={13.5} color={C.muted}>
              {[product.size, product.category, product.gtin ? `Código ${displayGtin(product.gtin)}` : ''].filter(Boolean).join(' · ')}
            </T>

            {best ? (
              <View style={styles.bestBox}>
                <T w={700} size={12} color={C.good} style={styles.label}>MEJOR PRECIO</T>
                <T w={800} size={40} tight>{money(best.price)}</T>
                <View style={styles.bestStore}>
                  <StoreAvatar name={best.storeName} color={best.storeColor} />
                  <T color={C.text2}>en <T w={700} color={C.text2}>{best.storeName}</T></T>
                </View>
                <View style={styles.bestActions}>
                  <Button
                    title={`Comprar en ${best.storeName}`}
                    iconRight="external"
                    variant="primary"
                    size="lg"
                    lines={2}
                    style={{ flex: 1 }}
                    onPress={() => openLink(goUrl(best.id))}
                  />
                  <Button icon="plus" size="lg" accessibilityLabel="Agregar a mi lista" onPress={() => addToList(product)} />
                </View>
                {product.savings > 0 && (
                  <Note>Te ahorras hasta <T w={700} size={14} color={C.good}>{money(product.savings)}</T> frente a la tienda más cara.</Note>
                )}
              </View>
            ) : (
              <Panel style={{ marginTop: 16 }}>
                <T w={700}>Por ahora ninguna tienda lo tiene disponible.</T>
              </Panel>
            )}
          </View>

          <View style={styles.section}>
            <SectionHead title={`Compara en ${product.offers.filter((o) => o.inStock).length} tienda${product.offers.filter((o) => o.inStock).length === 1 ? '' : 's'}`} />
            <View style={styles.offers}>
              {product.offers.map((offer, i) => (
                <OfferRow key={offer.id} offer={offer} first={i === 0} />
              ))}
            </View>
          </View>

          {product.similar.sameBrand.length + product.similar.others.length > 0 && (
            <View style={styles.section}>
              <SectionHead title="Productos parecidos" />
              {product.similar.sameBrand.length > 0 && (
                <>
                  <T w={700} size={15.5} color={C.text2} style={styles.subhead}>Más de {titleCase(product.similar.brand ?? '')}</T>
                  <ProductRail items={product.similar.sameBrand} />
                </>
              )}
              {product.similar.others.length > 0 && (
                <>
                  {product.similar.sameBrand.length > 0 && (
                    <T w={700} size={15.5} color={C.text2} style={[styles.subhead, { marginTop: 20 }]}>Otras marcas</T>
                  )}
                  <ProductRail items={product.similar.others} />
                </>
              )}
            </View>
          )}

          <PriceHistory history={product.history} currentBest={product.bestPrice} />
        </ScrollView>
      )}
    </>
  );
}

function OfferRow({ offer, first }: { offer: Offer; first: boolean }) {
  const content = (
    <>
      <StoreAvatar name={offer.storeName} color={offer.storeColor} size={42} />
      <View style={{ flex: 1, gap: 3 }}>
        <View style={styles.offerName}>
          <T w={600}>{offer.storeName}</T>
          {offer.isBest && <Tag tone="good">Mejor precio</Tag>}
          {offer.listPrice && offer.inStock ? <Tag tone="promo">Oferta</Tag> : null}
          {offer.storeSource === 'demo' && <Tag tone="demo">demo</Tag>}
        </View>
        <T size={12.5} color={C.muted}>
          {offer.inStock ? 'Disponible' : 'Agotado'} · actualizado {timeAgo(offer.updatedAt)}
        </T>
      </View>
      <View style={styles.offerPrice}>
        <View style={styles.priceRow}>
          {offer.listPrice ? <T size={12.5} color={C.muted} style={{ textDecorationLine: 'line-through' }}>{money(offer.listPrice)}</T> : null}
          <T w={800} size={17} tight>{money(offer.price)}</T>
        </View>
        <T size={12} color={C.muted}>
          {[unitPriceText(offer.unitPrice), offer.diff && offer.diff > 0 ? `+${money(offer.diff)}` : ''].filter(Boolean).join(' · ')}
        </T>
        {offer.inStock && <T w={600} size={13} color={C.brand}>Comprar ↗</T>}
      </View>
    </>
  );
  const rowStyle = [styles.offer, !first && styles.offerBorder, offer.isBest && styles.offerBest];
  if (!offer.inStock) return <View style={[rowStyle, { opacity: 0.55 }]}>{content}</View>;
  return (
    <Pressable
      onPress={() => openLink(goUrl(offer.id))}
      style={({ pressed }) => [rowStyle, pressed && { backgroundColor: C.soft }]}
      accessibilityRole="link"
      accessibilityLabel={`Comprar en ${offer.storeName} a ${money(offer.price)}`}>
      {content}
    </Pressable>
  );
}

function PriceHistory({ history, currentBest }: { history: Product['history']; currentBest: number | null }) {
  if (history.length < 2) return null;
  const prices = history.map((h) => h.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  const w = 100;
  const h = 40;
  const line = history
    .map((p, i) => `${i ? 'L' : 'M'}${((i / (history.length - 1)) * w).toFixed(2)},${(h - 4 - ((p.price - min) / span) * (h - 8)).toFixed(2)}`)
    .join(' ');
  let verdict = '';
  if (currentBest != null && currentBest <= min) verdict = 'Hoy está en su precio más bajo registrado: buen momento para comprar.';
  else if (currentBest != null && currentBest >= max) verdict = 'Hoy está en su precio más alto registrado.';

  return (
    <Panel style={[styles.history, { marginHorizontal: PAD }]}>
      <View style={styles.historyHead}>
        <T w={700} size={17} tight>Historial del mejor precio</T>
        <T size={13} color={C.muted}>{money(min)} – {money(max)}</T>
      </View>
      {verdict ? <Note>{verdict}</Note> : null}
      <Svg width="100%" height={140} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ marginTop: 12 }}
        accessibilityLabel={`Mejor precio entre ${money(min)} y ${money(max)}`}>
        <Path d={`${line} L${w},${h} L0,${h} Z`} fill={C.brand} opacity={0.07} />
        <Path d={line} fill="none" stroke={C.brand} strokeWidth={2.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </Svg>
      <View style={styles.historyHead}>
        <T size={12} color={C.muted}>{formatDay(history[0].day)}</T>
        <T size={12} color={C.muted}>{formatDay(history[history.length - 1].day)}</T>
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  top: { gap: 6, paddingHorizontal: PAD, paddingTop: 4 },
  media: { height: 280, marginBottom: 12, borderRadius: R.xl, borderWidth: 1, borderColor: C.border },
  bestBox: {
    marginTop: 16,
    padding: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.lg,
    boxShadow: shadow,
  },
  label: { letterSpacing: 0.7 },
  bestStore: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 16 },
  bestActions: { flexDirection: 'row', gap: 8 },
  section: { marginTop: 32 },
  subhead: { paddingHorizontal: PAD, marginBottom: 10 },
  offers: { marginHorizontal: PAD, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, overflow: 'hidden', backgroundColor: '#fff' },
  offer: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14 },
  offerBorder: { borderTopWidth: 1, borderTopColor: C.border },
  offerBest: { experimental_backgroundImage: 'linear-gradient(90deg, #ecfdf5, #ffffff 75%)' },
  offerName: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  offerPrice: { alignItems: 'flex-end', gap: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  history: { marginTop: 32 },
  historyHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
});
