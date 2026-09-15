// Tiendas: cuántos productos tiene cada súper, en cuántos gana y cuántas visitas le enviamos.
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, openLink } from '@/components/button';
import { ContactList, openExternal, whatsappWith } from '@/components/contact';
import { LoadingPiggy } from '@/components/splash-overlay';
import { StoreAvatar, StoreLogo } from '@/components/store-avatar';
import { T } from '@/components/text';
import { ErrorState } from '@/components/ui';
import { C, PAD, R } from '@/constants/theme';
import type { Meta, Store } from '@/lib/api';
import { count, timeAgo } from '@/lib/format';
import { useOnboarding } from '@/lib/onboarding';
import { useFetch } from '@/lib/use-fetch';

const MERCHANT_MESSAGE = 'Hola, tengo un supermercado y quiero aparecer en Mercapty.';

const SOURCE_LABEL: Record<string, string> = {
  vtex: 'precios de su web',
  woocommerce: 'precios de su web',
  feed: 'inventario compartido',
};

export default function Tiendas() {
  const insets = useSafeAreaInsets();
  const { data: stores, error, refresh } = useFetch<Store[]>('/api/stores');
  const { reset } = useOnboarding();
  const contact = useFetch<Meta>('/api/meta').data?.contact ?? {};
  const { whatsapp, email } = contact;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <T w={800} size={26} tight accessibilityRole="header">Tiendas</T>
        <T size={13.5} color={C.muted}>Supermercados que Mercapty compara hoy.</T>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} tintColor={C.brand} colors={[C.brand]} />}>
        {error && !stores ? (
          <ErrorState message={error.message} onRetry={refresh} />
        ) : !stores ? (
          <LoadingPiggy />
        ) : (
          <>
            {stores.map((s) => (
              <View key={s.id} style={styles.card}>
                <View style={styles.head}>
                  {s.logo ? <StoreLogo store={s} small /> : <StoreAvatar name={s.name} color={s.color} size={42} />}
                  <View style={{ flex: 1 }}>
                    <T w={700} size={16}>{s.name}</T>
                    <T size={12.5} color={C.muted}>{s.platform ?? '—'} · {SOURCE_LABEL[s.source] ?? s.source}</T>
                  </View>
                </View>
                <View style={styles.stats}>
                  <Stat value={s.offers} label="productos" />
                  <Stat value={s.bestCount} label="mejor precio" />
                  <Stat value={s.clicks} label={s.clicks === 1 ? 'visita enviada' : 'visitas enviadas'} />
                </View>
                <View style={styles.foot}>
                  <T size={12.5} color={C.muted}>Actualizado {timeAgo(s.updatedAt)}</T>
                  <Button title="Visitar tienda" iconRight="external" size="sm" onPress={() => openLink(s.homepage)} />
                </View>
              </View>
            ))}
            <View style={styles.cta}>
              <T w={700} size={18} tight>¿Tienes un supermercado o minisúper?</T>
              <T size={14.5} color={C.text2} style={{ lineHeight: 21 }}>
                Comparte tu inventario con Mercapty en un archivo CSV o Excel (código de barras, nombre, marca,
                presentación, precio, disponibilidad, enlace y foto) y apareces en las comparaciones. Los clientes
                llegan directo a tu tienda en línea para comprar.
              </T>
              {(whatsapp || email) && (
                <View style={styles.ctaActions}>
                  {whatsapp && (
                    <Button
                      title="Escríbenos por WhatsApp"
                      icon="whatsapp"
                      variant="primary"
                      onPress={() => openExternal(whatsappWith(whatsapp, MERCHANT_MESSAGE))}
                    />
                  )}
                  {email && (
                    <Button
                      title="Enviar un correo"
                      icon="mail"
                      onPress={() => openExternal(`${email.url}?subject=${encodeURIComponent('Quiero sumar mi tienda a Mercapty')}`)}
                    />
                  )}
                </View>
              )}
            </View>
            {Object.keys(contact).length > 0 && (
              <View style={styles.contact}>
                <T w={700} size={18} tight accessibilityRole="header">Contacto y redes</T>
                <ContactList contact={contact} />
              </View>
            )}
            <Pressable onPress={reset} hitSlop={10} style={{ alignSelf: 'center', marginTop: 24 }} accessibilityRole="button">
              <T w={600} size={13.5} color={C.muted}>Ver la bienvenida otra vez</T>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <T w={800} size={17} tight>{count(value)}</T>
      <T size={11} color={C.muted}>{label}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: PAD, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  content: { gap: 14, padding: PAD, paddingBottom: 40 },
  card: { gap: 14, padding: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: C.border, borderRadius: R.lg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, paddingVertical: 9, paddingHorizontal: 10, borderRadius: 12, backgroundColor: C.soft },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  cta: { gap: 6, marginTop: 10, padding: 20, borderRadius: R.xl, backgroundColor: C.brandSoft, borderWidth: 1, borderColor: '#dbe5ff' },
  ctaActions: { gap: 8, marginTop: 10 },
  contact: { gap: 10, marginTop: 14 },
});
