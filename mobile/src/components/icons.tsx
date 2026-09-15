// Íconos de línea de la web (public/js/ui.js e index.html).
import type { ReactNode } from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { C } from '@/constants/theme';

const PATHS = {
  plus: <Path d="M12 5v14M5 12h14" />,
  minus: <Path d="M5 12h14" />,
  external: (
    <>
      <Path d="M14 4h6v6" />
      <Path d="M20 4 10 14" />
      <Path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
    </>
  ),
  back: <Path d="M15 18l-6-6 6-6" />,
  next: <Path d="M9 6l6 6-6 6" />,
  down: <Path d="M6 9l6 6 6-6" />,
  search: (
    <>
      <Circle cx={11} cy={11} r={7} />
      <Path d="m20 20-3.5-3.5" />
    </>
  ),
  home: <Path d="M3.5 10.5 12 3.5l8.5 7V20H15v-5.5H9V20H3.5z" />,
  basket: (
    <>
      <Path d="M5 8h14l-1.2 12H6.2z" />
      <Path d="M9 8a3 3 0 0 1 6 0" />
    </>
  ),
  store: (
    <>
      <Path d="M4 9.5h16l-1.5-5h-13z" />
      <Path d="M5.5 9.5V20h13V9.5" />
      <Path d="M10 20v-5h4v5" />
    </>
  ),
  share: (
    <>
      <Path d="M12 3v12" />
      <Path d="m8 7 4-4 4 4" />
      <Path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" />
    </>
  ),
  trash: <Path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />,
  check: <Path d="M5 12.5l4.5 4.5L19 7.5" />,
  close: <Path d="M6 6l12 12M18 6 6 18" />,
  barcode: (
    <>
      <Path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
      <Path d="M8 8v8M11 8v8M14 8v8M17 8v8" />
    </>
  ),
  flash: <Path d="M13 3 5 13.5h6L10 21l8-10.5h-6L13 3z" />,
  globe: (
    <>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9M12 3C9.5 5.6 8.2 8.6 8.2 12s1.3 6.4 3.8 9" />
    </>
  ),
  mail: (
    <>
      <Rect x={3} y={5} width={18} height={14} rx={2.5} />
      <Path d="m4 7 8 6 8-6" />
    </>
  ),
  whatsapp: (
    <>
      <Path d="M20.5 11.8a8.5 8.5 0 0 1-12.4 7.5L3.5 20.5l1.3-4.4a8.5 8.5 0 1 1 15.7-4.3z" />
      <Path d="M9 8.6c0 3.2 2.9 6.3 6.3 6.4l1.2-1.4-1.9-.9-.9.8a4.4 4.4 0 0 1-2.6-2.6l.8-.9-.9-1.9z" />
    </>
  ),
  instagram: (
    <>
      <Rect x={3.5} y={3.5} width={17} height={17} rx={5} />
      <Circle cx={12} cy={12} r={4} />
      <Path d="M17.2 6.8h.01" />
    </>
  ),
  facebook: <Path d="M14.5 8.5H17V5h-2.5A3.5 3.5 0 0 0 11 8.5V11H8.5v3.5H11V21h3.5v-6.5H17l.5-3.5h-3V9a.5.5 0 0 1 .5-.5z" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, color = C.text, strokeWidth = 2 }: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round">
      {PATHS[name]}
    </Svg>
  );
}
