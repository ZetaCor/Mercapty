// Foto del producto, o el ícono de su categoría si todavía no tiene (o si no carga).
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';

import { T } from './text';

import { C } from '@/constants/theme';
import { categoryIcon, categoryTint } from '@/lib/categories';

export function ProductMedia({ image, category, name, emojiSize = 44, inset = '12%', style }: {
  image: string | null;
  category?: string | null;
  name?: string;
  emojiSize?: number;
  inset?: DimensionValue; // margen de la foto dentro del recuadro
  style?: StyleProp<ViewStyle>;
}) {
  const [failed, setFailed] = useState(false);
  const showPhoto = Boolean(image) && !failed;
  return (
    <View style={[styles.box, { backgroundColor: showPhoto ? C.soft : categoryTint(category) }, style]}>
      {showPhoto ? (
        <View style={[StyleSheet.absoluteFill, { padding: inset }]}>
          <Image
            source={{ uri: image as string }}
            contentFit="contain"
            transition={150}
            accessibilityLabel={name}
            // El fondo blanco de la foto se funde con el gris del recuadro, como en la web.
            style={styles.photo}
            onError={() => setFailed(true)}
          />
        </View>
      ) : (
        <T size={emojiSize} style={{ lineHeight: Math.round(emojiSize * 1.2) }} aria-hidden>
          {categoryIcon(category)}
        </T>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  photo: { flex: 1, mixBlendMode: 'multiply' },
});
