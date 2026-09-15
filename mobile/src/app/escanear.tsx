// Escanear el código de barras de un producto (o un QR con un enlace de Mercapty) para ver
// su precio en cada tienda. La búsqueda por código ya existe en la API: el código se busca
// dentro del GTIN-14 que guarda cada producto.
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Icon } from '@/components/icons';
import { T } from '@/components/text';
import { C } from '@/constants/theme';
import { getJson, type SearchResult } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

type Status =
  | { kind: 'scanning' }
  | { kind: 'searching'; code: string }
  | { kind: 'notFound'; code: string }
  | { kind: 'error'; message: string };

// UPC-E (8 dígitos, en paquetes pequeños) -> UPC-A, que es como lo publican las tiendas.
function upcEToUpcA(upce: string) {
  const [ns, d1, d2, d3, d4, d5, d6, check] = upce;
  if (d6 <= '2') return `${ns}${d1}${d2}${d6}0000${d3}${d4}${d5}${check}`;
  if (d6 === '3') return `${ns}${d1}${d2}${d3}00000${d4}${d5}${check}`;
  if (d6 === '4') return `${ns}${d1}${d2}${d3}${d4}00000${d5}${check}`;
  return `${ns}${d1}${d2}${d3}${d4}${d5}0000${d6}${check}`;
}

// Qué leyó la cámara: un enlace a un producto de Mercapty o un código de barras.
function readCode({ type, data }: BarcodeScanningResult): { productId?: string; code?: string } {
  const link = /\/producto\/(\d+)/.exec(data);
  if (link) return { productId: link[1] };
  let digits = data.replace(/\D/g, '');
  if (type === 'upc_e' && digits.length === 8) digits = upcEToUpcA(digits);
  if (digits.length < 8 || digits.length > 14) return {};
  // Sin ceros de más a la izquierda: se busca dentro del GTIN-14 guardado.
  return { code: digits.replace(/^0+(?=\d{8})/, '') };
}

