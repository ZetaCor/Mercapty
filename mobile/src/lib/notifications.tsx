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
import { AppState, Linking, Platform } from 'react-native';

import { postJson } from './api';
import { useI18n } from './i18n';
import { useList } from './list';
import { useOnboarding } from './onboarding';

export type Prefs = { lista: boolean; promos: boolean; ofertas: boolean };

// Lo de la lista y el día de descuento vienen encendidos; las ofertas del día, apagadas:
// son las que más avisan y conviene que cada quien las prenda.
const DEFAULT_PREFS: Prefs = { lista: true, promos: true, ofertas: false };
const KEY = 'mercapty:notificaciones';
const KEY_PEDIDO = 'mercapty:avisos-pedidos';

// Cuánto espera el permiso después de abrir la app por primera vez: lo justo para que se vea
// la portada detrás y el cuadro del sistema no caiga encima del cerdito del arranque.
const ESPERA_PRIMERA_VEZ = 2000;

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
  // false cuando el teléfono ya no deja volver a preguntar: solo queda ir a sus ajustes.
  sePuedePreguntar: boolean;
  activar(): Promise<void>;
  abrirAjustesDelTelefono(): void;
  setPref(key: keyof Prefs, value: boolean): void;
};

const NotificationsContext = createContext<NotificationsApi>({
  estado: 'no-disponible',
  prefs: DEFAULT_PREFS,
  sePuedePreguntar: false,
  activar: async () => {},
  abrirAjustesDelTelefono: () => {},
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
  const { seen } = useOnboarding();
  const [estado, setEstado] = useState<Estado>(CAN_NOTIFY ? 'cargando' : 'no-disponible');
  const [sePuedePreguntar, setSePuedePreguntar] = useState(true);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const token = useRef<string | null>(null);
  // Copias para los avisos que llegan tarde (el permiso que se pide a los dos segundos, o el
  // regreso de los ajustes del teléfono): ahí ya no sirve lo que había al dibujar.
  const prefsRef = useRef<Prefs>(DEFAULT_PREFS);
  const idsRef = useRef<number[]>([]);
  const ids = items.map((i) => i.productId);
  const listaKey = ids.join(',');
  useEffect(() => { idsRef.current = ids; }, [listaKey]);

  // Se guarda en el servidor el token con lo que quiere recibir y los productos que sigue.
  const registrar = (next: Prefs, productos = idsRef.current) => {
    if (!token.current) return;
    const nada = !next.lista && !next.promos && !next.ofertas;
    postJson('/api/devices', nada
      ? { token: token.current, remove: true }
      : { token: token.current, platform: Platform.OS, lang, prefs: next, products: productos },
    ).catch(() => {});
  };

  // Mira cómo quedó el permiso y, si está dado, saca el token. Se usa al abrir la app, al
  // volver de los ajustes del teléfono y después de preguntar.
  const revisarPermiso = async (status: Notifications.PermissionStatus, puedePreguntar: boolean) => {
    setSePuedePreguntar(puedePreguntar);
    if (status !== 'granted') {
      setEstado(status === 'denied' ? 'negado' : 'sin-permiso');
      return false;
    }
    token.current = await getToken().catch(() => null);
    setEstado(token.current ? 'activo' : 'sin-permiso');
    return Boolean(token.current);
  };

  const pedirPermiso = async () => {
    const { status, canAskAgain } = await Notifications.requestPermissionsAsync();
    AsyncStorage.setItem(KEY_PEDIDO, '1').catch(() => {});
    if (await revisarPermiso(status, canAskAgain)) registrar(prefsRef.current);
  };

  // Al abrir: si ya se dio el permiso antes, se renueva el token en silencio.
  useEffect(() => {
    if (!CAN_NOTIFY) return;
    let vivo = true;
    (async () => {
      const guardadas = await AsyncStorage.getItem(KEY).catch(() => null);
      const prefsGuardadas: Prefs = guardadas ? { ...DEFAULT_PREFS, ...JSON.parse(guardadas) } : DEFAULT_PREFS;
      if (!vivo) return;
      prefsRef.current = prefsGuardadas;
      setPrefs(prefsGuardadas);
      const { status, canAskAgain } = await Notifications.getPermissionsAsync();
      if (!vivo) return;
      await revisarPermiso(status, canAskAgain);
    })();
    return () => { vivo = false; };
  }, []);

  // La primera vez que se abre la app, ya pasada la bienvenida, el permiso se pide solo: es
  // cuando se entiende para qué sirve, y así nadie tiene que ir a buscarlo a Ajustes. Se
  // pregunta una sola vez; si dice que no, no se insiste nunca más.
  useEffect(() => {
    if (!CAN_NOTIFY || !seen || estado !== 'sin-permiso') return;
    let vivo = true;
    let timer: ReturnType<typeof setTimeout>;
    AsyncStorage.getItem(KEY_PEDIDO)
      .then((pedido) => {
        if (pedido || !vivo) return;
        timer = setTimeout(() => { if (vivo) pedirPermiso(); }, ESPERA_PRIMERA_VEZ);
      })
      .catch(() => {});
    return () => { vivo = false; clearTimeout(timer); };
  }, [seen, estado]);

  // Al volver de los ajustes del teléfono (o de donde sea), se vuelve a mirar el permiso: si
  // lo acaba de dar, los avisos se encienden solos, sin tocar nada más en la app.
  useEffect(() => {
    if (!CAN_NOTIFY || estado === 'activo' || estado === 'cargando') return;
    const sub = AppState.addEventListener('change', async (state) => {
      if (state !== 'active') return;
      const { status, canAskAgain } = await Notifications.getPermissionsAsync();
      if (await revisarPermiso(status, canAskAgain)) registrar(prefsRef.current);
    });
    return () => sub.remove();
  }, [estado]);

  // Cada vez que cambia «Mi lista», el servidor necesita saber qué productos seguir.
  useEffect(() => {
    if (estado === 'activo' && prefs.lista) registrar(prefs, ids);
  }, [listaKey, estado]);

  const api: NotificationsApi = {
    estado,
    prefs,
    sePuedePreguntar,
    activar: pedirPermiso,
    abrirAjustesDelTelefono: () => { Linking.openSettings().catch(() => {}); },
    setPref: (key, value) => {
      const next = { ...prefs, [key]: value };
      prefsRef.current = next;
      setPrefs(next);
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      registrar(next, ids);
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
