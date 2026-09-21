// Tiro al chanchito: un juego corto dentro de la app, ahora con premio al final.
//
// El cerdito cruza la cancha con su moneda. Se arrastra el dedo hacia abajo para tensar el
// arco —la flecha nunca se sale de la cancha, para poder apuntar— y se suelta: la flecha sale
// en dirección contraria al arrastre y cae por su peso, así que hay que adelantarse al blanco.
//
// La meta son 100 aciertos y quien llega se gana un producto de las tiendas que comparamos:
// sale su foto y un botón que abre WhatsApp con el mensaje escrito para reclamarlo. Se empieza
// con cinco flechas y solo se pierde flecha cuando el tiro falla —si acierta no se resta—, así
// que la ronda dura lo que dure la puntería. Cada diez aciertos el cerdito corre más rápido, y
// cada cinco tiros entra un anuncio de pantalla completa (lib/ads.tsx).
//
// El cerdito sigue haciendo trampa: cuando la flecha va a darle, la ve venir y salta, y la
// flecha le pasa por debajo de verdad, no es un resultado inventado. Pero ahora esquiva poco:
// con cinco flechas solo se pueden fallar cuatro tiros en toda la partida, así que si
// ESQUIVA_MAX sube mucho el premio se vuelve imposible de ganar. Con estos números, a quien
// apunte siempre bien el cerdito le quita unas cuatro flechas en el camino a los 100: justo lo
// que hace falta para que cueste. La dificultad de verdad es la puntería, porque al final el
// cerdito corre a más del doble.
//
// Está hecho con lo que ya trae React Native (Animated y PanResponder) y el SVG del logo: no
// agrega código nativo, así que viaja como una actualización normal, sin compilar de nuevo.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useIsFocused } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { Button } from '@/components/button';
import { openExternal, whatsappWith } from '@/components/contact';
import { PiggyHello } from '@/components/piggy-hello';
import { ProductMedia } from '@/components/product-media';
import { T } from '@/components/text';
import { C, PAD, R } from '@/constants/theme';
import { AdBanner, useIntersticial } from '@/lib/ads';
import type { ContactChannel, Meta, ProductSummary } from '@/lib/api';
import { money } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useStores } from '@/lib/stores';
import { useFetch } from '@/lib/use-fetch';

const MEJOR = 'mercapty:juego-mejor';

const META = 100;            // aciertos que hay que juntar para ganarse el producto
const CERDITO = 66;          // tamaño del blanco
const FLECHA = 44;
const ARCO = 96;             // ancho del arco de abajo
const POR_RONDA = 5;         // flechas; solo se gasta una cuando el tiro falla
const ANUNCIO_CADA = 5;      // tiros entre un anuncio y el siguiente
const TENSION_MAX = 90;      // cuánto se estira; corto, para que la flecha no se esconda
const TENSION_MIN = 14;      // menos que esto no dispara
const GRAVEDAD = 700;        // píxeles por segundo cada segundo
const ESTIRON_JUSTO = 0.45;  // con este estirón la flecha llega justo a la altura del cerdito
const VELOCIDAD = 120;       // lo que corre el cerdito al empezar
const ACELERA = 18;          // lo que corre de más…
const CADA_CUANTOS = 10;     // …cada diez aciertos
const SALTO = 78;            // lo que salta para esquivar
const SALTO_DURA = 620;      // milisegundos que dura el salto
const AVISO = 320;           // con cuánta antelación ve venir la flecha
const ESQUIVA_MIN = 0.02;    // esquiva 2 de cada 100 tiros al empezar…
const ESQUIVA_MAX = 0.06;    // …y 6 de cada 100 al llegar a la meta

// Corre más rápido cada diez aciertos: empieza en 120 y llega a 300 en la meta.
const velocidad = (puntos: number) => VELOCIDAD + Math.floor(puntos / CADA_CUANTOS) * ACELERA;

// Cuánto esquiva ahora: sube parejo desde ESQUIVA_MIN hasta ESQUIVA_MAX al llegar a la meta.
const esquiva = (puntos: number) => ESQUIVA_MIN + (ESQUIVA_MAX - ESQUIVA_MIN) * Math.min(1, puntos / META);

