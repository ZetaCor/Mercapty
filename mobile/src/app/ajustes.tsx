// Ajustes de la app: idioma, versión y volver a ver la bienvenida. Se abre con la rueda
// dentada de la cabecera de Inicio, para no mezclarlos con el contenido de Tiendas.
import { ScrollView, StyleSheet, View } from 'react-native';

import { UpdateStatus } from '@/components/app-updates';
import { Button } from '@/components/button';
import { LangSwitch } from '@/components/lang-switch';
import { T } from '@/components/text';
import { C, PAD, R } from '@/constants/theme';
import { useI18n } from '@/lib/i18n';
import { useOnboarding } from '@/lib/onboarding';

export default function Ajustes() {
  const { t } = useI18n();
  const { reset } = useOnboarding();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* Con los dos nombres, para que cualquiera lo encuentre sin importar el idioma actual. */}
      <View style={styles.block}>
        <T w={700} size={16} tight accessibilityRole="header">Idioma · Language</T>
        <LangSwitch />
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
  block: {
    gap: 10,
    padding: 18,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.lg,
    backgroundColor: '#fff',
  },
});
