// Íconos de línea de la web (public/js/ui.js e index.html).
import type { ReactNode } from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

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