type Fin = null | 'sinFlechas' | 'premio';

type Estado = {
  puntos: number;
  flechas: number;
  acabado: boolean;   // ronda terminada: el arco deja de responder
  tiros: number;      // para el anuncio de cada cinco; no se reinicia entre rondas
  cerditoX: number;
  cerditoVX: number;
  flechaX: number;
  flechaY: number;
  vx: number;
  vy: number;
  volando: boolean;
  tirandoX: number;
  tirandoY: number;
  saltoDesde: number; // cuándo empezó el salto (0 = en el piso)
  esquivaEn: number;  // cuándo debe saltar para esquivar (0 = no toca)
};

export default function Juego() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const enfocado = useIsFocused();
  const anuncio = useIntersticial();

  // El premio sale de las ofertas de la portada, que ya se piden al arrancar la app: cuando
  // alguien llega a los 100 el producto está ahí, sin esperar a la red.
  const ofertas = useFetch<ProductSummary[]>('/api/deals?limit=8');
  const meta = useFetch<Meta>('/api/meta');
  const tiendas = useStores();

  const ancho = width - PAD * 2; // cancha
  const alto = Math.max(300, height - insets.top - insets.bottom - 280);
  const cerditoY = 36;
  const arcoX = ancho / 2;
  const arcoY = alto - TENSION_MAX - 40; // deja sitio para estirar sin salirse de la cancha
  // La fuerza se ajusta a la cancha: el juego se siente igual en un teléfono grande y en uno
  // chico. Con menos del 45 % del estirón la flecha se queda corta; con todo, se va arriba.
  const fuerza = Math.sqrt(2 * GRAVEDAD * (arcoY - cerditoY - CERDITO / 2)) / (ESTIRON_JUSTO * TENSION_MAX);

  const [puntos, setPuntos] = useState(0);
  const [flechas, setFlechas] = useState(POR_RONDA);
  const [mejor, setMejor] = useState(0);
  const [fin, setFin] = useState<Fin>(null);
  const [premio, setPremio] = useState<ProductSummary | null>(null);
  const [aviso, setAviso] = useState('');

  // Las cuentas del juego viven aquí, no en el estado de React: cambian 60 veces por segundo.
  const juego = useRef<Estado>({
    puntos: 0,
    flechas: POR_RONDA,
    acabado: false,
    tiros: 0,
    cerditoX: 0,
    cerditoVX: VELOCIDAD,
    flechaX: 0,
    flechaY: 0,
    vx: 0,
    vy: 0,
    volando: false,
    tirandoX: 0,
    tirandoY: 0,
    saltoDesde: 0,
    esquivaEn: 0,
  }).current;

  // Lo que se dibuja.
  const cerditoEnX = useRef(new Animated.Value(0)).current;
  const cerditoEnY = useRef(new Animated.Value(cerditoY)).current;
  const flechaEnX = useRef(new Animated.Value(0)).current;
  const flechaEnY = useRef(new Animated.Value(0)).current;
  const giro = useRef(new Animated.Value(0)).current; // grados; 0 = apuntando hacia arriba

  useEffect(() => {
    AsyncStorage.getItem(MEJOR).then((v) => setMejor(Number(v) || 0)).catch(() => {});
  }, []);

  const volverAlArco = useCallback(() => {
    juego.volando = false;
    juego.flechaX = arcoX;
    juego.flechaY = arcoY;
    juego.tirandoX = 0;
    juego.tirandoY = 0;
    juego.esquivaEn = 0;
    flechaEnX.setValue(arcoX);
    flechaEnY.setValue(arcoY);
    giro.setValue(0);
  }, [arcoX, arcoY, flechaEnX, flechaEnY, giro, juego]);

  useEffect(() => {
    juego.cerditoX = ancho / 2 - CERDITO / 2;
    cerditoEnX.setValue(juego.cerditoX);
    volverAlArco();
  }, [ancho, cerditoEnX, juego, volverAlArco]);

  // El récord, las ofertas y el anuncio se leen de refs: así terminarTiro no se rehace en cada
  // toque y el bucle de cuadros no se reinicia a media partida.
  const mejorRef = useRef(0);
  const ofertasRef = useRef<ProductSummary[]>([]);
  const anuncioRef = useRef(anuncio);
  useEffect(() => { mejorRef.current = mejor; }, [mejor]);
  useEffect(() => { ofertasRef.current = ofertas.data ?? []; }, [ofertas.data]);
  useEffect(() => { anuncioRef.current = anuncio; }, [anuncio]);

  const terminarTiro = useCallback((acerto: boolean) => {
    if (acerto && Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    juego.tiros += 1;

    if (acerto) {
      juego.puntos += 1;
      setPuntos(juego.puntos);
      juego.cerditoVX = Math.sign(juego.cerditoVX) * velocidad(juego.puntos);
      if (juego.puntos > mejorRef.current) {
        mejorRef.current = juego.puntos;
        setMejor(juego.puntos);
        AsyncStorage.setItem(MEJOR, String(juego.puntos)).catch(() => {});
      }
    } else {
      juego.flechas -= 1; // solo el tiro fallado gasta flecha
      setFlechas(juego.flechas);
    }

    const gano = juego.puntos >= META;
    juego.acabado = gano || juego.flechas <= 0;
    if (gano) {
      const lista = ofertasRef.current;
      setPremio(lista.length ? lista[Math.floor(Math.random() * lista.length)] : null);
      setFin('premio');
    } else if (juego.flechas <= 0) {
      setFin('sinFlechas');
    }
    // El anuncio entra entre tiro y tiro, nunca encima del premio.
    if (!gano && juego.tiros % ANUNCIO_CADA === 0) anuncioRef.current.mostrar();
    volverAlArco();
  }, [juego, volverAlArco]);

  const nuevaRonda = useCallback(() => {
    juego.puntos = 0;
    juego.flechas = POR_RONDA;
    juego.acabado = false;
    juego.cerditoVX = VELOCIDAD;
    juego.saltoDesde = 0;
    setPuntos(0);
    setFlechas(POR_RONDA);
    setFin(null);
    setPremio(null);
    setAviso('');
    volverAlArco();
  }, [juego, volverAlArco]);

  // ¿Dónde está el cerdito ahora? Si está saltando, más arriba: el salto lo esquiva de verdad.
  const alturaDelSalto = useCallback((ahora: number) => {
    if (!juego.saltoDesde) return 0;
    const avance = (ahora - juego.saltoDesde) / SALTO_DURA;
    if (avance >= 1) {
      juego.saltoDesde = 0;
      return 0;
    }
    return Math.sin(Math.PI * avance) * SALTO;
  }, [juego]);

  // Antes de soltar se mira si la flecha iba a darle: se repite el mismo movimiento en seco.
  // Si iba a darle, el cerdito la ve venir y salta... de vez en cuando.
  const preverImpacto = useCallback((vx: number, vy: number) => {
    let cx = juego.cerditoX;
    let cvx = juego.cerditoVX;
    let x = arcoX;
    let y = arcoY;
    let vyy = vy;
    const dt = 1 / 60;
    const margen = CERDITO * 0.18;
    for (let tiempo = 0; tiempo < 5; tiempo += dt) {
      cx += cvx * dt;
      if (cx <= 8) { cx = 8; cvx = Math.abs(cvx); }
      else if (cx >= ancho - CERDITO - 8) { cx = ancho - CERDITO - 8; cvx = -Math.abs(cvx); }
      vyy += GRAVEDAD * dt;
      x += vx * dt;
      y += vyy * dt;
      if (x > cx + margen && x < cx + CERDITO - margen && y > cerditoY + margen && y < cerditoY + CERDITO - margen) {
        return tiempo * 1000;
      }
      if (y > alto + 60 || y < -220 || x < -80 || x > ancho + 80) return null;
    }
    return null;
  }, [alto, ancho, arcoX, arcoY, cerditoY, juego]);

  // El movimiento, cuadro a cuadro, solo mientras la pestaña está a la vista.
  useEffect(() => {
    if (!enfocado) return undefined;
    let id = 0;
    let previo = 0;
    const paso = (ahora: number) => {
      id = requestAnimationFrame(paso);
      const dt = previo ? Math.min((ahora - previo) / 1000, 0.05) : 0;
      previo = ahora;
      if (!dt) return;

      juego.cerditoX += juego.cerditoVX * dt;
      if (juego.cerditoX <= 8) {
        juego.cerditoX = 8;
        juego.cerditoVX = Math.abs(juego.cerditoVX);
      } else if (juego.cerditoX >= ancho - CERDITO - 8) {
        juego.cerditoX = ancho - CERDITO - 8;
        juego.cerditoVX = -Math.abs(juego.cerditoVX);
      }
      cerditoEnX.setValue(juego.cerditoX);

      // El salto para esquivar, si toca.
      if (juego.esquivaEn && ahora >= juego.esquivaEn) {
        juego.esquivaEn = 0;
        juego.saltoDesde = ahora;
        setAviso('salto');
      }
      const salto = alturaDelSalto(ahora);
      cerditoEnY.setValue(cerditoY - salto);

      if (!juego.volando) return;
      juego.vy += GRAVEDAD * dt;
      juego.flechaX += juego.vx * dt;
      juego.flechaY += juego.vy * dt;
      flechaEnX.setValue(juego.flechaX);
      flechaEnY.setValue(juego.flechaY);
      giro.setValue((Math.atan2(juego.vy, juego.vx) * 180) / Math.PI + 90);

      // El blanco es un poco más chico que el dibujo, y se mueve con el salto.
      const margen = CERDITO * 0.18;
      const arriba = cerditoY - salto;
      const dentro = juego.flechaX > juego.cerditoX + margen
        && juego.flechaX < juego.cerditoX + CERDITO - margen
        && juego.flechaY > arriba + margen
        && juego.flechaY < arriba + CERDITO - margen;
      if (dentro) {
        juego.volando = false;
        setAviso('');
        terminarTiro(true);
      } else if (juego.flechaY > alto + 60 || juego.flechaY < -220 || juego.flechaX < -80 || juego.flechaX > ancho + 80) {
        juego.volando = false;
        terminarTiro(false);
      }
    };
    id = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(id);
  }, [alturaDelSalto, alto, ancho, cerditoEnX, cerditoEnY, cerditoY, enfocado, flechaEnX, flechaEnY, giro, juego, terminarTiro]);

  // El aviso de «lo esquivó» se borra solo.
  useEffect(() => {
    if (!aviso) return undefined;
    const id = setTimeout(() => setAviso(''), 900);
    return () => clearTimeout(id);
  }, [aviso]);

  // El PanResponder se crea una sola vez, así que lee de refs lo que cambia entre dibujos.
  const fuerzaRef = useRef(fuerza);
  const preverRef = useRef(preverImpacto);
  useEffect(() => { fuerzaRef.current = fuerza; }, [fuerza]);
  useEffect(() => { preverRef.current = preverImpacto; }, [preverImpacto]);

  const dedo = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, g) => {
        if (juego.volando || juego.acabado) return;
        const y = Math.max(0, Math.min(g.dy, TENSION_MAX));
        const x = Math.max(-TENSION_MAX, Math.min(g.dx, TENSION_MAX));
        juego.tirandoX = x;
        juego.tirandoY = y;
        flechaEnX.setValue(juego.flechaX + x);
        flechaEnY.setValue(juego.flechaY + y);
        giro.setValue((Math.atan2(-y, -x) * 180) / Math.PI + 90);
      },
      onPanResponderRelease: () => {
        const { tirandoX, tirandoY } = juego;
        const tension = Math.sqrt(tirandoX * tirandoX + tirandoY * tirandoY);
        juego.tirandoX = 0;
        juego.tirandoY = 0;
        if (juego.volando || juego.acabado || tension < TENSION_MIN) {
          flechaEnX.setValue(juego.flechaX);
          flechaEnY.setValue(juego.flechaY);
          giro.setValue(0);
          return;
        }
        juego.vx = -tirandoX * fuerzaRef.current;
        juego.vy = -tirandoY * fuerzaRef.current;
        juego.volando = true;

        // Si la flecha iba a darle, el cerdito la ve venir y salta a tiempo, pero solo de vez
        // en cuando, y más seguido cuanto más alto va el marcador. El salto se programa para
        // justo antes del impacto; el reloj es el del bucle de cuadros (performance.now).
        const impacto = preverRef.current(juego.vx, juego.vy);
        const salta = Math.random() < esquiva(juego.puntos);
        juego.esquivaEn = impacto !== null && salta
          ? performance.now() + Math.max(0, impacto - AVISO)
          : 0;
      },
    }),
  ).current;

  const giroTexto = giro.interpolate({ inputRange: [-360, 360], outputRange: ['-360deg', '360deg'] });

  return (
    <View style={[styles.pantalla, { paddingTop: insets.top + 8 }]}>
      <View style={styles.marcador}>
        <Dato valor={String(puntos)} etiqueta={t('Aciertos')} />
        <Dato valor={String(flechas)} etiqueta={t('Flechas')} />
        <Dato valor={String(mejor)} etiqueta={t('Tu récord')} />
      </View>

      {/* Cuánto falta para el premio. */}
      <View style={styles.meta}>
        <View style={styles.barra}>
          <View style={[styles.barraLlena, { width: `${Math.min(100, (puntos / META) * 100)}%` }]} />
        </View>
        <T size={12} color={C.muted}>{t('{n} de {total} para ganarte un producto', { n: puntos, total: META })}</T>
      </View>

      <View style={[styles.cancha, { height: alto }]} {...dedo.panHandlers}>
        <Animated.View
          style={[styles.pieza, {
            width: CERDITO,
            height: CERDITO,
            transform: [{ translateX: cerditoEnX }, { translateY: cerditoEnY }],
          }]}>
          <PiggyHello size={CERDITO} />
        </Animated.View>

        {/* El arco se queda quieto abajo; la flecha se tensa contra él. */}
        <View style={[styles.pieza, { width: ARCO, height: ARCO, left: arcoX - ARCO / 2, top: arcoY - ARCO / 2 }]}>
          <Arco />
        </View>

        <Animated.View
          style={[styles.pieza, {
            width: FLECHA,
            height: FLECHA,
            transform: [
              { translateX: Animated.subtract(flechaEnX, FLECHA / 2) },
              { translateY: Animated.subtract(flechaEnY, FLECHA / 2) },
              { rotate: giroTexto },
            ],
          }]}>
          <Flecha />
        </Animated.View>

        <View style={[styles.piso, { top: alto - 16 }]} />

        {aviso === 'salto' && (
          <T w={700} size={14} color={C.promo} style={styles.esquiva}>{t('¡Lo esquivó!')}</T>
        )}

        {fin === null && (
          <T size={12.5} color={C.muted} style={styles.ayuda}>
            {t('Arrastra hacia abajo y suelta para disparar')}
          </T>
        )}

        {fin === 'sinFlechas' && (
          <View style={styles.fin}>
            <T w={800} size={22} tight>{t('{n} de {total}', { n: puntos, total: META })}</T>
            <T size={14} color={C.text2} style={styles.centro}>
              {t('Te quedaste sin flechas. Tu récord es {n}.', { n: mejor })}
            </T>
            <Button title={t('Jugar otra vez')} variant="primary" onPress={nuevaRonda} />
          </View>
        )}

        {fin === 'premio' && (
          <Premio
            producto={premio}
            tienda={premio ? tiendas.byId.get(premio.bestStoreId)?.name ?? '' : ''}
            whatsapp={meta.data?.contact?.whatsapp}
            onOtraVez={nuevaRonda}
          />
        )}
      </View>

      {/* Franja de anuncio bajo la cancha; si Google no manda ninguno, no deja hueco. */}
      <AdBanner style={styles.anuncio} />
    </View>
  );
}

