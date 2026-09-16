// Avisos al celular: permiso, token de Expo y qué quiere recibir cada persona. El servidor
// guarda el token junto con esas preferencias y con los productos de «Mi lista», y los bots
// envían los avisos después de cada corrida (scripts/notify.js). No hay cuentas: el token
// es el único dato, y se borra al apagar todos los avisos.
//
// No funciona en Expo Go (desde el SDK 53 no recibe push) ni en la versión web: ahí la
// pantalla de Ajustes lo explica en vez de ofrecer el botón.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { createContext, use, useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { postJson } from './api';
import { useI18n } from './i18n';
import { useList } from './list';

export type Prefs = { lista: boolean; promos: boolean; ofertas: boolean };

// Lo de la lista y el día de descuento vienen encendidos; las ofertas del día, apagadas:
// son las que más avisan y conviene que cada quien las prenda.
const DEFAULT_PREFS: Prefs = { lista: true, promos: true, ofertas: false };
const KEY = 'mercapty:notificaciones';

export const CAN_NOTIFY = Platform.OS !== 'web' && Constants.executionEnvironment !== 'storeClient';

// Con la app abierta, el aviso se muestra arriba pero sin sonido ni globo en el ícono.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

type Estado = 'cargando' | 'no-disponible' | 'sin-permiso' | 'negado' | 'activo';

type NotificationsApi = {
  estado: Estado;
  prefs: Prefs;
  activar(): Promise<void>;
  setPref(key: keyof Prefs, value: boolean): void;
};

const NotificationsContext = createContext<NotificationsApi>({
  estado: 'no-disponible',
  prefs: DEFAULT_PREFS,
  activar: async () => {},
  setPref: () => {},
});

async function getToken() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Mercapty',
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: '#1d4ed8',
    });
  }
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return null;
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  return data;
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { lang } = useI18n();
  const { items } = useList();
  const [estado, setEstado] = useState<Estado>(CAN_NOTIFY ? 'cargando' : 'no-disponible');
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const token = useRef<string | null>(null);

  // Se guarda en el servidor el token con lo que quiere recibir y los productos que sigue.
  const registrar = (next: Prefs, ids: number[]) => {
    if (!token.current) return;
    const nada = !next.lista && !next.promos && !next.ofertas;
    postJson('/api/devices', nada
      ? { token: token.current, remove: true }
      : { token: token.current, platform: Platform.OS, lang, prefs: next, products: ids },
    ).catch(() => {});
  };

  // Al abrir: si ya se dio el permiso antes, se renueva el token en silencio.
  useEffect(() => {
    if (!CAN_NOTIFY) return;
    let vivo = true;
    (async () => {
      const guardadas = await AsyncStorage.getItem(KEY).catch(() => null);
      const prefsGuardadas: Prefs = guardadas ? { ...DEFAULT_PREFS, ...JSON.parse(guardadas) } : DEFAULT_PREFS;
      if (!vivo) return;
      setPrefs(prefsGuardadas);
      const { status } = await Notifications.getPermissionsAsync();
      if (!vivo) return;
      if (status !== 'granted') return setEstado(status === 'denied' ? 'negado' : 'sin-permiso');
      token.current = await getToken().catch(() => null);
      if (!vivo) return;
      setEstado(token.current ? 'activo' : 'sin-permiso');
    })();
    return () => { vivo = false; };
  }, []);

  // Cada vez que cambia «Mi lista», el servidor necesita saber qué productos seguir.
  const listaKey = items.map((i) => i.productId).join(',');
  useEffect(() => {
    if (estado === 'activo' && prefs.lista) registrar(prefs, items.map((i) => i.productId));
  }, [listaKey, estado]);

  const api: NotificationsApi = {
    estado,
    prefs,
    activar: async () => {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') return setEstado('negado');
      token.current = await getToken().catch(() => null);
      setEstado(token.current ? 'activo' : 'sin-permiso');
      registrar(prefs, items.map((i) => i.productId));
    },
    setPref: (key, value) => {
      const next = { ...prefs, [key]: value };
      setPrefs(next);
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      registrar(next, items.map((i) => i.productId));
    },
  };

  return <NotificationsContext value={api}>{children}</NotificationsContext>;
}

export const useNotifications = () => use(NotificationsContext);

// Tocar un aviso abre lo que trae dentro: normalmente la ficha de un producto.
export function useNotificationTaps() {
  useEffect(() => {
    if (!CAN_NOTIFY) return;
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const path = response.notification.request.content.data?.path;
      if (typeof path === 'string' && path.startsWith('/')) router.push(path as never);
    });
    return () => sub.remove();
  }, []);
}
