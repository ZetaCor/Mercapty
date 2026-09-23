// Inicio: la portada de la web en el celular.
import { router } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Icon } from '@/components/icons';

import { Brand } from '@/components/logo';
import { PiggyHello } from '@/components/piggy-hello';
import { ProductGrid } from '@/components/product-card';
import { PromoStrip } from '@/components/promo-strip';
import { LoadingPiggy } from '@/components/splash-overlay';
import { StoreMarquee } from '@/components/store-marquee';
import { T } from '@/components/text';
import { ErrorState, Note, SectionHead } from '@/components/ui';
import { C, PAD, R } from '@/constants/theme';
import { AdBanner } from '@/lib/ads';
import type { Category, Meta, ProductSummary, SearchResult } from '@/lib/api';
import { categoryIcon, categoryTint } from '@/lib/categories';
import { count, timeAgo } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useStores } from '@/lib/stores';
import { useFetch } from '@/lib/use-fetch';

// `t` cambia en cada toque: Buscar aplica los filtros aunque ya estuviera abierta.
const search = (params: Record<string, string> = {}) =>
  router.navigate({ pathname: '/buscar', params: { ...params, t: String(Date.now()) } });

export default function Inicio() {
  const insets = useSafeAreaInsets();
  const { t, category } = useI18n();
  const stores = useStores();
  const meta = useFetch<Meta>('/api/meta');
  const deals = useFetch<ProductSummary[]>('/api/deals?limit=8');
  const categories = useFetch<Category[]>('/api/categories');
  const all = useFetch<SearchResult>('/api/products?limit=12');

  const requests = [meta, deals, categories, all];
  const error = requests.find((r) => r.error && !r.data)?.error;
  const refresh = () => {
    requests.forEach((r) => r.refresh());
    stores.refresh();
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.brandRow}>
          <Brand size={19} />
          {/* Idioma, versión de la app y bienvenida viven juntos en Ajustes. */}
          <Pressable
            onPress={() => router.push('/ajustes')}
            style={({ pressed }) => [styles.settings, pressed && { backgroundColor: C.soft2 }]}
            accessibilityRole="button"
            accessibilityLabel={t('Ajustes')}>
            <Icon name="settings" size={20} color={C.text2} />
          </Pressable>
        </View>
        <View style={styles.searchRow}>
          <Pressable
            onPress={() => search({ focus: '1' })}
            style={styles.search}
            accessibilityRole="search"
            accessibilityLabel={t('Buscar productos')}>
            <Icon name="search" size={18} color={C.muted} />
            <T color={C.muted} numberOfLines={1} style={{ flexShrink: 1 }}>{t('Busca leche, arroz, café…')}</T>
          </Pressable>
          <Pressable
            onPress={() => router.push('/escanear')}
            style={({ pressed }) => [styles.scan, pressed && { backgroundColor: '#e2eaff' }]}
            accessibilityRole="button"
            accessibilityLabel={t('Escanear código de barras')}>
            <Icon name="barcode" size={21} color={C.brand} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} tintColor={C.brand} colors={[C.brand]} />}>
        {error ? (
          <ErrorState message={error.message} onRetry={refresh} />
        ) : !meta.data || !deals.data || !categories.data || !all.data ? (
          <LoadingPiggy />
        ) : (
          <>
            {meta.data.demo && (
              <View style={{ paddingHorizontal: PAD }}>
                <Note tone="warn">{t('Modo demostración: los precios son de ejemplo.')}</Note>
              </View>
            )}
            {/* Si hoy hay día de descuento, es lo primero de la portada; si no, el saludo. */}
            <PromoStrip />
            <Hero meta={meta.data} />

            <View style={styles.section}>
              <SectionHead title={t('Supermercados que comparamos')} action={t('Ver tiendas')} onAction={() => router.navigate('/tiendas')} />
              <StoreMarquee stores={stores.active} />
            </View>

            <View style={styles.section}>
              <SectionHead title={t('Categorías')} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cats}>
                {categories.data.map((c) => (
                  <Pressable
                    key={c.name}
                    onPress={() => search({ categoria: c.name })}
                    style={({ pressed }) => [styles.cat, pressed && { borderColor: C.border2 }]}
                    accessibilityRole="button">
                    <View style={[styles.catIcon, { backgroundColor: categoryTint(c.name) }]}>
                      <T size={26} style={{ lineHeight: 32 }}>{categoryIcon(c.name)}</T>
                    </View>
                    <T w={600} size={12.5} numberOfLines={2} style={{ textAlign: 'center', lineHeight: 16 }}>{category(c.name)}</T>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <View style={styles.section}>
              <SectionHead title={t('Donde más ahorras eligiendo bien')} action={t('Ver más')} onAction={() => search({ orden: 'ahorro' })} />
              <ProductGrid items={deals.data} />
            </View>

            <AdBanner style={styles.anuncio} />

            <View style={styles.section}>
              <SectionHead title={t('Productos')} action={t('Ver todos ({n})', { n: count(all.data.total) })} onAction={() => search()} />
              <ProductGrid items={all.data.items} />
            </View>

            <T size={12.5} color={C.muted} style={styles.legal}>
              {t('Los precios se toman de las webs de cada supermercado y pueden cambiar: confirma el precio final en la tienda antes de pagar. Mercapty no vende productos; la compra, el pago y la entrega se hacen en la tienda.')}
            </T>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// En la app no va el discurso de venta de la portada de la web: quien la abre ya la
// instaló, y la abre otra vez cada semana. Un saludo y los dos atajos de siempre. Cuántos
// productos y cuántas tiendas se comparan ya no se dicen aquí: de eso habla la franja de
// logos que va más abajo.
function Hero({ meta }: { meta: Meta }) {
  const { t } = useI18n();
  const hora = new Date().getHours();
  // De 6 de la mañana a 6 de la tarde es de día: sale el sol y se saluda con «días» o
  // «tardes». El resto es de noche, luna y «buenas noches» (también de madrugada).
  const dia = hora >= 6 && hora < 18;
  const saludo = !dia
    ? t('Hola, buenas noches')
    : hora < 12 ? t('Hola, buenos días') : t('Hola, buenas tardes');
  return (
    <View style={styles.hero}>
      {/* El sol y la luna van sueltos junto al saludo. Antes iban dentro de un círculo de
          color y a ese tamaño el emoji se veía plano, como un disco pintado. */}
      <View style={styles.saludoFila}>
        <T w={800} size={24} tight numberOfLines={1} style={{ flexShrink: 1 }} accessibilityRole="header">{saludo}</T>
        <T size={26} style={{ lineHeight: 32 }} accessibilityElementsHidden>{dia ? '☀️' : '🌙'}</T>
      </View>
      <View style={styles.saludo}>
        <PiggyHello size={62} />
        <View style={{ flex: 1, gap: 4 }}>
          <T w={700} size={16} color={C.brand}>{t('¿Qué vas a comprar hoy?')}</T>
          <T size={15} color={C.text2} style={{ lineHeight: 22 }}>
            {t('Arma tu canasta y te decimos en qué súper te costará menos.')}
          </T>
        </View>
      </View>
      <View style={styles.actions}>
        <Button title={t('Arma tu canasta')} variant="primary" size="lg" onPress={() => search()} />
        <Button title={t('Ver dónde se ahorra más')} size="lg" onPress={() => search({ orden: 'ahorro' })} />
      </View>
      <T size={12.5} color={C.muted}>{t('Precios actualizados {ago}', { ago: timeAgo(meta.updatedAt, t) })}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: {
    gap: 10,
    paddingHorizontal: PAD,
    paddingBottom: 10,
    backgroundColor: C.bg,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  settings: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: C.soft },
  searchRow: { flexDirection: 'row', gap: 10 },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: C.soft,
  },
  scan: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: C.brandSoft },
  content: { paddingTop: 16, paddingBottom: 32 },
  hero: {
    gap: 14,
    marginHorizontal: PAD,
    padding: 22,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.xl,
    backgroundColor: '#fff',
    experimental_backgroundImage:
      'radial-gradient(circle at 100% 0%, #e8efff 0%, rgba(232, 239, 255, 0) 60%), radial-gradient(circle at 0% 100%, #eafaf2 0%, rgba(234, 250, 242, 0) 55%)',
  },
  saludoFila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  saludo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  actions: { gap: 10, marginTop: 4 },
  section: { marginTop: 32 },
  cats: { gap: 12, paddingHorizontal: PAD, paddingVertical: 2 },
  cat: {
    width: 104,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.lg,
    backgroundColor: '#fff',
  },
  catIcon: { width: 50, height: 50, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  anuncio: { marginTop: 28 },
  legal: { marginTop: 32, paddingHorizontal: PAD, lineHeight: 19 },
});