// Lo que se lleva quien termina los 100: un producto de verdad del catálogo y el botón para
// reclamarlo por WhatsApp, con el mensaje ya escrito. La entrega se arregla por ahí.
function Premio({ producto, tienda, whatsapp, onOtraVez }: {
  producto: ProductSummary | null;
  tienda: string;
  whatsapp?: ContactChannel;
  onOtraVez: () => void;
}) {
  const { t } = useI18n();
  const nombre = producto?.name ?? '';
  const reclamar = () => {
    if (!whatsapp) return;
    const texto = producto
      ? t('¡Hola! Llegué a {n} aciertos en el juego de Mercapty y quiero reclamar mi premio: {producto}.', { n: META, producto: nombre })
      : t('¡Hola! Llegué a {n} aciertos en el juego de Mercapty y quiero reclamar mi premio.', { n: META });
    openExternal(whatsappWith(whatsapp, texto));
  };
  return (
    <View style={styles.fin}>
      <T size={34} style={{ lineHeight: 42 }} aria-hidden>🎉</T>
      <T w={800} size={22} tight style={styles.centro}>{t('¡Llegaste a los {n}!', { n: META })}</T>
      {producto ? (
        <>
          <T size={14} color={C.text2} style={styles.centro}>{t('Te ganaste este producto:')}</T>
          <View style={styles.premio}>
            <ProductMedia image={producto.image} category={producto.category} name={nombre} emojiSize={26} style={styles.premioFoto} />
            <View style={{ flex: 1, gap: 2 }}>
              <T w={700} size={14.5} numberOfLines={2}>{nombre}</T>
              <T size={12.5} color={C.muted} numberOfLines={1}>
                {[tienda, money(producto.bestPrice)].filter(Boolean).join(' · ')}
              </T>
            </View>
          </View>
        </>
      ) : (
        <T size={14} color={C.text2} style={styles.centro}>{t('Escríbenos y te decimos qué producto te llevas.')}</T>
      )}
      {whatsapp && <Button title={t('Reclamar por WhatsApp')} variant="primary" onPress={reclamar} />}
      <Button title={t('Jugar otra vez')} onPress={onOtraVez} />
    </View>
  );
}

