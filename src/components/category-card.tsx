import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CategoryBackground } from '@/components/category-background';
import type { Category } from '@/constants/categories';
import { Palette, Radius, Shadow, Spacing } from '@/constants/theme';

type Props = {
  category: Category;
  countryCount: number;
  /** Meilleur score sur ce couple catégorie/mode, ou null si jamais jouée. */
  best: number | null;
  total: number;
  onPress: () => void;
  /** La carte « Monde » occupe toute la largeur et sert d'entrée principale. */
  featured?: boolean;
};

export function CategoryCard({
  category,
  countryCount,
  best,
  total,
  onPress,
  featured = false,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${category.label}, ${countryCount} pays`}
      accessibilityHint={category.tagline}
      style={({ pressed }) => [
        styles.pressable,
        featured ? styles.featured : styles.tile,
        pressed && styles.pressed,
      ]}>
      <CategoryBackground category={category} style={StyleSheet.absoluteFill as never} />
      <View style={[styles.content, featured && styles.contentFeatured]}>
        <View style={styles.topRow}>
          <Text style={[styles.emoji, featured && styles.emojiFeatured]}>{category.emoji}</Text>
          {best !== null ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                ★ {best}/{total}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.bottom}>
          <Text style={[styles.label, featured && styles.labelFeatured]} numberOfLines={1}>
            {category.label}
          </Text>
          <Text style={styles.meta} numberOfLines={featured ? 1 : 2}>
            {featured ? category.tagline : `${countryCount} pays`}
          </Text>
          {featured ? <Text style={styles.meta}>{countryCount} pays</Text> : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    borderRadius: Radius.large,
    overflow: 'hidden',
    ...Shadow.card,
  },
  featured: {
    height: 150,
  },
  tile: {
    flex: 1,
    minWidth: 0,
    height: 124,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.92,
  },
  content: {
    flex: 1,
    padding: Spacing.three,
    justifyContent: 'space-between',
  },
  contentFeatured: {
    padding: Spacing.four - 4,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  emoji: {
    fontSize: 26,
  },
  emojiFeatured: {
    fontSize: 38,
  },
  badge: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half + 1,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: Palette.ink,
  },
  bottom: {
    gap: 1,
  },
  label: {
    color: Palette.card,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  labelFeatured: {
    fontSize: 30,
  },
  meta: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 13,
    fontWeight: '600',
  },
});
