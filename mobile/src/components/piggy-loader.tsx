// El cerdito de Mercapty corre tras un billete con alas: public/loader.svg de la web,
// rehecho con react-native-svg. Cada parte (piso, sombra, líneas de velocidad, patas,
// cola, oreja, cuerpo, aire, billete y alas) es una capa del tamaño del dibujo con los
// mismos keyframes, pivotes y tiempos del <style> del SVG, animada con las animaciones
// CSS de Reanimated. Queda quieto si el teléfono pide reducir el movimiento.
import { useEffect, type ReactNode } from 'react';
import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type CSSAnimationKeyframes,
} from 'react-native-reanimated';
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from 'react-native-svg';

const VIEW_W = 240;
const VIEW_H = 120;
const PIGGY = 'translate(30 26) scale(1.45)'; // el cerdito usa las coordenadas del logo (public/icon.svg)
const BILL = 'translate(170 36)';

const AnimatedLine = Animated.createAnimatedComponent(Line);

type Anim = {
  name: CSSAnimationKeyframes;
  duration: number;
  easing?: 'linear' | 'ease-in-out';
  direction?: 'normal' | 'alternate' | 'alternate-reverse';
  delay?: number;
};

// Punto de giro en porcentaje de la capa. En iOS y Android va como lista: escrito como
// texto («23.375% 74.95%») React Native solo acepta porcentajes enteros y lo lee mal.
const pivot = ([x, y]: [number, number]): ViewStyle['transformOrigin'] => {
  const px = `${(x / VIEW_W) * 100}%`;
  const py = `${(y / VIEW_H) * 100}%`;
  return Platform.OS === 'web' ? `${px} ${py}` : [px, py, 0];
};

// Una capa del tamaño de todo el dibujo. `origin` es el punto de giro en coordenadas
// del SVG (lo que en la web hacen transform-box: fill-box y transform-origin).
function Part({ origin, anim, still, style, children }: {
  origin?: [number, number];
  anim?: Anim;
  still: boolean;
  style?: ViewStyle;
  children: ReactNode;
}) {
  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        { pointerEvents: 'none' },
        style,
        origin && { transformOrigin: pivot(origin) },
        anim &&
          !still && {
            animationName: anim.name,
            animationDuration: anim.duration,
            animationTimingFunction: anim.easing ?? 'ease-in-out',
            animationIterationCount: 'infinite',
            animationDirection: anim.direction ?? 'normal',
            animationDelay: anim.delay ?? 0,
            animationFillMode: 'backwards',
          },
      ]}>
      {children}
    </Animated.View>
  );
}

const Layer = ({ children }: { children: ReactNode }) => (
  <Svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} style={StyleSheet.absoluteFill}>
    {children}
  </Svg>
);

const swing = (from: number, to: number): CSSAnimationKeyframes => ({
  from: { transform: [{ rotate: `${from}deg` }] },
  to: { transform: [{ rotate: `${to}deg` }] },
});

// Patas: [x del rectángulo, color, dirección]. Las de atrás, más oscuras; se mueven en
// diagonal, como al trotar. Giran desde arriba (50% 10% de la pata).
const LEGS: [number, string, 'alternate' | 'alternate-reverse'][] = [
  [15, '#f48fb8', 'alternate-reverse'],
  [33, '#f48fb8', 'alternate'],
  [19, '#f9a8c9', 'alternate'],
  [37, '#f9a8c9', 'alternate-reverse'],
];
const piggyPoint = (x: number, y: number): [number, number] => [30 + x * 1.45, 26 + y * 1.45];

const SPEED_LINES: [number, number, number][] = [
  [22, 60, 36],
  [12, 72, 30],
  [22, 84, 34],
];
// En la web los retrasos son negativos (-0.15 s y -0.3 s); estos positivos dan la misma fase.
const SPEED_DELAYS = [0, 300, 150];

