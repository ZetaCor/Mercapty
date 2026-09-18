// Los días de descuento de hoy, en la portada. Se agrupan por tienda: cuando un súper tiene
// dos promociones el mismo día —los viernes de Súper 99 son cosméticos y dermocosmética— se
// veía su nombre y su logo repetidos dentro del mismo cuadro, como si estuviera duplicado.
// Ahora la tienda se nombra una vez y debajo van sus descuentos, cada uno con su porcentaje
// grande y tocable.
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from './icons';
import { StoreAvatar } from './store-avatar';
import { T } from './text';

import { C, PAD, R } from '@/constants/theme';
import { useI18n } from '@/lib/i18n';
import { usePromos } from '@/lib/promos';
import { useStores } from '@/lib/stores';
import type { Promo } from '@/lib/api';

export function PromoStrip() {
  const { t } = useI18n();
  const promos = usePromos();
  const { byId } = useStores();
  if (!promos.length) return null;

  // Una tarjeta por tienda, con sus promociones dentro.
  const porTienda = new Map<string, Promo[]>();
  for (const promo of promos) porTienda.set(promo.storeId, [...(porTienda.get(promo.storeId) ?? []), promo]);

  return (
    <View style={styles.zona}>
      {[...porTienda].map(([storeId, suyas]) => {
        const store = byId.get(storeId);
        const name = store?.name ?? storeId;
        return (
          <View key={storeId} style={styles.card}>
            <View style={styles.cabecera}>
              <StoreAvatar name={name} color={store?.color} size={34} />
              <T w={800} size={16} tight style={{ flex: 1 }}>{t('Hoy en {store}', { store: name })}</T>
            </View>

            {suyas.map((promo) => (
              <Pressable
                key={promo.id}
                onPress={() => router.navigate({
                  pathname: '/buscar',
                  params: promo.categories.length === 1
                    ? { categoria: promo.categories[0], t: String(Date.now()) }
                    : { t: String(Date.now()) },
                })}
                style={({ pressed }) => [styles.fila, pressed && { opacity: 0.6 }]}
                accessibilityRole="button"
                accessibilityLabel={promo.name}>
                <View style={styles.descuento}>
                  <T w={800} size={promo.discount ? 15 : 12} color="#fff" tight>
                    {promo.discount ? `−${promo.discount}%` : t('Hoy')}
                  </T>
                </View>
                <View style={{ flex: 1 }}>
                  <T w={600} size={14.5} numberOfLines={2}>{promo.name}</T>
                  {promo.terms ? <T size={11.5} color={C.muted} numberOfLines={2}>{t(promo.terms)}</T> : null}
                </View>
                <Icon name="next" size={18} color={C.muted} />
              </Pressable>
            ))}

            <T size={12} color={C.muted}>{t('Lo anuncia la tienda: confirma el descuento al pagar.')}</T>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  zona: { gap: 10, marginTop: 16, marginBottom: 18 },
  card: {
    gap: 10,
    marginHorizontal: PAD,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ffd9e0',
    borderRadius: R.lg,
    backgroundColor: C.promoSoft,
  },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: R.md,
    backgroundColor: '#fff',
  },
  descuento: {
    minWidth: 52,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 999,
    alignItems: 'center',
    backgroundColor: C.promo,
  },
});