function Dato({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  return (
    <View style={styles.dato}>
      <T w={800} size={20} tight>{valor}</T>
      <T size={12} color={C.muted}>{etiqueta}</T>
    </View>
  );
}

// Arco de madera con su cuerda, mirando hacia arriba.
function Arco() {
  return (
    <Svg viewBox="0 0 48 48" width="100%" height="100%">
      <Path d="M8 34c2-12 8-19 16-19s14 7 16 19" fill="none" stroke="#a16207" strokeWidth={3.4} strokeLinecap="round" />
      <Path d="M8 34c2-11 7-17 16-17s14 6 16 17" fill="none" stroke="#d9a441" strokeWidth={1.2} strokeLinecap="round" />
      <Path d="M8 34h32" fill="none" stroke="#94a3b8" strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

// Flecha apuntando hacia arriba dentro de su cuadro.
function Flecha() {
  return (
    <Svg viewBox="0 0 24 24" width="100%" height="100%">
      <Path d="M12 2.5l3.6 6H13v12.5h-2V8.5H8.4z" fill={C.brand} />
      <Path d="M11 21h2l-1 2z" fill="#0f172a" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: C.bg },
  marcador: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginHorizontal: PAD,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.lg,
    backgroundColor: '#fff',
  },
  dato: { alignItems: 'center' },
  meta: { gap: 6, marginHorizontal: PAD, marginVertical: 10, alignItems: 'center' },
  barra: { alignSelf: 'stretch', height: 6, borderRadius: 3, backgroundColor: C.soft2, overflow: 'hidden' },
  barraLlena: { height: 6, borderRadius: 3, backgroundColor: C.brand },
  cancha: {
    marginHorizontal: PAD,
    borderRadius: R.xl,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: '#f7faff',
    overflow: 'hidden',
  },
  pieza: { position: 'absolute', top: 0, left: 0 },
  piso: { position: 'absolute', left: 0, right: 0, height: 16, backgroundColor: '#eaf2e8' },
  esquiva: { position: 'absolute', top: 8, left: 0, right: 0, textAlign: 'center' },
  ayuda: { position: 'absolute', bottom: 24, left: 0, right: 0, textAlign: 'center' },
  centro: { textAlign: 'center' },
  fin: {
    position: 'absolute',
    left: 20,
    right: 20,
    top: '20%',
    gap: 10,
    alignItems: 'center',
    padding: 20,
    borderRadius: R.lg,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: C.border,
  },
  premio: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.soft,
  },
  premioFoto: { width: 52, height: 52, borderRadius: 12 },
  anuncio: { marginTop: 10 },
});