export default function Escanear() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const still = useReducedMotion();
  const [permission, requestPermission] = useCameraPermissions();
  const [status, setStatus] = useState<Status>({ kind: 'scanning' });
  const [torch, setTorch] = useState(false);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const searchByName = () => {
    router.dismiss();
    router.navigate({ pathname: '/buscar', params: { focus: '1', t: String(Date.now()) } });
  };

  async function onScan(result: BarcodeScanningResult) {
    if (status.kind !== 'scanning') return;
    const { productId, code } = readCode(result);
    if (!productId && !code) return; // sigue buscando un código que sirva
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (productId) return router.replace({ pathname: '/producto/[id]', params: { id: productId } });
    const found = code as string;
    setStatus({ kind: 'searching', code: found });
    try {
      const r = await getJson<SearchResult>(`/api/products?q=${found}&limit=5`);
      if (r.total === 0) return setStatus({ kind: 'notFound', code: found });
      if (r.total === 1) return router.replace({ pathname: '/producto/[id]', params: { id: String(r.items[0].id) } });
      // El mismo código en varias presentaciones (unidad y paquete): se ven todas en Buscar.
      router.dismiss();
      router.navigate({ pathname: '/buscar', params: { q: found, t: String(Date.now()) } });
    } catch (err) {
      setStatus({ kind: 'error', message: (err as Error).message });
    }
  }

  // Recuadro para el código: más ancho que alto, como un código de barras.
  const frameW = Math.min(width * 0.8, 340);
  const frameH = frameW * 0.62;
  const frameTop = (height - frameH) / 2 - 40;

  if (!permission) return <View style={styles.black} />;

  if (!permission.granted) {
    return (
      <View style={[styles.permission, { paddingTop: insets.top + 12 }]}>
        <StatusBar style="dark" />
        <Pressable onPress={close} hitSlop={12} style={styles.closeDark} accessibilityRole="button" accessibilityLabel={t('Cerrar')}>
          <Icon name="close" size={24} color={C.text} />
        </Pressable>
        <View style={styles.permissionBody}>
          <View style={styles.permissionIcon}>
            <Icon name="barcode" size={40} color={C.brand} />
          </View>
          <T w={800} size={22} tight style={styles.center}>{t('Escanear código de barras')}</T>
          <T color={C.text2} style={styles.center}>{t('Para leer el código de barras necesitamos la cámara.')}</T>
          {permission.canAskAgain ? (
            <Button title={t('Permitir cámara')} variant="primary" size="lg" onPress={requestPermission} />
          ) : (
            <Button title={t('Abrir ajustes')} variant="primary" size="lg" onPress={() => Linking.openSettings().catch(() => {})} />
          )}
          <Button title={t('Buscar por nombre')} onPress={searchByName} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.black}>
      <StatusBar style="light" />
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'qr'] }}
        onBarcodeScanned={status.kind === 'scanning' ? onScan : undefined}
      />

      {/* Oscurece todo menos el recuadro. */}
      <View
        style={[
          StyleSheet.absoluteFill,
          styles.shade,
          { borderTopWidth: frameTop, borderBottomWidth: height - frameTop - frameH, borderLeftWidth: (width - frameW) / 2, borderRightWidth: (width - frameW) / 2 },
        ]}
      />
      <View style={[styles.frame, { top: frameTop, left: (width - frameW) / 2, width: frameW, height: frameH }]}>
        {status.kind === 'scanning' && (
          <Animated.View
            style={[
              styles.line,
              !still && {
                animationName: { from: { transform: [{ translateY: 12 }] }, to: { transform: [{ translateY: frameH - 14 }] } },
                animationDuration: 1600,
                animationIterationCount: 'infinite',
                animationDirection: 'alternate',
                animationTimingFunction: 'ease-in-out',
              },
            ]}
          />
        )}
      </View>

      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={close} hitSlop={12} style={styles.round} accessibilityRole="button" accessibilityLabel={t('Cerrar')}>
          <Icon name="close" size={22} color="#fff" />
        </Pressable>
        <Pressable
          onPress={() => setTorch((on) => !on)}
          hitSlop={12}
          style={[styles.round, torch && { backgroundColor: '#fff' }]}
          accessibilityRole="switch"
          accessibilityState={{ checked: torch }}
          accessibilityLabel={t('Linterna')}>
          <Icon name="flash" size={20} color={torch ? C.text : '#fff'} />
        </Pressable>
      </View>

      <View style={[styles.bottom, { top: frameTop + frameH + 24, paddingBottom: insets.bottom + 24 }]}>
        {status.kind === 'scanning' && (
          <T w={600} size={16} color="#fff" style={styles.center}>{t('Apunta al código de barras del producto')}</T>
        )}
        {status.kind === 'searching' && (
          <View style={styles.pill}>
            <ActivityIndicator color={C.brand} />
            <T w={600}>{t('Buscando {code}…', { code: status.code })}</T>
          </View>
        )}
        {(status.kind === 'notFound' || status.kind === 'error') && (
          <View style={styles.card}>
            {status.kind === 'notFound' ? (
              <>
                <T w={800} size={17} tight>{t('No encontramos el código {code}', { code: status.code })}</T>
                <T size={14} color={C.text2}>{t('Todavía no tenemos ese producto en ninguna tienda. Prueba buscándolo por nombre.')}</T>
              </>
            ) : (
              <T w={700}>{t(status.message)}</T>
            )}
            <View style={styles.actions}>
              <Button title={t('Escanear otro')} variant="primary" style={{ flex: 1 }} onPress={() => setStatus({ kind: 'scanning' })} />
              <Button title={t('Buscar por nombre')} style={{ flex: 1 }} lines={2} onPress={searchByName} />
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  black: { flex: 1, backgroundColor: '#000' },
  shade: { borderColor: 'rgba(0, 0, 0, 0.55)' },
  frame: { position: 'absolute', borderWidth: 3, borderColor: '#fff', borderRadius: 22, overflow: 'hidden' },
  line: { position: 'absolute', left: 14, right: 14, top: 0, height: 2, borderRadius: 2, backgroundColor: '#22c55e' },
  topBar: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.45)' },
  bottom: { position: 'absolute', left: 20, right: 20, alignItems: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 999, backgroundColor: '#fff' },
  card: { alignSelf: 'stretch', gap: 8, padding: 18, borderRadius: 20, backgroundColor: '#fff' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  center: { textAlign: 'center' },
  permission: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 24 },
  closeDark: { alignSelf: 'flex-start', padding: 4 },
  permissionBody: { flex: 1, justifyContent: 'center', alignItems: 'stretch', gap: 14, paddingBottom: 60 },
  permissionIcon: { alignSelf: 'center', width: 84, height: 84, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: C.brandSoft },
});
