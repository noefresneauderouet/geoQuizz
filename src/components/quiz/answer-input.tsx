import { forwardRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Palette, Radius, Shadow, Spacing } from '@/constants/theme';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
  /** Étiquette du champ : « Pays » ou « Capitale ». */
  label: string;
  accent: string;
  /** Verrouillé pendant l'affichage de la correction. */
  locked: boolean;
};

export const AnswerInput = forwardRef<TextInput, Props>(function AnswerInput(
  { value, onChangeText, onSubmit, label, accent, locked },
  ref
) {
  const canSubmit = value.trim().length > 0 && !locked;

  return (
    <View style={styles.wrapper}>
      <View style={[styles.field, { borderColor: locked ? Palette.border : accent }]}>
        <Text style={[styles.label, { color: accent }]}>{label}</Text>
        <TextInput
          ref={ref}
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmit}
          editable={!locked}
          placeholder="Écris ta réponse…"
          placeholderTextColor={Palette.inkSoft}
          autoCorrect={false}
          autoCapitalize="words"
          returnKeyType="done"
          style={styles.input}
          accessibilityLabel={`Réponse : ${label}`}
        />
      </View>

      <Pressable
        onPress={onSubmit}
        disabled={!canSubmit}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: canSubmit ? accent : Palette.border },
          pressed && canSubmit && styles.buttonPressed,
        ]}>
        <Text style={[styles.buttonText, !canSubmit && styles.buttonTextDisabled]}>Valider</Text>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    gap: Spacing.two,
  },
  field: {
    backgroundColor: Palette.card,
    borderRadius: Radius.medium,
    borderWidth: 2,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
    ...Shadow.card,
  },
  label: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  input: {
    fontSize: 20,
    fontWeight: '600',
    color: Palette.ink,
    paddingVertical: Spacing.one,
  },
  button: {
    borderRadius: Radius.medium,
    paddingVertical: Spacing.three - 2,
    alignItems: 'center',
    ...Shadow.card,
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  buttonText: {
    color: Palette.card,
    fontSize: 17,
    fontWeight: '800',
  },
  buttonTextDisabled: {
    color: Palette.inkSoft,
  },
});
