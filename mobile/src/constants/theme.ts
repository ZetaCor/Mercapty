// Los mismos colores, radios y sombras de la web (public/styles.css): diseño claro, siempre blanco.
export const C = {
  bg: '#ffffff',
  soft: '#f5f7fa',
  soft2: '#eef1f5',
  text: '#0f172a',
  text2: '#334155',
  muted: '#64748b',
  border: '#e8ecf1',
  border2: '#d5dce5',
  brand: '#1d4ed8',
  brand600: '#1e40af',
  brandSoft: '#eef3ff',
  good: '#047857',
  goodSoft: '#ecfdf5',
  promo: '#e11d48',
  promoSoft: '#fff1f3',
  warn: '#92400e',
  warnSoft: '#fffbeb',
  dot: '#cbd5e1',
} as const;

export const R = { xl: 24, lg: 18, md: 14, sm: 12 } as const;

export const shadow = '0 1px 2px rgba(15, 23, 42, 0.04), 0 12px 32px -14px rgba(15, 23, 42, 0.18)';
export const shadowSm = '0 1px 2px rgba(15, 23, 42, 0.05)';

// Inter, como en la web. En Android cada peso es una fuente aparte.
export const F = {
  400: 'Inter_400Regular',
  500: 'Inter_500Medium',
  600: 'Inter_600SemiBold',
  700: 'Inter_700Bold',
  800: 'Inter_800ExtraBold',
} as const;
export type Weight = keyof typeof F;

// Margen lateral de las pantallas.
export const PAD = 16;
