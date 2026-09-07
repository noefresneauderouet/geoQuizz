import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Palette, Radius, Shadow } from '@/constants/theme';
import { flagEmoji, flagUrl } from '@/lib/countries';

type Props = { code: string; height?: number };

/**
 * Drapeau du pays. L'image est mise en cache sur disque par expo-image :
 * une fois vue, elle reste disponible hors-ligne. Si le réseau manque à la
 * première vue, on retombe sur l'emoji drapeau, toujours lisible.
 */
export function FlagView({ code, height = 150 }: Props) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <View style={[styles.frame, { height }]}>
        <Text style={[styles.emoji, { fontSize: height * 0.6 }]}>{flagEmoji(code)}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.frame, { height }]}>
      <Image
        source={{ uri: flagUrl(code, 640) }}
        style={styles.image}
        contentFit="contain"
        transition={200}
        cachePolicy="disk"
        onError={() => setFailed(true)}
        accessibilityLabel="Drapeau à identifier"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    borderRadius: Radius.medium,
    backgroundColor: Palette.card,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderWidth: 2,
    borderColor: Palette.brownLight,
    ...Shadow.card,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  emoji: {
    textAlign: 'center',
  },
});
