import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MODES, type ModeId } from '@/constants/categories';
import { Palette, Radius, Shadow, Spacing } from '@/constants/theme';

type Props = {
  value: ModeId;
  onChange: (mode: ModeId) => void;
  /** Couleur de la pastille active : elle suit la catégorie survolée. */
  accent: string;
};

/** Segment à trois positions : Drapeau · Capitale · Pays. */
export function ModeSelector({ value, onChange, accent }: Props) {
  return (
    <View style={styles.track} accessibilityRole="tablist">
      {MODES.map((mode) => {
        const selected = mode.id === value;
        return (
          <Pressable
            key={mode.id}
            onPress={() => onChange(mode.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={`Mode ${mode.label}`}
            style={({ pressed }) => [
              styles.segment,
              selected && [styles.segmentActive, { backgroundColor: accent }],
              pressed && !selected && styles.segmentPressed,
            ]}>
            <Text style={styles.emoji}>{mode.emoji}</Text>
            <Text style={[styles.label, selected && styles.labelActive]} numberOfLines={1}>
              {mode.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: Palette.card,
    borderRadius: Radius.pill,
    padding: Spacing.one,
    gap: Spacing.one,
    borderWidth: 1,
    borderColor: Palette.border,
    ...Shadow.card,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.pill,
  },
  segmentActive: {
    ...Shadow.card,
  },
  segmentPressed: {
    backgroundColor: Palette.yellowLight,
  },
  emoji: {
    fontSize: 16,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    color: Palette.inkSoft,
  },
  labelActive: {
    color: Palette.card,
  },
});
