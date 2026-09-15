// Logo de Mercapty (public/icon.svg): el cerdito alcancía con un billete en la ranura.
import { View } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

import { T } from './text';

import { C } from '@/constants/theme';

// Las piezas usan las coordenadas del logo (0 a 64).
export const BillShape = () => (
  <G transform="rotate(-8 30 20)">
    <Rect x={22} y={9} width={16} height={21} rx={2.5} fill="#22c55e" />
    <Rect x={24.2} y={11.2} width={11.6} height={16.6} rx={1.5} fill="none" stroke="#dcfce7" strokeWidth={1.1} />
    <Circle cx={30} cy={17.5} r={2.8} fill="#dcfce7" />
  </G>
);

export const PigShape = () => (
  <G>
    <Rect x={18} y={45} width={7} height={9} rx={2.5} fill="#f9a8c9" />
    <Rect x={35} y={45} width={7} height={9} rx={2.5} fill="#f9a8c9" />
    <Path d="M12.5 37c-3.5 0-4.5-4-1.5-5s3 3 .5 3.5" fill="none" stroke="#f9a8c9" strokeWidth={2} strokeLinecap="round" />
    <Path d="M38 25.5l4-7 3.5 8.5z" fill="#f9a8c9" />
    <Ellipse cx={31} cy={37} rx={19} ry={14.5} fill="#ffd1e1" />
    <Ellipse cx={22} cy={31} rx={4} ry={2.4} fill="#fff" opacity={0.55} transform="rotate(-25 22 31)" />
    <Rect x={45} y={31.5} width={10} height={11} rx={5} fill="#f9a8c9" />
    <Circle cx={48.4} cy={37} r={1.3} fill="#be185d" />
    <Circle cx={51.6} cy={37} r={1.3} fill="#be185d" />
    <Circle cx={41} cy={32.5} r={1.9} fill="#1e293b" />
    <Rect x={21.5} y={24.4} width={17} height={2.6} rx={1.3} fill="#be185d" />
  </G>
);

export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Rect width={64} height={64} rx={16} fill={C.brand} />
      <BillShape />
      <PigShape />
    </Svg>
  );
}

// «Mercapty» con «pty» en azul, junto al logo.
export function Brand({ size = 20 }: { size?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} accessibilityRole="header" accessibilityLabel="Mercapty">
      <LogoMark size={Math.round(size * 1.7)} />
      <T w={600} size={size} tight>
        Merca<T w={800} size={size} tight color={C.brand}>pty</T>
      </T>
    </View>
  );
}
