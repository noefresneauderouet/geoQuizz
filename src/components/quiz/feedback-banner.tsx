import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Palette, Radius, Shadow, Spacing } from '@/constants/theme';

type Props = {
  correct: boolean;
  /** Vrai quand la réponse a été rattrapée par la tolérance orthographique. */
  approximate: boolean;
  answer: string;
  /** Contexte utile : « capitale du Pérou », « Pérou » … */
  detail?: string;
};

export function FeedbackBanner({ correct, approximate, answer, detail }: Props) {
  const title = correct ? (approximate ? 'Presque ! On te l’accorde' : 'Bravo !') : 'Raté';

  return (
    <Animated.View
      entering={FadeInDown.duration(220)}
      style={[styles.banner, correct ? styles.ok : styles.ko]}
      accessibilityLiveRegion="polite">
      <Text style={styles.icon}>{correct ? '✅' : '❌'}</Text>
      <View style={styles.texts}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.answer}>{answer}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: 2,
    ...Shadow.card,
  },
  ok: {
    backgroundColor: Palette.greenLight,
    borderColor: Palette.green,
  },
  ko: {
    backgroundColor: '#F7D9D4',
    borderColor: Palette.danger,
  },
  icon: {
    fontSize: 24,
  },
  texts: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: Palette.ink,
  },
  answer: {
    fontSize: 22,
    fontWeight: '800',
    color: Palette.ink,
  },
  detail: {
    fontSize: 13,
    fontWeight: '600',
    color: Palette.inkSoft,
  },
});
