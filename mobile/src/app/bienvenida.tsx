// Bienvenida («Get started»): aparece solo la primera vez. Tres páginas que se deslizan
// con el dedo, con las ideas de la portada de la web: comparar, armar la canasta y
// comprar donde está más barato. El fondo cambia de color al deslizar y los dibujos se
// mueven un poco más lento que el texto (efecto de profundidad). Arriba se elige el idioma.
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Extrapolation,
  FadeIn,
  interpolate,
  interpolateColor,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { Icon } from '@/components/icons';
import { LangSwitch } from '@/components/lang-switch';
import { Brand } from '@/components/logo';
import { BasketArt, CompareArt, SaveArt } from '@/components/onboarding-art';
import { T } from '@/components/text';
import { C, shadow } from '@/constants/theme';
import type { Meta, ProductSummary } from '@/lib/api';
import { count } from '@/lib/format';
import { hlParts, useI18n } from '@/lib/i18n';
import { useOnboarding } from '@/lib/onboarding';
import { useStores } from '@/lib/stores';
import { useFetch } from '@/lib/use-fetch';

// Los mismos degradados suaves de las diapositivas de la web.
const BACKGROUNDS = [
  'radial-gradient(circle at 100% 0%, #e8efff 0%, rgba(232, 239, 255, 0) 62%), radial-gradient(circle at 0% 100%, #eafaf2 0%, rgba(234, 250, 242, 0) 58%)',
  'radial-gradient(circle at 100% 100%, #fff3dc 0%, rgba(255, 243, 220, 0) 62%), radial-gradient(circle at 0% 0%, #eef3ff 0%, rgba(238, 243, 255, 0) 50%)',
  'radial-gradient(circle at 100% 0%, #e8efff 0%, rgba(232, 239, 255, 0) 62%), radial-gradient(circle at 0% 100%, #fdeef4 0%, rgba(253, 238, 244, 0) 58%)',
];

// Título con la parte entre corchetes en azul.
const Title = ({ text }: { text: string }) => (
  <T w={800} size={29} tight accessibilityRole="header">
    {hlParts(text).map((part, i) => (
      <T key={i} w={800} size={29} tight color={part.hl ? C.brand : C.text}>{part.text}</T>
    ))}
  </T>
);

export default function Bienvenida() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { finish } = useOnboarding();
  const { t } = useI18n();
  const stores = useStores();
  const meta = useFetch<Meta>('/api/meta').data;
  const deals = useFetch<ProductSummary[]>('/api/deals?limit=8').data;

  const n = stores.active.length;
  const pages = [
    {
      eyebrow: t('Canasta básica · Panamá'),
      title: n > 1 ? t('El [precio más bajo], en {n} supermercados a la vez', { n }) : t('El [precio más bajo] de tu canasta básica'),
      body: meta
        ? t('Compara {n} productos del súper y mira, tienda por tienda, dónde te sale más barato.', { n: count(meta.products) })
        : t('Compara arroz, pollo, huevos, leche y miles de productos del súper, y mira dónde te sale más barato.'),
      art: <CompareArt deals={deals} stores={stores.byId} />,
      size: [330, 290],
    },
    {
      eyebrow: t('Mi lista'),
      title: t('Arma tu canasta y [ahorra en cada compra]'),
      body: t('Agrega lo que compras cada semana y te decimos si conviene comprar todo en un súper o repartir la compra entre varios.'),
      art: <BasketArt />,
      size: [290, 330],
    },
    {
      eyebrow: t('Directo a tu súper'),
      title: t('Compra donde está [más barato]'),
      body: t('Con un toque te llevamos a la tienda en línea con el mejor precio. La compra, el pago y la entrega los haces en tu súper.'),
      art: <SaveArt stores={stores.active} />,
      size: [240, 230],
    },
  ];

  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const x = useSharedValue(0);
  const [index, setIndex] = useState(0);
  const [pageH, setPageH] = useState(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    x.set(e.contentOffset.x);
  });
  useAnimatedReaction(
    () => Math.round(x.get() / width),
    (current, previous) => {
      if (current !== previous) scheduleOnRN(setIndex, current);
    },
  );

  const last = index >= pages.length - 1;
  const next = () => {
    if (last) return finish();
    scrollRef.current?.scrollTo({ x: (index + 1) * width, animated: true });
    setIndex(index + 1); // sin esperar al último evento de desplazamiento
  };

  const artArea = Math.max(200, pageH * 0.56);
  return (
    <View style={styles.screen}>
      {BACKGROUNDS.map((bg, i) => (
        <Background key={bg} i={i} x={x} width={width} image={bg} />
      ))}

      <View style={[styles.top, { paddingTop: insets.top + 10 }]}>
        <Brand size={18} />
        <View style={styles.topActions}>
          <LangSwitch compact />
          <Pressable
            onPress={finish}
            hitSlop={12}
            style={{ opacity: last ? 0 : 1 }}
            disabled={last}
            accessibilityRole="button"
            accessibilityLabel={t('Saltar la bienvenida')}>
            <T w={600} color={C.muted}>{t('Saltar')}</T>
          </Pressable>
        </View>
      </View>

      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onLayout={(e) => setPageH(e.nativeEvent.layout.height)}
        style={{ flex: 1 }}>
        {pages.map((page, i) => {
          const scale = Math.min(1, (artArea - 12) / page.size[1], (width - 40) / page.size[0]);
          return (
            <Page key={i} i={i} x={x} width={width} height={pageH} artArea={artArea}
              art={<View style={{ transform: [{ scale }] }}>{page.art}</View>}>
              <View style={styles.eyebrow}>
                <T w={600} size={13} color={C.brand}>{page.eyebrow}</T>
              </View>
              <Title text={page.title} />
              <T size={16} color={C.text2} style={{ lineHeight: 24 }}>{page.body}</T>
            </Page>
          );
        })}
      </Animated.ScrollView>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.dots}>
          {pages.map((_page, i) => (
            <Dot key={i} i={i} x={x} width={width} />
          ))}
        </View>
        <Pressable
          onPress={next}
          accessibilityRole="button"
          style={({ pressed }) => [styles.cta, { backgroundColor: pressed ? C.brand600 : C.brand }]}>
          <Animated.View key={last ? 'go' : 'next'} entering={FadeIn.duration(220)} style={styles.ctaInner}>
            <T w={700} size={17} color="#fff">{last ? t('Empezar a ahorrar') : t('Siguiente')}</T>
            <Icon name="next" size={20} color="#fff" strokeWidth={2.4} />
          </Animated.View>
        </Pressable>
      </View>
    </View>
  );
}

