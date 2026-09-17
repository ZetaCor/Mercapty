// El cerdito del logo, de pie, saludando con una moneda de oro en la mano: es
// public/piggy-hello.svg de la web, rehecho con react-native-svg. El brazo que saluda es una
// capa aparte, del tamaño del dibujo, que gira desde el hombro con los mismos keyframes del
// <style> del SVG (animaciones CSS de Reanimated). Queda quieto si el teléfono pide reducir
// el movimiento.
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { useReducedMotion, type CSSAnimationKeyframes } from 'react-native-reanimated';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

import type { ReactNode } from 'react';

const VIEW = 96;
const HOMBRO: [number, number] = [65, 52]; // desde donde gira el brazo que saluda

// Punto de giro en porcentaje de la capa. En iOS y Android va como lista: escrito como texto
// React Native solo acepta porcentajes enteros y lo lee mal.
const pivot = ([x, y]: [number, number]): ViewStyle['transformOrigin'] => {
  const px = `${(x / VIEW) * 100}%`;
  const py = `${(y / VIEW) * 100}%`;
  return Platform.OS === 'web' ? `${px} ${py}` : [px, py, 0];
};

const saludo: CSSAnimationKeyframes = {
  from: { transform: [{ rotate: '0deg' }] },
  '18%': { transform: [{ rotate: '16deg' }] },
  '36%': { transform: [{ rotate: '-12deg' }] },
  '55%': { transform: [{ rotate: '0deg' }] },
  to: { transform: [{ rotate: '0deg' }] },
};

const Layer = ({ children }: { children: ReactNode }) => (
  <Svg viewBox={`0 0 ${VIEW} ${VIEW}`} style={StyleSheet.absoluteFill}>{children}</Svg>
);

export function PiggyHello({ size = 64 }: { size?: number }) {
  const still = useReducedMotion();
  return (
    <View style={{ width: size, height: size, pointerEvents: 'none' }}>
      <Layer>
        <Ellipse cx={48} cy={89} rx={22} ry={3.2} fill="#0f172a" opacity={0.1} />

        {/* patas, una más oscura para que se note cuál está detrás */}
        <Rect x={34} y={70} width={11} height={17} rx={5.5} fill="#f48fb8" />
        <Rect x={51} y={70} width={11} height={17} rx={5.5} fill="#f9a8c9" />

        {/* cuerpo */}
        <Ellipse cx={48} cy={58} rx={23} ry={19} fill="#ffd1e1" />
        <Ellipse cx={37} cy={51} rx={5.5} ry={3} fill="#fff" opacity={0.5} transform="rotate(-25 37 51)" />

        {/* orejas caídas, como las del logo */}
        <Path d="M30 20c-2.5-3.5-3-8-1-9.5s5.5.5 7.5 4.5z" fill="#f9a8c9" />
        <Path d="M66 20c2.5-3.5 3-8 1-9.5s-5.5.5-7.5 4.5z" fill="#f9a8c9" />

        {/* cabeza, con la ranura de alcancía en la coronilla */}
        <Circle cx={48} cy={33} r={20} fill="#ffd1e1" />
        <Rect x={41} y={14.2} width={14} height={3} rx={1.5} fill="#be185d" />
        <Circle cx={30} cy={40} r={3.4} fill="#f9a8c9" opacity={0.75} />
        <Circle cx={66} cy={40} r={3.4} fill="#f9a8c9" opacity={0.75} />
        <Rect x={40} y={35} width={16} height={12.5} rx={6.25} fill="#f9a8c9" />
        <Circle cx={44.6} cy={41.2} r={1.6} fill="#be185d" />
        <Circle cx={51.4} cy={41.2} r={1.6} fill="#be185d" />
        <Circle cx={39.5} cy={28} r={2.8} fill="#1e293b" />
        <Circle cx={40.5} cy={27} r={0.95} fill="#fff" />
        <Circle cx={56.5} cy={28} r={2.8} fill="#1e293b" />
        <Circle cx={57.5} cy={27} r={0.95} fill="#fff" />

        {/* brazo con la moneda */}
        <Path d="M31 57L20 67" stroke="#f9a8c9" strokeWidth={9} strokeLinecap="round" fill="none" />
        <Circle cx={19} cy={69} r={9} fill="#f59e0b" />
        <Circle cx={19} cy={69} r={7} fill="#fbbf24" />
        <Path
          d="M20.6 66c-.6-.9-3.5-1-3.5.7 0 1.9 3.7 1 3.7 2.9 0 1.6-2.8 1.6-3.7.5M18.9 64.4v9.4"
          fill="none"
          stroke="#b45309"
          strokeWidth={1.3}
          strokeLinecap="round"
        />
      </Layer>

      {/* el brazo que saluda va por delante de la cabeza y es lo único que se mueve */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { transformOrigin: pivot(HOMBRO) },
          !still && {
            animationName: saludo,
            animationDuration: 2000,
            animationTimingFunction: 'ease-in-out',
            animationIterationCount: 'infinite',
            animationFillMode: 'backwards',
          },
        ]}>
        <Layer>
          <Path d="M65 52L75 36" stroke="#f9a8c9" strokeWidth={9} strokeLinecap="round" fill="none" />
          <Circle cx={76} cy={33} r={6.5} fill="#f9a8c9" />
        </Layer>
      </Animated.View>
    </View>
  );
}