export function PiggyLoader({ width = 240 }: { width?: number }) {
  const still = useReducedMotion();
  const s = width / VIEW_W; // 1 unidad del SVG en puntos de pantalla

  // Piso que corre hacia atrás: stroke-dashoffset de 0 a 26 (un tramo de 12 + 14).
  const dash = useSharedValue(0);
  useEffect(() => {
    if (still) return;
    dash.set(withRepeat(withTiming(26, { duration: 450, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(dash);
  }, [still, dash]);
  const groundProps = useAnimatedProps(() => ({ strokeDashoffset: dash.get() }));

  const speed: CSSAnimationKeyframes = {
    from: { transform: [{ translateX: 0 }], opacity: 0.9 },
    to: { transform: [{ translateX: -18 * s }], opacity: 0 },
  };
  const fly: CSSAnimationKeyframes = {
    from: { transform: [{ translateX: 0 }, { translateY: 0 }, { rotate: '-7deg' }] },
    '25%': { transform: [{ translateX: 5 * s }, { translateY: -8 * s }, { rotate: '5deg' }] },
    '50%': { transform: [{ translateX: 10 * s }, { translateY: -2 * s }, { rotate: '-3deg' }] },
    '75%': { transform: [{ translateX: 4 * s }, { translateY: -10 * s }, { rotate: '8deg' }] },
    to: { transform: [{ translateX: 0 }, { translateY: 0 }, { rotate: '-7deg' }] },
  };
  const flap: CSSAnimationKeyframes = { from: { transform: [{ scaleY: 1 }] }, to: { transform: [{ scaleY: 0.2 }] } };

  return (
    <View
      style={{ width, height: width / 2 }}
      accessible
      accessibilityRole="image"
      accessibilityLabel="El cerdito de Mercapty corre tras un billete que se va volando">
      {/* piso que corre hacia atrás */}
      <Layer>
        <AnimatedLine
          x1={8}
          y1={106}
          x2={232}
          y2={106}
          stroke="#d5dce5"
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray="12 14"
          animatedProps={groundProps}
        />
      </Layer>

      {/* sombra del cerdito */}
      <Part
        still={still}
        origin={[75, 105]}
        style={{ opacity: 0.1 }}
        anim={{
          name: {
            from: { transform: [{ scaleX: 1 }], opacity: 0.1 },
            '50%': { transform: [{ scaleX: 0.82 }], opacity: 0.05 },
            to: { transform: [{ scaleX: 1 }], opacity: 0.1 },
          },
          duration: 400,
        }}>
        <Layer>
          <Ellipse cx={75} cy={105} rx={30} ry={3.5} fill="#0f172a" />
        </Layer>
      </Part>

      {/* líneas de velocidad detrás del cerdito */}
      {SPEED_LINES.map(([x1, y, x2], i) => (
        <Part key={y} still={still} anim={{ name: speed, duration: 450, easing: 'linear', delay: SPEED_DELAYS[i] }}>
          <Layer>
            <Line x1={x1} y1={y} x2={x2} y2={y} stroke="#cbd5e1" strokeWidth={3} strokeLinecap="round" />
          </Layer>
        </Part>
      ))}

      {/* cerdito: sube y baja al correr */}
      <Part
        still={still}
        anim={{
          name: {
            from: { transform: [{ translateY: 0 }] },
            '50%': { transform: [{ translateY: -3 * s }] },
            to: { transform: [{ translateY: 0 }] },
          },
          duration: 400,
        }}>
        {LEGS.map(([x, color, direction]) => (
          <Part key={x} still={still} origin={piggyPoint(x + 3, 44.1)} anim={{ name: swing(32, -32), duration: 400, direction }}>
            <Layer>
              <G transform={PIGGY}>
                <Rect x={x} y={43} width={6} height={11} rx={2.5} fill={color} />
              </G>
            </Layer>
          </Part>
        ))}
        <Part still={still} origin={piggyPoint(13.31, 34.96)} anim={{ name: swing(-18, 14), duration: 200, direction: 'alternate' }}>
          <Layer>
            <G transform={PIGGY}>
              <Path d="M12.5 37c-3.5 0-4.5-4-1.5-5s3 3 .5 3.5" fill="none" stroke="#f9a8c9" strokeWidth={2} strokeLinecap="round" />
            </G>
          </Layer>
        </Part>
        <Part still={still} origin={piggyPoint(39.5, 27)} anim={{ name: swing(-6, 10), duration: 400, direction: 'alternate' }}>
          <Layer>
            <G transform={PIGGY}>
              <Path d="M38 25.5l4-7 3.5 8.5z" fill="#f9a8c9" />
            </G>
          </Layer>
        </Part>
        {/* cuerpo, hocico, ojo y ranura de alcancía */}
        <Layer>
          <G transform={PIGGY}>
            <Ellipse cx={31} cy={37} rx={19} ry={14.5} fill="#ffd1e1" />
            <Ellipse cx={22} cy={31} rx={4} ry={2.4} fill="#fff" opacity={0.55} transform="rotate(-25 22 31)" />
            <Circle cx={40.5} cy={39} r={2.3} fill="#f9a8c9" opacity={0.7} />
            <Rect x={45} y={31.5} width={10} height={11} rx={5} fill="#f9a8c9" />
            <Circle cx={48.4} cy={37} r={1.3} fill="#be185d" />
            <Circle cx={51.6} cy={37} r={1.3} fill="#be185d" />
            <Circle cx={41.5} cy={32} r={2} fill="#1e293b" />
            <Circle cx={42.1} cy={31.4} r={0.6} fill="#fff" />
            <Rect x={21.5} y={24.4} width={17} height={2.6} rx={1.3} fill="#be185d" />
          </G>
        </Layer>
      </Part>

      {/* aire que deja el billete al volar */}
      {['M150 46q6-3 12 0', 'M146 58q6-3 12 0'].map((d, i) => (
        <Part key={d} still={still} anim={{ name: speed, duration: 800, easing: 'linear', delay: i * 400 }}>
          <Layer>
            <Path d={d} fill="none" stroke="#bbf7d0" strokeWidth={2} strokeLinecap="round" />
          </Layer>
        </Part>
      ))}

      {/* billete con alas, siempre un poco más adelante */}
      <Part still={still} origin={[187, 42.8]} anim={{ name: fly, duration: 1600 }}>
        <Part still={still} origin={[170.5, 38]} anim={{ name: flap, duration: 160, direction: 'alternate' }}>
          <Layer>
            <G transform={BILL}>
              <Path d="M9 2C5-8-7-9-8-2c6 2 12 3 17 4z" fill="#fff" stroke="#86efac" strokeWidth={1.2} strokeLinejoin="round" />
            </G>
          </Layer>
        </Part>
        <Part still={still} origin={[203.5, 38]} anim={{ name: flap, duration: 160, direction: 'alternate' }}>
          <Layer>
            <G transform={BILL}>
              <Path d="M25 2c4-10 16-11 17-4-6 2-12 3-17 4z" fill="#fff" stroke="#86efac" strokeWidth={1.2} strokeLinejoin="round" />
            </G>
          </Layer>
        </Part>
        <Layer>
          <G transform={BILL}>
            <Rect x={0} y={0} width={34} height={20} rx={3} fill="#22c55e" />
            <Rect x={3} y={3} width={28} height={14} rx={2} fill="none" stroke="#dcfce7" strokeWidth={1.3} />
            <Circle cx={17} cy={10} r={4.4} fill="#dcfce7" />
            <Path
              d="M18.6 8.3c-.5-.8-3.2-1-3.2.6 0 1.8 3.4.9 3.4 2.7 0 1.5-2.6 1.5-3.4.5M17 6.4v7.2"
              fill="none"
              stroke="#15803d"
              strokeWidth={1.1}
              strokeLinecap="round"
            />
          </G>
        </Layer>
      </Part>
    </View>
  );
}
