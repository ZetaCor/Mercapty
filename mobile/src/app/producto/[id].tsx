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
import { hlParts, useI18n } from '@/lib/i18n';
import { useFetch } from '@/lib/use-fetch';

export default function Producto() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { t, category } = useI18n();
  const { data: product, error, refresh } = useFetch<Product>(`/api/products/${id}`);
  const addToList = useAddToList();

  const best = product?.offers.find((o) => o.isBest);
  const available = product ? product.offers.filter((o) => o.inStock).length : 0;
  const share = () => {
    if (!product) return;
    const title = best ? t('{name}: desde {price} en {store}', { name: product.name, price: money(best.price), store: best.storeName }) : product.name;
    Share.share({ message: `${title}\n${WEB_URL}${product.path}` }).catch(() => {});
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () =>
            product ? (
              <Pressable onPress={share} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('Compartir producto')}>
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
              {[product.size, category(product.category), product.gtin ? t('Código {code}', { code: displayGtin(product.gtin) }) : ''].filter(Boolean).join(' · ')}
            </T>

            {best ? (
              <View style={styles.bestBox}>
                <T w={700} size={12} color={C.good} style={styles.label}>{t('MEJOR PRECIO')}</T>
                <T w={800} size={40} tight>{money(best.price)}</T>
                <View style={styles.bestStore}>
                  <StoreAvatar name={best.storeName} color={best.storeColor} />
                  <T color={C.text2}>{t('en')} <T w={700} color={C.text2}>{best.storeName}</T></T>
                </View>
                <View style={styles.bestActions}>
                  <Button
                    title={t('Comprar en {store}', { store: best.storeName })}
                    iconRight="external"
                    variant="primary"
                    size="lg"
                    lines={2}
                    style={{ flex: 1 }}
                    onPress={() => openLink(goUrl(best.id))}
                  />
                  <Button icon="plus" size="lg" accessibilityLabel={t('Agregar a mi lista')} onPress={() => addToList(product)} />
                </View>
                {product.savings > 0 && (
                  <Note>
                    {hlParts(t('Te ahorras hasta [{amount}] frente a la tienda más cara.', { amount: money(product.savings) })).map((part, i) => (
                      <T key={i} w={part.hl ? 700 : 400} size={14} color={C.good}>{part.text}</T>
                    ))}
                  </Note>
                )}
              </View>
            ) : (
              <Panel style={{ marginTop: 16 }}>
                <T w={700}>{t('Por ahora ninguna tienda lo tiene disponible.')}</T>
              </Panel>
            )}
          </View>

          <View style={styles.section}>
            <SectionHead title={available === 1 ? t('Compara en 1 tienda') : t('Compara en {n} tiendas', { n: available })} />
            <View style={styles.offers}>
              {product.offers.map((offer, i) => (
                <OfferRow key={offer.id} offer={offer} first={i === 0} />
              ))}
            </View>
          </View>

          {product.similar.sameBrand.length + product.similar.others.length > 0 && (
            <View style={styles.section}>
              <SectionHead title={t('Productos parecidos')} />
              {product.similar.sameBrand.length > 0 && (
                <>
                  <T w={700} size={15.5} color={C.text2} style={styles.subhead}>
                    {t('Más de {brand}', { brand: titleCase(product.similar.brand ?? '') })}
                  </T>
                  <ProductRail items={product.similar.sameBrand} />
                </>
              )}
              {product.similar.others.length > 0 && (
                <>
                  {product.similar.sameBrand.length > 0 && (
                    <T w={700} size={15.5} color={C.text2} style={[styles.subhead, { marginTop: 20 }]}>{t('Otras marcas')}</T>
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
  const { t } = useI18n();
  const content = (
    <>
      <StoreAvatar name={offer.storeName} color={offer.storeColor} size={42} />
      <View style={{ flex: 1, gap: 3 }}>
        <View style={styles.offerName}>
          <T w={600}>{offer.storeName}</T>
          {offer.isBest && <Tag tone="good">{t('Mejor precio')}</Tag>}
          {offer.listPrice && offer.inStock ? <Tag tone="promo">{t('Oferta')}</Tag> : null}
          {offer.storeSource === 'demo' && <Tag tone="demo">demo</Tag>}
        </View>
        <T size={12.5} color={C.muted}>
          {offer.inStock ? t('Disponible') : t('Agotado')} · {t('actualizado {ago}', { ago: timeAgo(offer.updatedAt, t) })}
        </T>
      </View>
      <View style={styles.offerPrice}>
        <View style={styles.priceRow}>
          {offer.listPrice ? <T size={12.5} color={C.muted} style={{ textDecorationLine: 'line-through' }}>{money(offer.listPrice)}</T> : null}
          <T w={800} size={17} tight>{money(offer.price)}</T>
        </View>
        <T size={12} color={C.muted}>
          {[unitPriceText(offer.unitPrice, t), offer.diff && offer.diff > 0 ? `+${money(offer.diff)}` : ''].filter(Boolean).join(' · ')}
        </T>
        {offer.inStock && <T w={600} size={13} color={C.brand}>{t('Comprar ↗')}</T>}
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
      accessibilityLabel={t('Comprar en {store} a {price}', { store: offer.storeName, price: money(offer.price) })}>
      {content}
    </Pressable>
  );
}

function PriceHistory({ history, currentBest }: { history: Product['history']; currentBest: number | null }) {
  const { t, locale } = useI18n();
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
  if (currentBest != null && currentBest <= min) verdict = t('Hoy está en su precio más bajo registrado: buen momento para comprar.');
  else if (currentBest != null && currentBest >= max) verdict = t('Hoy está en su precio más alto registrado.');

  return (
    <Panel style={[styles.history, { marginHorizontal: PAD }]}>
      <View style={styles.historyHead}>
        <T w={700} size={17} tight>{t('Historial del mejor precio')}</T>
        <T size={13} color={C.muted}>{money(min)} – {money(max)}</T>
      </View>
      {verdict ? <Note>{verdict}</Note> : null}
      <Svg width="100%" height={140} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ marginTop: 12 }}
        accessibilityLabel={t('Mejor precio entre {min} y {max}', { min: money(min), max: money(max) })}>
        <Path d={`${line} L${w},${h} L0,${h} Z`} fill={C.brand} opacity={0.07} />
        <Path d={line} fill="none" stroke={C.brand} strokeWidth={2.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </Svg>
      <View style={styles.historyHead}>
        <T size={12} color={C.muted}>{formatDay(history[0].day, locale)}</T>
        <T size={12} color={C.muted}>{formatDay(history[history.length - 1].day, locale)}</T>
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
