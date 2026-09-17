// Ajustes de la app: idioma, versión y volver a ver la bienvenida. Se abre con la rueda
// dentada de la cabecera de Inicio, para no mezclarlos con el contenido de Tiendas.
import { ScrollView, StyleSheet, Switch, View } from 'react-native';

import { UpdateStatus } from '@/components/app-updates';
import { Button } from '@/components/button';
import { LangSwitch } from '@/components/lang-switch';
import { T } from '@/components/text';
import { C, PAD, R } from '@/constants/theme';
import { useI18n } from '@/lib/i18n';
import { CAN_NOTIFY, useNotifications, type Prefs } from '@/lib/notifications';
import { useOnboarding } from '@/lib/onboarding';

// Una línea con su interruptor.
function Aviso({ etiqueta, valor, onChange }: { etiqueta: string; valor: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.fila}>
      <T size={14.5} style={{ flex: 1 }}>{etiqueta}</T>
      <Switch value={valor} onValueChange={onChange} trackColor={{ true: C.brand, false: C.border2 }} />
    </View>
  );
}

export default function Ajustes() {
  const { t } = useI18n();
  const { reset } = useOnboarding();
  const { estado, prefs, sePuedePreguntar, activar, abrirAjustesDelTelefono, setPref } = useNotifications();
  const aviso = (key: keyof Prefs, etiqueta: string) => (
    <Aviso etiqueta={etiqueta} valor={prefs[key]} onChange={(v) => setPref(key, v)} />
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* Con los dos nombres, para que cualquiera lo encuentre sin importar el idioma actual. */}
      <View style={styles.block}>
        <T w={700} size={16} tight accessibilityRole="header">Idioma · Language</T>
        <LangSwitch />
      </View>

      <View style={styles.block}>
        <T w={700} size={16} tight accessibilityRole="header">{t('Notificaciones')}</T>
        {!CAN_NOTIFY ? (
          <T size={13.5} color={C.muted}>{t('Los avisos llegan en la app instalada.')}</T>
        ) : estado === 'activo' ? (
          <>
            {aviso('lista', t('Bajó de precio algo de mi lista'))}
            {aviso('promos', t('Día de descuento de un súper'))}
            {aviso('ofertas', t('Ofertas del día'))}
          </>
        ) : estado === 'negado' ? (
          // Si el teléfono todavía deja preguntar, se vuelve a preguntar desde aquí; si ya no
          // (Android deja de preguntar tras dos negativas), el botón lleva directo a la
          // pantalla de permisos de Mercapty, que es donde nadie sabe llegar solo. Al volver,
          // los avisos se encienden sin tocar nada más.
          <>
            <T size={13.5} color={C.muted}>{t('Los avisos están apagados en los permisos del teléfono.')}</T>
            {sePuedePreguntar ? (
              <Button title={t('Activar avisos')} variant="primary" onPress={activar} />
            ) : (
              <>
                <Button title={t('Abrir los permisos de Mercapty')} variant="primary" onPress={abrirAjustesDelTelefono} />
                <T size={12.5} color={C.muted}>{t('Ahí: Notificaciones → Permitir. Al volver a la app quedan encendidos.')}</T>
              </>
            )}
          </>
        ) : (
          <>
            <T size={13.5} color={C.muted}>{t('Te avisamos cuando baje de precio algo de tu lista o haya día de descuento en un súper.')}</T>
            <Button title={t('Activar avisos')} variant="primary" onPress={activar} />
          </>
        )}
      </View>

      <View style={styles.block}>
        <T w={700} size={16} tight accessibilityRole="header">{t('Versión de la app')}</T>
        <UpdateStatus />
      </View>

      <View style={styles.block}>
        <T w={700} size={16} tight accessibilityRole="header">{t('Bienvenida')}</T>
        <T size={13.5} color={C.muted}>{t('Las tres pantallas que se ven la primera vez que se abre la app.')}</T>
        <Button title={t('Ver la bienvenida otra vez')} onPress={reset} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { gap: 14, padding: PAD, paddingBottom: 40 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 34 },
  block: {
    gap: 10,
    padding: 18,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.lg,
    backgroundColor: '#fff',
  },
});
