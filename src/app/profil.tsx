import { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CATEGORIES, MODES } from '@/constants/categories';
import { BottomTabInset, MaxContentWidth, Palette, Radius, Shadow, Spacing } from '@/constants/theme';
import { countryByCode, flagEmoji } from '@/lib/countries';
import { resetProgress, useStats } from '@/lib/progress';
import { QUESTIONS_PER_ROUND } from '@/lib/quiz';

export default function ProfilScreen() {
  const stats = useStats();
  const [confirming, setConfirming] = useState(false);

  const accuracy = stats.totalAnswers
    ? Math.round((stats.totalCorrect / stats.totalAnswers) * 100)
    : 0;

  const toReview = stats.toReview
    .map((code) => countryByCode(code))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  const reset = () => {
    // Alert.alert est inopérant sur react-native-web : on y demande une
    // seconde pression sur le bouton plutôt qu'une boîte de dialogue.
    if (Platform.OS === 'web') {
      if (!confirming) {
        setConfirming(true);
        return;
      }
      resetProgress();
      setConfirming(false);
      return;
    }

    Alert.alert('Tout effacer ?', 'Scores, séries et liste à revoir seront remis à zéro.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Effacer', style: 'destructive', onPress: resetProgress },
    ]);
  };

  return (
    <View style={styles.screen}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.brand}>Ma progression</Text>
            <Text style={styles.subtitle}>
              {stats.rounds > 0
                ? `${stats.rounds} partie${stats.rounds > 1 ? 's' : ''} jouée${stats.rounds > 1 ? 's' : ''}`
                : 'Aucune partie pour le moment'}
            </Text>
          </View>

          <View style={styles.statRow}>
            <Stat value={`${accuracy}%`} label="de réussite" color={Palette.green} />
            <Stat value={String(stats.bestStreak)} label="meilleure série" color={Palette.yellowDark} />
            <Stat value={String(stats.totalCorrect)} label="bonnes réponses" color={Palette.blue} />
          </View>

          <Text style={styles.sectionTitle}>Meilleurs scores</Text>
          <View style={styles.table}>
            <View style={styles.tableHead}>
              <Text style={[styles.cell, styles.cellHeadFirst]}>Zone</Text>
              {MODES.map((m) => (
                <Text key={m.id} style={[styles.cell, styles.cellHead]}>
                  {m.label}
                </Text>
              ))}
            </View>
            {CATEGORIES.map((cat, i) => (
              <View key={cat.id} style={[styles.tableRow, i % 2 === 1 && styles.tableRowAlt]}>
                <Text style={[styles.cell, styles.cellFirst]} numberOfLines={1}>
                  {cat.emoji} {cat.label}
                </Text>
                {MODES.map((m) => {
                  const best = stats.best[`${cat.id}:${m.id}`];
                  const perfect = best === QUESTIONS_PER_ROUND;
                  return (
                    <Text
                      key={m.id}
                      style={[styles.cell, styles.cellScore, perfect && styles.cellPerfect]}>
                      {best === undefined ? '—' : `${best}/${QUESTIONS_PER_ROUND}`}
                    </Text>
                  );
                })}
              </View>
            ))}
          </View>

          <Text style={styles.sectionTitle}>À revoir</Text>
          {toReview.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                Rien à revoir. Les pays que tu rates atterrissent ici jusqu&apos;à ce que tu les
                retrouves.
              </Text>
            </View>
          ) : (
            <View style={styles.chips}>
              {toReview.map((c) => (
                <View key={c.code} style={styles.chip}>
                  <Text style={styles.chipFlag}>{flagEmoji(c.code)}</Text>
                  <Text style={styles.chipText} numberOfLines={1}>
                    {c.name}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <Pressable
            onPress={reset}
            accessibilityRole="button"
            style={({ pressed }) => [styles.reset, pressed && styles.pressed]}>
            <Text style={styles.resetText}>
              {confirming ? 'Appuie encore pour confirmer' : 'Réinitialiser ma progression'}
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Stat({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Palette.sand,
  },
  safe: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  scroll: {
    padding: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.five,
    gap: Spacing.three,
  },
  header: {
    paddingTop: Spacing.two,
    paddingHorizontal: Spacing.one,
  },
  brand: {
    fontSize: 30,
    fontWeight: '800',
    color: Palette.green,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Palette.inkSoft,
    marginTop: 2,
  },
  statRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  stat: {
    flex: 1,
    backgroundColor: Palette.card,
    borderRadius: Radius.medium,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.two,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Palette.border,
    ...Shadow.card,
  },
  statValue: {
    fontSize: 26,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Palette.inkSoft,
    textAlign: 'center',
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: Palette.brown,
    marginTop: Spacing.one,
    marginLeft: Spacing.one,
  },
  table: {
    backgroundColor: Palette.card,
    borderRadius: Radius.medium,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Palette.border,
    ...Shadow.card,
  },
  tableHead: {
    flexDirection: 'row',
    backgroundColor: Palette.brownLight,
    paddingVertical: Spacing.two,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: Spacing.two + 2,
    alignItems: 'center',
  },
  tableRowAlt: {
    backgroundColor: Palette.sand,
  },
  cell: {
    flex: 1,
    textAlign: 'center',
    fontSize: 13,
    color: Palette.ink,
    fontWeight: '600',
  },
  cellFirst: {
    flex: 1.6,
    textAlign: 'left',
    paddingLeft: Spacing.three,
    fontWeight: '700',
  },
  cellHead: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: Palette.brownDark,
  },
  cellHeadFirst: {
    flex: 1.6,
    textAlign: 'left',
    paddingLeft: Spacing.three,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: Palette.brownDark,
  },
  cellScore: {
    color: Palette.inkSoft,
  },
  cellPerfect: {
    color: Palette.green,
    fontWeight: '800',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    backgroundColor: Palette.card,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.one + 2,
    paddingHorizontal: Spacing.two + 2,
    borderWidth: 1,
    borderColor: Palette.yellow,
    maxWidth: '100%',
  },
  chipFlag: { fontSize: 16 },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
    color: Palette.ink,
    flexShrink: 1,
  },
  emptyCard: {
    backgroundColor: Palette.card,
    borderRadius: Radius.medium,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: Palette.border,
  },
  emptyText: {
    fontSize: 14,
    color: Palette.inkSoft,
    fontWeight: '600',
    lineHeight: 20,
  },
  reset: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    marginTop: Spacing.two,
  },
  resetText: {
    color: Palette.danger,
    fontWeight: '700',
    fontSize: 14,
  },
  pressed: { opacity: 0.6 },
});