// Cada página se ve más a medida que llega al centro.
function useFocus(i: number, x: SharedValue<number>, width: number) {
  return (value: number, spread = 1) => {
    'worklet';
    return interpolate(value, [(i - spread) * width, i * width, (i + spread) * width], [0, 1, 0], Extrapolation.CLAMP);
  };
}

function Background({ i, x, width, image }: { i: number; x: SharedValue<number>; width: number; image: string }) {
  const focus = useFocus(i, x, width);
  const style = useAnimatedStyle(() => ({ opacity: focus(x.get()) }));
  return <Animated.View style={[StyleSheet.absoluteFill, { pointerEvents: 'none', experimental_backgroundImage: image }, style]} />;
}

function Page({ i, x, width, height, artArea, art, children }: {
  i: number;
  x: SharedValue<number>;
  width: number;
  height: number;
  artArea: number;
  art: ReactNode;
  children: ReactNode;
}) {
  const focus = useFocus(i, x, width);
  const artStyle = useAnimatedStyle(() => ({
    opacity: focus(x.get(), 0.9),
    transform: [
      {
        translateX: interpolate(x.get(), [(i - 1) * width, i * width, (i + 1) * width], [-0.4 * width, 0, 0.4 * width], Extrapolation.CLAMP),
      },
    ],
  }));
  const textStyle = useAnimatedStyle(() => ({
    opacity: focus(x.get(), 0.6),
    transform: [{ translateY: (1 - focus(x.get())) * 24 }],
  }));
  return (
    <View style={{ width, height }}>
      <Animated.View style={[styles.art, { height: artArea }, artStyle]}>{art}</Animated.View>
      <Animated.View style={[styles.copy, textStyle]}>{children}</Animated.View>
    </View>
  );
}

// Puntos como los del carrusel de la web: el activo se estira y se pinta de azul.
function Dot({ i, x, width }: { i: number; x: SharedValue<number>; width: number }) {
  const focus = useFocus(i, x, width);
  const style = useAnimatedStyle(() => {
    const p = focus(x.get());
    return { width: 9 + p * 19, backgroundColor: interpolateColor(p, [0, 1], [C.dot, C.brand]) };
  });
  return <Animated.View style={[styles.dot, style]} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingBottom: 6 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  art: { alignItems: 'center', justifyContent: 'center' },
  copy: { gap: 12, paddingHorizontal: 24, paddingTop: 8 },
  eyebrow: { alignSelf: 'flex-start', paddingVertical: 5, paddingHorizontal: 12, borderRadius: 999, backgroundColor: C.brandSoft },
  bottom: { gap: 20, paddingHorizontal: 24, paddingTop: 12 },
  dots: { flexDirection: 'row', gap: 7, alignSelf: 'center' },
  dot: { height: 9, borderRadius: 999 },
  cta: { borderRadius: 16, boxShadow: shadow },
  ctaInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 17 },
});
