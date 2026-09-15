// Barra inferior para la versión web (solo desarrollo): la misma .tabbar de la web en el celular.
import { TabList, TabSlot, Tabs, TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from './icons';
import { T } from './text';

import { C } from '@/constants/theme';
import { useI18n } from '@/lib/i18n';
import { useList } from '@/lib/list';

export default function AppTabs() {
  const count = useList().items.length;
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  return (
    <Tabs>
      <TabSlot style={{ flex: 1 }} />
      <TabList style={[styles.bar, { paddingBottom: insets.bottom + 6 }]}>
        <TabTrigger name="index" href="/" asChild>
          <TabButton icon="home" label={t('Inicio')} />
        </TabTrigger>
        <TabTrigger name="buscar" href="/buscar" asChild>
          <TabButton icon="search" label={t('Buscar')} />
        </TabTrigger>
        <TabTrigger name="lista" href="/lista" asChild>
          <TabButton icon="basket" label={t('Mi lista')} badge={count} />
        </TabTrigger>
        <TabTrigger name="tiendas" href="/tiendas" asChild>
          <TabButton icon="store" label={t('Tiendas')} />
        </TabTrigger>
      </TabList>
    </Tabs>
  );
}

function TabButton({ icon, label, badge = 0, isFocused, ...props }: TabTriggerSlotProps & {
  icon: IconName;
  label: string;
  badge?: number;
}) {
  const color = isFocused ? C.brand : C.muted;
  return (
    <Pressable {...props} style={styles.tab}>
      <View>
        <Icon name={icon} size={23} color={color} strokeWidth={1.8} />
        {badge > 0 && (
          <View style={styles.badge}>
            <T w={700} size={10} color="#fff">{badge}</T>
          </View>
        )}
      </View>
      <T w={600} size={11} color={color}>{label}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    paddingTop: 6,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  tab: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 4 },
  badge: {
    position: 'absolute',
    top: -4,
    left: 14,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.promo,
  },
});
