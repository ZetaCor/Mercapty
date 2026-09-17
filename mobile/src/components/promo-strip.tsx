// Franja de la portada con los días de descuento de hoy, igual que en la web.
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from './button';
import { StoreAvatar } from './store-avatar';
import { T } from './text';

import { C, PAD, R } from '@/constants/theme';
import { useI18n } from '@/lib/i18n';
import { usePromos } from '@/lib/promos';
import { useStores } from '@/lib/stores';

export function PromoStrip() {
  const { t } = useI18n();
  const promos = usePromos();
  const { byId } = useStores();
  if (!promos.length) return null;

  return (
    <View style={styles.card}>
      {promos.map((promo) => {
        const store = byId.get(promo.storeId);
        const name = store?.name ?? promo.storeId;
        return (
          <View key={promo.id} style={styles.row}>
            <StoreAvatar name={name} color={store?.color} />
            <View style={{ flex: 1 }}>
              <T w={700} size={15} numberOfLines={2}>{promo.name}</T>
              <T w={600} size={13} color={C.promo}>
                {promo.discount
                  ? t('Hoy −{n}% en {store}', { n: promo.discount, store: name })
                  : t('Hoy en {store}', { store: name })}
              </T>
              {promo.terms ? <T size={12} color={C.muted}>{t(promo.terms)}</T> : null}
            </View>
            {promo.categories.length === 1 && (
              <Button
                title={t('Ver productos')}
                size="sm"
                onPress={() => router.navigate({
                  pathname: '/buscar',
                  params: { categoria: promo.categories[0], t: String(Date.now()) },
                })}
              />
            )}
          </View>
        );
      })}
      <T size={12} color={C.muted}>{t('Lo anuncia la tienda: confirma el descuento al pagar.')}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 10,
    marginHorizontal: PAD,
    marginTop: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ffd9e0',
    borderRadius: R.lg,
    backgroundColor: C.promoSoft,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
