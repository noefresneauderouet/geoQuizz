import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoryCard } from '@/components/category-card';
import { ModeSelector } from '@/components/mode-selector';
import { CATEGORIES, MODES, type CategoryId, type ModeId } from '@/constants/categories';
import { BottomTabInset, MaxContentWidth, Palette, Spacing } from '@/constants/theme';
import { countriesOf } from '@/lib/countries';
import { QUESTIONS_PER_ROUND } from '@/lib/quiz';
import { useStats } from '@/lib/progress';

const [MONDE, ...CONTINENTS] = CATEGORIES;

export default function AccueilScreen() {
  const [mode, setMode] = useState<ModeId>('drapeau');
  const router = useRouter();
  const stats = useStats();

  const activeMode = MODES.find((m) => m.id === mode) ?? MODES[0];

  const open = (categoryId: CategoryId) =>
    router.push({ pathname: '/quiz', params: { category: categoryId, mode } });

  const bestOf = (categoryId: CategoryId) => stats.best[`${categoryId}:${mode}`] ?? null;

  /** Les continents vont deux par deux ; la dernière ligne garde la même largeur de carte. */
  const rows = CONTINENTS.reduce<(typeof CONTINENTS)[]>((acc, cat, i) => {
    if (i % 2 === 0) acc.push([cat]);
    else acc[acc.length - 1].push(cat);
    return acc;
  }, []);

  return (
    <View style={styles.screen}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.brand}>GeoLearn</Text>
            <Text style={styles.subtitle}>
              {activeMode.emoji}  Je révise les {activeMode.label.toLowerCase()}s
            </Text>
          </View>

          <ModeSelector value={mode} onChange={setMode} accent={MONDE.accent} />

          <Text style={styles.sectionTitle}>Choisis ta zone</Text>

          <CategoryCard
            featured
            category={MONDE}
            countryCount={countriesOf(MONDE.id).length}
            best={bestOf(MONDE.id)}
            total={QUESTIONS_PER_ROUND}
            onPress={() => open(MONDE.id)}
          />

          {rows.map((row, i) => (
            <View key={i} style={styles.row}>
              {row.map((cat) => (
                <CategoryCard
                  key={cat.id}
                  category={cat}
                  countryCount={countriesOf(cat.id).length}
                  best={bestOf(cat.id)}
                  total={QUESTIONS_PER_ROUND}
                  onPress={() => open(cat.id)}
                />
              ))}
              {row.length === 1 ? <View style={styles.spacer} /> : null}
            </View>
          ))}

          <Text style={styles.footnote}>
            {QUESTIONS_PER_ROUND} questions par partie · les fautes de frappe sont pardonnées
          </Text>
        </ScrollView>
      </SafeAreaView>
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
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
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
    fontSize: 34,
    fontWeight: '800',
    color: Palette.green,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Palette.inkSoft,
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
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  spacer: {
    flex: 1,
  },
  footnote: {
    textAlign: 'center',
    fontSize: 12,
    color: Palette.inkSoft,
    marginTop: Spacing.one,
  },
});
