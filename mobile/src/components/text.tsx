import { Text, type TextProps } from 'react-native';

import { C, F, type Weight } from '@/constants/theme';

type Props = TextProps & {
  w?: Weight; // peso de Inter: 400, 500, 600, 700 u 800
  size?: number;
  color?: string;
  tight?: boolean; // títulos: letras un poco más juntas, como en la web (-0.02em)
};

export function T({ w = 400, size = 15, color = C.text, tight = false, style, ...props }: Props) {
  return (
    <Text
      maxFontSizeMultiplier={1.4}
      {...props}
      style={[
        {
          fontFamily: F[w],
          fontSize: size,
          lineHeight: Math.round(size * (size >= 22 ? 1.15 : 1.4)),
          color,
          letterSpacing: tight ? -0.02 * size : 0,
        },
        style,
      ]}
    />
  );
}
