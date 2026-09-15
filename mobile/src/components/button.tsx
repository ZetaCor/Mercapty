import * as WebBrowser from 'expo-web-browser';
import { Linking, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { Icon, type IconName } from './icons';
import { T } from './text';

import { C } from '@/constants/theme';

const VARIANTS = {
  primary: { bg: C.brand, pressed: C.brand600, border: C.brand, text: '#fff' },
  default: { bg: '#fff', pressed: C.soft, border: C.border, text: C.text },
  soft: { bg: C.brandSoft, pressed: '#e2eaff', border: 'transparent', text: C.brand },
  danger: { bg: '#fff', pressed: C.promoSoft, border: C.border, text: C.promo },
  destructive: { bg: C.promo, pressed: '#be123c', border: C.promo, text: '#fff' },
} as const;

const SIZES = {
  sm: { pv: 7, ph: 11, font: 13.5, radius: 10 },
  md: { pv: 10, ph: 16, font: 15, radius: 12 },
  lg: { pv: 14, ph: 20, font: 16, radius: 14 },
} as const;

export function Button({ title, onPress, variant = 'default', size = 'md', icon, iconRight, disabled, style, accessibilityLabel, lines = 1 }: {
  title?: string;
  lines?: number; // renglones del texto antes de cortarlo con «…»
  onPress?: () => void;
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  icon?: IconName;
  iconRight?: IconName;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const v = VARIANTS[variant];
  const s = SIZES[size];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: pressed ? v.pressed : v.bg,
          borderColor: v.border,
          paddingVertical: s.pv,
          paddingHorizontal: s.ph,
          borderRadius: s.radius,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}>
      {icon && <Icon name={icon} size={18} color={v.text} />}
      {title ? (
        <T w={600} size={s.font} color={v.text} numberOfLines={lines} style={{ flexShrink: 1, textAlign: 'center' }}>
          {title}
        </T>
      ) : null}
      {iconRight && <Icon name={iconRight} size={16} color={v.text} />}
    </Pressable>
  );
}

// Tiendas y enlaces externos se abren en el navegador dentro de la app.
export function openLink(url: string) {
  WebBrowser.openBrowserAsync(url, { controlsColor: C.brand, toolbarColor: '#ffffff' }).catch(() => {
    Linking.openURL(url).catch(() => {});
  });
}

const styles = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1 },
});
