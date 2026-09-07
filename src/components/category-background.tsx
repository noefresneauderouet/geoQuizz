import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { Category } from '@/constants/categories';

type Props = {
  category: Category;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Renforce le voile quand du texte doit rester lisible par-dessus. */
  scrimBoost?: number;
};

/**
 * Fond d'une catégorie : sa photo si elle a été déposée dans
 * assets/images/categories/, sinon son dégradé. Le dégradé reste dessiné
 * sous la photo, ce qui sert aussi de placeholder pendant le chargement.
 */
export function CategoryBackground({ category, children, style, scrimBoost = 0 }: Props) {
  return (
    <View style={[styles.root, style]}>
      <LinearGradient
        colors={category.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {category.photo ? (
        <Image
          source={category.photo}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={300}
        />
      ) : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: category.scrim, opacity: 1 + scrimBoost }]} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    overflow: 'hidden',
  },
});
