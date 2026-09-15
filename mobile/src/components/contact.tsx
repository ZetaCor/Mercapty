// Contacto y redes de Mercapty. Los datos vienen de /api/meta (server/contact.js), así que
// cambian sin publicar otra versión de la app.
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from './icons';
import { T } from './text';

import { C, R } from '@/constants/theme';
import type { Contact, ContactChannel } from '@/lib/api';

const CHANNELS: [keyof Contact, string, IconName][] = [
  ['whatsapp', 'WhatsApp', 'whatsapp'],
  ['email', 'Correo', 'mail'],
  ['instagram', 'Instagram', 'instagram'],
  ['facebook', 'Facebook', 'facebook'],
];

// WhatsApp, el correo y las redes se abren en su propia app (o en el navegador si no está).
export function openExternal(url: string) {
  Linking.openURL(url).catch(() => {});
}

// Enlace de WhatsApp con un mensaje ya escrito.
export const whatsappWith = (channel: ContactChannel, text: string) => `${channel.url}?text=${encodeURIComponent(text)}`;

export function ContactList({ contact }: { contact: Contact }) {
  const rows = CHANNELS.filter(([id]) => contact[id]);
  if (!rows.length) return null;
  return (
    <View style={styles.list}>
      {rows.map(([id, label, icon], i) => {
        const channel = contact[id] as ContactChannel;
        const url = id === 'whatsapp' ? whatsappWith(channel, 'Hola, les escribo desde la app de Mercapty.') : channel.url;
        return (
          <Pressable
            key={id}
            onPress={() => openExternal(url)}
            style={({ pressed }) => [styles.row, i > 0 && styles.border, pressed && { backgroundColor: C.soft }]}
            accessibilityRole="link"
            accessibilityLabel={`${label}: ${channel.text}`}>
            <View style={styles.icon}>
              <Icon name={icon} size={20} color={C.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <T w={600}>{label}</T>
              <T size={13} color={C.muted} numberOfLines={1}>{channel.text}</T>
            </View>
            <Icon name="next" size={18} color={C.muted} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { borderWidth: 1, borderColor: C.border, borderRadius: R.lg, backgroundColor: '#fff', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  border: { borderTopWidth: 1, borderTopColor: C.border },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.brandSoft },
});
