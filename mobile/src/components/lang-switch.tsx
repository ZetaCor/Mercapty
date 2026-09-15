// Cambiar entre español e inglés. `compact`: una pastilla con el otro idioma («EN» o «ES»),
// para la bienvenida; si no, dos opciones «Español | English», para Tiendas.
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from './icons';
import { T } from './text';

import { C } from '@/constants/theme';
import { useI18n, type Lang } from '@/lib/i18n';

const NAMES: Record<Lang, string> = { es: 'Español', en: 'English' };

export function LangSwitch({ compact = false }: { compact?: boolean }) {
  const { lang, setLang } = useI18n();

  if (compact) {
    const other: Lang = lang === 'en' ? 'es' : 'en';
    return (
      <Pressable
        onPress={() => setLang(other)}
        hitSlop={8}
        style={({ pressed }) => [styles.pill, pressed && { backgroundColor: C.soft }]}
        accessibilityRole="button"
        accessibilityLabel={other === 'en' ? 'Switch to English' : 'Cambiar a español'}>
        <Icon name="globe" size={15} color={C.text2} strokeWidth={1.8} />
        <T w={700} size={13} color={C.text2}>{other.toUpperCase()}</T>
      </Pressable>
    );
  }

  return (
    <View style={styles.segmented} accessibilityRole="radiogroup">
      {(['es', 'en'] as const).map((option) => {
        const active = option === lang;
        return (
          <Pressable
            key={option}
            onPress={() => setLang(option)}
            style={[styles.option, active && styles.active]}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}>
            <T w={active ? 700 : 500} color={active ? '#fff' : C.text2}>{NAMES[option]}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: '#fff',
  },
  segmented: { flexDirection: 'row', padding: 4, gap: 4, borderRadius: 14, backgroundColor: C.soft },
  option: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10 },
  active: { backgroundColor: C.brand },
});
