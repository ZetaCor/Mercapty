// Confirmación con el estilo de la app («¿Vaciar tu lista?») en vez del Alert del sistema:
// tarjeta blanca sobre fondo oscuro, ícono grande y los dos botones a la vista.
import * as Haptics from 'expo-haptics';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Button } from './button';
import { Icon, type IconName } from './icons';
import { T } from './text';

import { C, R } from '@/constants/theme';

export function ConfirmDialog({ visible, icon = 'trash', title, message, confirmText, cancelText, onConfirm, onCancel }: {
  visible: boolean;
  icon?: IconName;
  title: string;
  message?: string;
  confirmText: string;
  cancelText: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirm = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onConfirm();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        {/* Tocar fuera es cancelar, como en un Alert. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessible={false} />
        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.card,
            {
              animationName: {
                '0%': { opacity: 0, transform: [{ translateY: 16 }, { scale: 0.94 }] },
                '70%': { opacity: 1, transform: [{ translateY: -2 }, { scale: 1.01 }] },
                '100%': { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] },
              },
              animationDuration: 320,
              animationTimingFunction: 'ease-out',
            },
          ]}>
          <Animated.View
            style={[
              styles.ring,
              {
                animationName: {
                  '0%': { opacity: 0, transform: [{ scale: 0.4 }] },
                  '65%': { opacity: 1, transform: [{ scale: 1.1 }] },
                  '100%': { opacity: 1, transform: [{ scale: 1 }] },
                },
                animationDuration: 420,
                animationDelay: 90,
                animationTimingFunction: 'ease-out',
                animationFillMode: 'backwards',
              },
            ]}>
            {/* El bote se sacude una vez, como preguntando «¿seguro?». */}
            <Animated.View
              style={[
                styles.circle,
                {
                  animationName: {
                    '0%': { transform: [{ rotate: '0deg' }] },
                    '25%': { transform: [{ rotate: '-12deg' }] },
                    '50%': { transform: [{ rotate: '9deg' }] },
                    '75%': { transform: [{ rotate: '-5deg' }] },
                    '100%': { transform: [{ rotate: '0deg' }] },
                  },
                  animationDuration: 520,
                  animationDelay: 480,
                  animationTimingFunction: 'ease-in-out',
                },
              ]}>
              <Icon name={icon} size={30} color={C.promo} strokeWidth={2.2} />
            </Animated.View>
          </Animated.View>
          <T w={800} size={20} tight accessibilityRole="header" style={styles.center}>{title}</T>
          {message ? <T size={14.5} color={C.muted} style={[styles.center, styles.message]}>{message}</T> : null}
          <View style={styles.actions}>
            <Button title={cancelText} size="lg" onPress={onCancel} style={styles.action} />
            <Button title={confirmText} size="lg" variant="destructive" onPress={confirm} style={styles.action} />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(15, 23, 42, 0.5)' },
  card: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    gap: 8,
    paddingTop: 26,
    paddingHorizontal: 22,
    paddingBottom: 22,
    borderRadius: R.xl,
    backgroundColor: '#fff',
    boxShadow: '0 24px 60px -16px rgba(15, 23, 42, 0.45)',
  },
  ring: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 8, backgroundColor: C.promoSoft },
  circle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffe4e9' },
  center: { textAlign: 'center' },
  message: { lineHeight: 21, paddingHorizontal: 4 },
  actions: { flexDirection: 'row', gap: 10, alignSelf: 'stretch', marginTop: 14 },
  action: { flex: 1 },
});
