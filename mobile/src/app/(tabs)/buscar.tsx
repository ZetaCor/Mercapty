// Buscar: por nombre, marca o código de barras, con filtro de categoría y orden,
// como /buscar de la web. Busca mientras escribes y carga más al llegar al final.
// En inglés también funciona: el servidor entiende «milk», «eggs», «rice»…
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icons';
import { ProductCard, useGridCardWidth } from '@/components/product-card';
import { LoadingPiggy } from '@/components/splash-overlay';
import { T } from '@/components/text';
import { EmptyState, ErrorState, Note } from '@/components/ui';
import { C, F, PAD } from '@/constants/theme';
import { getJson, type Category, type SearchResult } from '@/lib/api';
import { categoryIcon } from '@/lib/categories';
import { count } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useFetch } from '@/lib/use-fetch';

const PAGE = 24;
const SORTS = [
  ['relevancia', 'Más relevantes'],
  ['nombre', 'Nombre'],
  ['precio', 'Menor precio'],
  ['ahorro', 'Mayor ahorro entre tiendas'],
] as const;

type Params = { q?: string; categoria?: string; orden?: string; focus?: string; t?: string };
type Results = SearchResult & { url: string };

export default function Buscar() {
  const params = useLocalSearchParams<Params>();
  const insets = useSafeAreaInsets();
  const { t, category } = useI18n();
  const cardWidth = useGridCardWidth();
  const input = useRef<TextInput>(null);
  const categories = useFetch<Category[]>('/api/categories').data ?? [];

  const [text, setText] = useState(params.q ?? '');
  const [q, setQ] = useState(params.q ?? '');
  const [categoria, setCategoria] = useState(params.categoria ?? '');
  const [orden, setOrden] = useState(params.orden ?? 'relevancia');
  const [sortOpen, setSortOpen] = useState(false);

  // Llegar desde la portada (categoría, «Ver más», la barra de búsqueda) reemplaza los filtros.
  useEffect(() => {
    if (!params.t) return;
    setText(params.q ?? '');
    setQ(params.q ?? '');
    setCategoria(params.categoria ?? '');
    setOrden(params.orden ?? 'relevancia');
    if (params.focus) setTimeout(() => input.current?.focus(), 250);
  }, [params.t]);

  // Busca 0.4 s después de la última letra.
  useEffect(() => {
    const timer = setTimeout(() => setQ(text.trim()), 400);
    return () => clearTimeout(timer);
  }, [text]);

  const url = `/api/products?q=${encodeURIComponent(q)}&categoria=${encodeURIComponent(categoria)}&orden=${orden}&limit=${PAGE}`;
  const [results, setResults] = useState<Results | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [retry, setRetry] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let alive = true;
    setError(null);
    getJson<SearchResult>(`${url}&offset=0`).then(
      (r) => alive && setResults({ ...r, url }),
      (err: Error) => alive && setError(err),
    );
    return () => {
      alive = false;
    };
  }, [url, retry]);

  const current = results?.url === url ? results : null;
  const loadMore = () => {
    if (!current || loadingMore || current.items.length >= current.total) return;
    setLoadingMore(true);
    getJson<SearchResult>(`${url}&offset=${current.items.length}`)
      .then((r) =>
        setResults((prev) => {
          if (!prev || prev.url !== url) return prev;
          const seen = new Set(prev.items.map((i) => i.id));
          return { ...prev, items: [...prev.items, ...r.items.filter((i) => !seen.has(i.id))] };
        }),
      )
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  };

  const title = q ? t('Resultados para «{q}»', { q }) : categoria ? category(categoria) : t('Todos los productos');
  const sortLabel = t(SORTS.find(([value]) => value === orden)?.[1] ?? SORTS[0][1]);

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.search}>
          <Icon name="search" size={18} color={C.muted} />
          <TextInput
            ref={input}
            value={text}
            onChangeText={setText}
            onSubmitEditing={() => setQ(text.trim())}
            placeholder={t('Busca leche, arroz, café…')}
            placeholderTextColor={C.muted}
            returnKeyType="search"
            autoCorrect={false}
            style={styles.input}
            accessibilityLabel={t('Buscar productos')}
          />
          {text ? (
            <Pressable onPress={() => setText('')} hitSlop={10} accessibilityLabel={t('Borrar búsqueda')}>
              <Icon name="close" size={18} color={C.muted} />
            </Pressable>
          ) : (
            <Pressable
              onPress={() => router.push('/escanear')}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('Escanear código de barras')}>
              <Icon name="barcode" size={21} color={C.brand} />
            </Pressable>
          )}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
          {[{ name: '', count: 0 }, ...categories].map((c) => {
            const active = categoria === c.name;
            return (
              <Pressable
                key={c.name || 'todo'}
                onPress={() => setCategoria(c.name)}
                style={[styles.chip, active && styles.chipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}>
                <T w={500} size={14} color={active ? '#fff' : C.text2}>
                  {c.name ? `${categoryIcon(c.name)} ${category(c.name)}` : t('Todo')}
                </T>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {error && !current ? (
        <ErrorState message={error.message} onRetry={() => setRetry((n) => n + 1)} />
      ) : !current ? (
        <LoadingPiggy />
      ) : (
        <FlatList
          data={current.items}
          keyExtractor={(item) => String(item.id)}
          numColumns={2}
          renderItem={({ item }) => <ProductCard item={item} width={cardWidth} />}
          columnWrapperStyle={styles.row}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.6}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 32 }}
          ListHeaderComponent={
            <View style={styles.listHead}>
              <View style={styles.titleRow}>
                <View style={{ flex: 1 }}>
                  <T w={800} size={22} tight numberOfLines={2} accessibilityRole="header">{title}</T>
                  <T size={13.5} color={C.muted}>
                    {current.total === 1 ? t('1 producto') : t('{n} productos', { n: count(current.total) })}
                  </T>
                </View>
                <Pressable onPress={() => setSortOpen((open) => !open)} style={styles.sortButton} accessibilityRole="button">
                  <T w={600} size={13.5} color={C.text2}>{sortLabel}</T>
                  <Icon name="down" size={16} color={C.text2} />
                </Pressable>
              </View>
              {sortOpen && (
                <View style={styles.sortMenu}>
                  {SORTS.map(([value, label]) => (
                    <Pressable
                      key={value}
                      onPress={() => {
                        setOrden(value);
                        setSortOpen(false);
                      }}
                      style={styles.sortOption}
                      accessibilityRole="button"
                      accessibilityState={{ selected: value === orden }}>
                      <T w={value === orden ? 700 : 500} color={value === orden ? C.brand : C.text}>{t(label)}</T>
                      {value === orden && <Icon name="check" size={18} color={C.brand} />}
                    </Pressable>
                  ))}
                </View>
              )}
              {current.approximate && (
                <Note tone="soft">{t('No encontramos productos con todas las palabras de «{q}». Te mostramos los más parecidos.', { q })}</Note>
              )}
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              emoji="🔎"
              title={t('No encontramos productos para esa búsqueda')}
              text={t('Prueba con otra palabra (por ejemplo «leche», «arroz» o una marca) o mira todo el catálogo.')}
              action={q || categoria ? t('Ver todo el catálogo') : undefined}
              onAction={() => {
                setText('');
                setQ('');
                setCategoria('');
              }}
            />
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator color={C.brand} style={{ marginTop: 20 }} /> : null}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { gap: 10, paddingBottom: 10, backgroundColor: C.bg, borderBottomWidth: 1, borderBottomColor: C.border },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: PAD,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: C.soft,
  },
  input: { flex: 1, paddingVertical: 12, fontFamily: F[400], fontSize: 15, color: C.text },
  chips: { gap: 8, paddingHorizontal: PAD },
  chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: '#fff' },
  chipActive: { backgroundColor: C.text, borderColor: C.text },
  listHead: { paddingHorizontal: PAD, paddingTop: 16, paddingBottom: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  sortMenu: { marginTop: 10, borderWidth: 1, borderColor: C.border, borderRadius: 14, overflow: 'hidden' },
  sortOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderTopColor: C.border,
    marginTop: -1,
  },
  row: { gap: 12, paddingHorizontal: PAD },
});
