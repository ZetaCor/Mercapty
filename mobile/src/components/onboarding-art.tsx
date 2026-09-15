// Ilustraciones animadas de la bienvenida, con las mismas piezas de la portada de la web:
// precios flotando, la canasta y el cerdito alcancía. Quedan quietas si el teléfono
// pide reducir el movimiento.
import { StyleSheet, View } from 'react-native';
import Animated, { useReducedMotion, type CSSAnimationKeyframes } from 'react-native-reanimated';
import Svg from 'react-native-svg';

import { BillShape, PigShape } from './logo';
import { ProductMedia } from './product-media';
import { StoreAvatar } from './store-avatar';
import { T } from './text';

import { C, shadow } from '@/constants/theme';
import type { ProductSummary, Store } from '@/lib/api';
import { money } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

const float = (dy: number): CSSAnimationKeyframes => ({
  from: { transform: [{ translateY: 0 }] },
  '50%': { transform: [{ translateY: dy }] },
  to: { transform: [{ translateY: 0 }] },
});

function useLoop() {
  const still = useReducedMotion();
  return (name: CSSAnimationKeyframes, duration: number, delay = 0) =>
    still
      ? null
      : {
          animationName: name,
          animationDuration: duration,
          animationDelay: delay,
          animationIterationCount: 'infinite' as const,
          animationTimingFunction: 'ease-in-out' as const,
          animationFillMode: 'backwards' as const,
        };
}

// 1 · Comparar: tres productos con su mejor precio, flotando (como .price-stack de la web).
const EXAMPLES = [
  { name: 'Leche entera', category: 'Lácteos y huevos', note: 'Más barato hoy' },
  { name: 'Arroz 5 lb', category: 'Despensa', note: 'Bajó de precio' },
  { name: 'Huevos', category: 'Lácteos y huevos', note: 'Mejor precio' },
];
const CHIP_TOPS = [0, 105, 210];
const CHIP_DELAYS = [0, 4000, 2000]; // en la web: 0, -2 s y -4 s de un ciclo de 6 s

