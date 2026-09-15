// Piezas pequeñas que se repiten en las pantallas.
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Button } from './button';
import { T } from './text';

import { C, PAD, R } from '@/constants/theme';

export function SectionHead({ title, sub, action, onAction }: {
  title: string;
  sub?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.head}>
      <View style={{ flexShrink: 1 }}>
        <T w={700} size={19} tight accessibilityRole="header">{title}</T>
        {sub ? <T size={13.5} color={C.muted}>{sub}</T> : null}
      </View>
      {action ? (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="link">
          <T w={600} size={14} color={C.brand}>{action}</T>
        </Pressable>
      ) : null}
    </View>
  );
}

const TONES = {
  default: [C.soft, C.muted],
  good: [C.goodSoft, C.good],
  promo: [C.promoSoft, C.promo],
  demo: [C.warnSoft, C.warn],
} as const;

export function Tag({ children, tone = 'default' }: { children: ReactNode; tone?: keyof typeof TONES }) {
  const [bg, color] = TONES[tone];
  return (
    <View style={[styles.tag, { backgroundColor: bg }]}>
      <T w={600} size={11} color={color}>{children}</T>
    </View>
  );
}

export function Panel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

export function Note({ children, tone = 'good' }: { children: ReactNode; tone?: 'good' | 'soft' | 'warn' }) {
  const [bg, color] = tone === 'good' ? [C.goodSoft, C.good] : tone === 'warn' ? [C.warnSoft, C.warn] : [C.soft, C.text2];
  return (
    <View style={[styles.note, { backgroundColor: bg }]}>
      <T size={14} color={color}>{children}</T>
    </View>
  );
}

export function EmptyState({ emoji, title, text, action, onAction }: {
  emoji: string;
  title?: string;
  text?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.empty}>
      <T size={46} style={{ lineHeight: 56 }}>{emoji}</T>
      {title ? <T w={700} size={18} tight style={styles.center}>{title}</T> : null}
      {text ? <T color={C.muted} style={styles.center}>{text}</T> : null}
      {action ? <Button title={action} variant="primary" onPress={onAction} style={{ marginTop: 8 }} /> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <EmptyState
      emoji="😕"
      title="No pudimos cargar esta página"
      text={message}
      action={onRetry ? 'Reintentar' : undefined}
      onAction={onRetry}
    />
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: PAD,
    marginBottom: 12,
  },
  tag: { alignSelf: 'flex-start', paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999 },
  panel: { padding: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: C.border, borderRadius: R.lg },
  note: { marginTop: 12, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 48, paddingHorizontal: 24 },
  center: { textAlign: 'center' },
});
