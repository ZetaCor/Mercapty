// Actualizaciones de la app sin pasar por la tienda: EAS Update publica una versión nueva
// del código (`npx eas update`), la app la descarga sola y aquí se avisa para aplicarla.
// En Expo Go y en desarrollo no hay actualizaciones: Updates.isEnabled es falso.
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from './button';
import { Icon } from './icons';
import { T } from './text';

import { C, shadow } from '@/constants/theme';
import { useI18n } from '@/lib/i18n';

// Al volver a la app se vuelve a preguntar, pero no más seguido que esto.
const CHECK_EVERY = 15 * 60 * 1000;

export const appVersion = Constants.expoConfig?.version ?? '—';

// En Expo Go, en desarrollo y en la versión web no hay actualizaciones que aplicar.
const SE_ACTUALIZA = Updates.isEnabled && Platform.OS !== 'web';

// Busca una versión nueva al abrir la app y cada vez que se vuelve a ella, y la deja
// descargada para que aplicarla sea instantáneo.
function useAppUpdates() {
  const { isUpdateAvailable, isUpdatePending } = Updates.useUpdates();
  const lastCheck = useRef(Date.now());

  useEffect(() => {
    if (!SE_ACTUALIZA) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || Date.now() - lastCheck.current < CHECK_EVERY) return;
      lastCheck.current = Date.now();
      Updates.checkForUpdateAsync().catch(() => {});
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (SE_ACTUALIZA && isUpdateAvailable) Updates.fetchUpdateAsync().catch(() => {});
  }, [isUpdateAvailable]);

  return { descargada: isUpdatePending };
}

// Aviso al pie, como el de «Agregado a tu lista»: aparece cuando la versión nueva ya está
// descargada. Nunca interrumpe: si no se toca, se aplica sola la próxima vez que se abra.
export function UpdateBanner() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { descargada } = useAppUpdates();
  const [aplicando, setAplicando] = useState(false);

  if (!descargada) return null;
  const aplicar = () => {
    setAplicando(true);
    Updates.reloadAsync().catch(() => setAplicando(false));
  };

  return (
    <Animated.View
      entering={FadeInDown.duration(260)}
      exiting={FadeOut.duration(200)}
      style={[styles.wrap, { bottom: insets.bottom + 92 }]}>
      <View style={styles.banner}>
        <Icon name="download" size={18} color="#fff" />
        <T w={500} color="#fff" numberOfLines={2} style={{ flexShrink: 1 }} accessibilityLiveRegion="polite">
          {t('Hay una versión nueva de Mercapty')}
        </T>
        <Pressable onPress={aplicar} disabled={aplicando} hitSlop={8} accessibilityRole="button" style={styles.action}>
          {aplicando ? <ActivityIndicator color="#fff" size="small" /> : <T w={700} color="#fff">{t('Actualizar')}</T>}
        </Pressable>
      </View>
    </Animated.View>
  );
}

type Estado = 'inicio' | 'buscando' | 'sin-nada' | 'descargando' | 'lista' | 'error';

// Versión instalada y botón para buscar actualizaciones a mano (en Tiendas).
export function UpdateStatus() {
  const { t } = useI18n();
  const { isUpdatePending } = Updates.useUpdates();
  const [estado, setEstado] = useState<Estado>('inicio');
  const lista = estado === 'lista' || isUpdatePending;

  const buscar = async () => {
    setEstado('buscando');
    try {
      const { isAvailable } = await Updates.checkForUpdateAsync();
      if (!isAvailable) return setEstado('sin-nada');
      setEstado('descargando');
      await Updates.fetchUpdateAsync();
      setEstado('lista');
    } catch {
      setEstado('error');
    }
  };

  const aviso = {
    inicio: null,
    buscando: t('Buscando…'),
    'sin-nada': t('Ya tienes la última versión'),
    descargando: t('Descargando…'),
    lista: null,
    error: t('No se pudo comprobar. Intenta más tarde.'),
  }[estado];

  return (
    <View style={{ gap: 10 }}>
      <T size={14} color={C.muted}>{t('Mercapty {version}', { version: appVersion })}</T>
      {!SE_ACTUALIZA ? (
        <T size={13.5} color={C.muted}>{t('Las actualizaciones llegan solas en la app instalada.')}</T>
      ) : (
        <>
          {lista ? (
            <Button title={t('Actualizar ahora')} icon="download" variant="primary" onPress={() => Updates.reloadAsync()} />
          ) : (
            <Button
              title={t('Buscar actualizaciones')}
              icon="download"
              onPress={buscar}
              disabled={estado === 'buscando' || estado === 'descargando'}
            />
          )}
          {aviso && <T size={13.5} color={C.muted}>{aviso}</T>}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center', zIndex: 950 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    maxWidth: 420,
    paddingVertical: 11,
    paddingLeft: 16,
    paddingRight: 14,
    borderRadius: 999,
    backgroundColor: C.brand,
    boxShadow: shadow,
  },
  action: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, backgroundColor: 'rgba(255, 255, 255, 0.18)' },
});