export function CompareArt({ deals, stores }: { deals?: ProductSummary[]; stores: Map<string, Store> }) {
  const loop = useLoop();
  const { t } = useI18n();
  const real = (deals ?? []).filter((d) => d.image).slice(0, 3);
  return (
    <View style={{ width: 330, height: 290 }}>
      {[0, 1, 2].map((i) => {
        const deal = real.length === 3 ? real[i] : null;
        const example = EXAMPLES[i];
        const store = deal ? stores.get(deal.bestStoreId) : null;
        return (
          <Animated.View
            key={i}
            style={[
              styles.chip,
              { top: CHIP_TOPS[i] },
              i === 1 ? { right: 0 } : { left: i === 2 ? 20 : 0 },
              loop(float(-8), 6000, CHIP_DELAYS[i]),
            ]}>
            <ProductMedia
              image={deal?.image ?? null}
              category={deal?.category ?? example.category}
              emojiSize={28}
              inset={6}
              style={styles.chipImg}
            />
            <View style={{ flex: 1, gap: 4 }}>
              <T w={600} size={13} numberOfLines={2} style={{ lineHeight: 17 }}>
                {deal?.name ?? t(example.name)}
              </T>
              {deal ? (
                <View style={styles.row}>
                  <T w={800} size={17} tight>{money(deal.bestPrice)}</T>
                  <StoreAvatar name={store?.name} color={store?.color} size={20} />
                  <T size={12} color={C.muted} numberOfLines={1} style={{ flexShrink: 1 }}>{store?.name}</T>
                </View>
              ) : (
                <View style={styles.goodTag}>
                  <T w={600} size={11.5} color={C.good}>{t(example.note)}</T>
                </View>
              )}
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
}

// 2 · Tu canasta: los productos se van marcando uno por uno (como .basket de la web).
const BASKET = [
  ['🍚', 'Arroz'],
  ['🍗', 'Pollo'],
  ['🥚', 'Huevos'],
  ['🥛', 'Leche'],
];
const tick: CSSAnimationKeyframes = {
  from: { transform: [{ scale: 0.4 }], opacity: 0 },
  '8%': { transform: [{ scale: 1.2 }], opacity: 1 },
  '14%': { transform: [{ scale: 1 }], opacity: 1 },
  '82%': { transform: [{ scale: 1 }], opacity: 1 },
  '92%': { transform: [{ scale: 0.4 }], opacity: 0 },
  to: { transform: [{ scale: 0.4 }], opacity: 0 },
};

export function BasketArt() {
  const loop = useLoop();
  const still = useReducedMotion();
  const { t } = useI18n();
  return (
    <Animated.View style={[styles.basket, loop(float(-6), 4000)]}>
      <T w={700} size={16} style={{ marginBottom: 6 }}>{t('Tu canasta')}</T>
      {BASKET.map(([emoji, name], i) => (
        <View key={name} style={styles.basketRow}>
          <View style={styles.basketEmoji}>
            <T size={18} style={{ lineHeight: 24 }}>{emoji}</T>
          </View>
          <T w={500} style={{ flex: 1 }}>{t(name)}</T>
          <Animated.View style={[styles.check, still ? null : { ...loop(tick, 3200, 300 + i * 320) }]}>
            <T w={800} size={12} color={C.good}>✓</T>
          </Animated.View>
        </View>
      ))}
      <View style={styles.basketTotal}>
        <T w={600} size={14} color="#fff" style={{ textAlign: 'center' }}>{t('Te decimos dónde te cuesta menos')}</T>
      </View>
    </Animated.View>
  );
}

// 3 · Ahorra: el billete cae en la ranura del cerdito alcancía, que brinca de gusto;
// alrededor flotan los íconos de los súper que se comparan hoy.
const PIG = 190;
const u = PIG / 64; // una unidad del logo en puntos
const drop: CSSAnimationKeyframes = {
  from: { transform: [{ translateY: -20 * u }], opacity: 0 },
  '18%': { transform: [{ translateY: -20 * u }], opacity: 1 },
  '52%': { transform: [{ translateY: 16 * u }], opacity: 1, animationTimingFunction: 'ease-in' },
  '53%': { transform: [{ translateY: 16 * u }], opacity: 0 },
  to: { transform: [{ translateY: 16 * u }], opacity: 0 },
};
const jiggle: CSSAnimationKeyframes = {
  from: { transform: [{ scaleX: 1 }, { scaleY: 1 }] },
  '52%': { transform: [{ scaleX: 1 }, { scaleY: 1 }] },
  '60%': { transform: [{ scaleX: 1.06 }, { scaleY: 0.93 }] },
  '68%': { transform: [{ scaleX: 0.98 }, { scaleY: 1.04 }] },
  '76%': { transform: [{ scaleX: 1 }, { scaleY: 1 }] },
  to: { transform: [{ scaleX: 1 }, { scaleY: 1 }] },
};
const ORBIT = [
  { left: -18, top: 18, delay: 0 },
  { left: PIG - 24, top: 0, delay: 1500 },
  { left: -6, top: PIG - 58, delay: 800 },
  { left: PIG - 10, top: PIG - 70, delay: 2200 },
];

export function SaveArt({ stores }: { stores: Store[] }) {
  const loop = useLoop();
  return (
    <View style={{ width: PIG, height: PIG }}>
      <View style={styles.glow} />
      <Animated.View style={[StyleSheet.absoluteFill, loop(drop, 2600)]}>
        <Svg viewBox="0 0 64 64" style={StyleSheet.absoluteFill}>
          <BillShape />
        </Svg>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { transformOrigin: '48% 84%' }, loop(jiggle, 2600)]}>
        <Svg viewBox="0 0 64 64" style={StyleSheet.absoluteFill}>
          <PigShape />
        </Svg>
      </Animated.View>
      {stores.slice(0, 4).map((store, i) => (
        <Animated.View
          key={store.id}
          style={[styles.orbit, { left: ORBIT[i].left, top: ORBIT[i].top }, loop(float(-7), 4000, ORBIT[i].delay)]}>
          <StoreAvatar name={store.name} color={store.color} size={34} />
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    position: 'absolute',
    width: 280,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingLeft: 11,
    paddingRight: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 18,
    boxShadow: shadow,
  },
  chipImg: { width: 58, height: 58, borderRadius: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  goodTag: { alignSelf: 'flex-start', paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999, backgroundColor: C.goodSoft },
  basket: {
    width: 290,
    padding: 18,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 22,
    boxShadow: shadow,
  },
  basketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  basketEmoji: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.soft },
  check: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.goodSoft },
  basketTotal: { marginTop: 10, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12, backgroundColor: C.brand },
  glow: {
    position: 'absolute',
    left: -PIG * 0.15,
    top: -PIG * 0.15,
    width: PIG * 1.3,
    height: PIG * 1.3,
    borderRadius: PIG,
    experimental_backgroundImage: 'radial-gradient(circle, #dfe8ff 0%, rgba(223, 232, 255, 0) 68%)',
  },
  orbit: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    boxShadow: shadow,
  },
});
