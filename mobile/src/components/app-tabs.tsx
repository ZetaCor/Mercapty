// Barra de pestañas nativa: en iOS la del sistema (con efecto vidrio en iOS 26) y en
// Android la de Material. Íconos del sistema: SF Symbols en iOS, Material en Android.
import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { C } from '@/constants/theme';
import { useI18n } from '@/lib/i18n';
import { useList } from '@/lib/list';

export default function AppTabs() {
  const count = useList().items.length;
  const { t } = useI18n();
  return (
    <NativeTabs
      backgroundColor={C.bg}
      tintColor={C.brand}
      iconColor={{ default: C.muted, selected: C.brand }}
      labelStyle={{ default: { color: C.muted }, selected: { color: C.brand } }}
      badgeBackgroundColor={C.promo}
      indicatorColor={C.brandSoft}
      labelVisibilityMode="labeled">
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>{t('Inicio')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="buscar">
        <NativeTabs.Trigger.Label>{t('Buscar')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="magnifyingglass" md="search" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="lista">
        <NativeTabs.Trigger.Label>{t('Mi lista')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'basket', selected: 'basket.fill' }} md="shopping_basket" />
        <NativeTabs.Trigger.Badge hidden={count === 0}>{String(count)}</NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="juego">
        <NativeTabs.Trigger.Label>{t('Juego')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'gamecontroller', selected: 'gamecontroller.fill' }} md="sports_esports" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="tiendas">
        <NativeTabs.Trigger.Label>{t('Tiendas')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'storefront', selected: 'storefront.fill' }} md="storefront" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
