import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoryBackground } from '@/components/category-background';
import { AnswerInput } from '@/components/quiz/answer-input';
import { FeedbackBanner } from '@/components/quiz/feedback-banner';
import { FlagView } from '@/components/quiz/flag-view';
import { WorldMap } from '@/components/world-map';
import { getCategory, getMode, type Category } from '@/constants/categories';
import { MaxContentWidth, Palette, Radius, Shadow, Spacing } from '@/constants/theme';
import { flagEmoji } from '@/lib/countries';
import { recordRound } from '@/lib/progress';
import {
  answerLabel,
  buildRound,
  checkAnswer,
  expectedAnswer,
  questionPrompt,
  QUESTIONS_PER_ROUND,
} from '@/lib/quiz';

type Phase = { kind: 'typing' } | { kind: 'answered'; correct: boolean; approximate: boolean };

export default function QuizScreen() {
  const params = useLocalSearchParams<{ category?: string; mode?: string }>();
  const category = getCategory(params.category);
  const mode = getMode(params.mode);
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);

  const [round, setRound] = useState(() => buildRound(category.id, mode.id));
  const [index, setIndex] = useState(0);
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'typing' });
  const [zoomed, setZoomed] = useState(false);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [missed, setMissed] = useState<string[]>([]);
  const [solved, setSolved] = useState<string[]>([]);
  const [finished, setFinished] = useState(false);

  const question = round[index];

  const restart = useCallback(() => {
    setRound(buildRound(category.id, mode.id));
    setIndex(0);
    setInput('');
    setPhase({ kind: 'typing' });
    setZoomed(false);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setMissed([]);
    setSolved([]);
    setFinished(false);
  }, [category.id, mode.id]);

  const validate = useCallback(() => {
    if (phase.kind !== 'typing' || !question) return;
    const result = checkAnswer(question, input);

    if (result.correct) {
      const nextStreak = streak + 1;
      setScore((s) => s + 1);
      setStreak(nextStreak);
      setBestStreak((b) => Math.max(b, nextStreak));
      setSolved((s) => [...s, question.country.code]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else {
      setStreak(0);
      setMissed((m) => [...m, question.country.code]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }

    // La carte revient en vue d'ensemble : on voit ou se situe vraiment le pays.
    if (question.mode === 'pays') setZoomed(false);
    setPhase({ kind: 'answered', correct: result.correct, approximate: !result.exact });
  }, [input, phase.kind, question, streak]);

  const next = useCallback(() => {
    if (phase.kind !== 'answered') return;

    if (index + 1 >= round.length) {
      recordRound({
        category: category.id,
        mode: mode.id,
        score,
        total: round.length,
        bestStreak,
        missed,
        solved,
      });
      setFinished(true);
      return;
    }

    setIndex((i) => i + 1);
    setInput('');
    setZoomed(false);
    setPhase({ kind: 'typing' });
    inputRef.current?.focus();
  }, [bestStreak, category.id, index, missed, mode.id, phase.kind, round.length, score, solved]);

  if (finished) {
    return (
      <Summary
        category={category}
        modeLabel={mode.label}
        score={score}
        total={round.length}
        bestStreak={bestStreak}
        onReplay={restart}
        onBack={() => router.back()}
      />
    );
  }

  if (!question) {
    return (
      <CategoryBackground category={category} style={styles.screen}>
        <SafeAreaView style={styles.centered}>
          <Text style={styles.emptyText}>
            Pas assez de pays dessinables sur la carte pour cette zone.
          </Text>
          <Pressable style={styles.ghostButton} onPress={() => router.back()}>
            <Text style={styles.ghostButtonText}>Retour</Text>
          </Pressable>
        </SafeAreaView>
      </CategoryBackground>
    );
  }

  const answered = phase.kind === 'answered';
  const progress = (index + (answered ? 1 : 0)) / round.length;

  return (
    <CategoryBackground category={category} style={styles.screen}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.topBar}>
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Quitter la partie"
              style={styles.close}>
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
            <View style={styles.topLabels}>
              <Text style={styles.topTitle}>
                {category.emoji} {category.label}
              </Text>
              <Text style={styles.topSub}>
                {mode.emoji} {mode.label} · {index + 1}/{round.length}
              </Text>
            </View>
            <View style={styles.scorePill}>
              <Text style={styles.scoreText}>{score}</Text>
            </View>
          </View>

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>

          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <Animated.View key={index} entering={FadeIn.duration(260)} style={styles.card}>
              <Text style={styles.prompt}>{questionPrompt(question)}</Text>

              {question.mode === 'drapeau' ? <FlagView code={question.country.code} /> : null}

              {question.mode === 'pays' ? (
                <View style={styles.mapBlock}>
                  <WorldMap
                    country={question.country}
                    category={category}
                    zoomed={zoomed}
                    scope={category.id === 'monde' ? 'monde' : 'continent'}
                    height={280}
                  />
                  <Pressable
                    onPress={() => setZoomed((z) => !z)}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.zoomButton, pressed && styles.pressed]}>
                    <Text style={styles.zoomText}>
                      {zoomed ? "Vue d'ensemble" : 'Zoomer sur le pays'}
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              {question.mode === 'capitale' && !question.reversed ? (
                <View style={styles.countryChip}>
                  <Text style={styles.countryFlag}>{flagEmoji(question.country.code)}</Text>
                  <Text style={styles.countryName}>{question.country.name}</Text>
                </View>
              ) : null}

              {question.mode === 'capitale' && question.reversed ? (
                <View style={styles.countryChip}>
                  <Text style={styles.capitalPin}>📍</Text>
                  <Text style={styles.countryName}>{question.country.capital}</Text>
                </View>
              ) : null}
            </Animated.View>

            {answered ? (
              <FeedbackBanner
                correct={phase.correct}
                approximate={phase.approximate}
                answer={expectedAnswer(question)}
                detail={
                  question.mode === 'capitale' && !question.reversed
                    ? `capitale de ${question.country.name}`
                    : `${question.country.name} · capitale : ${question.country.capital}`
                }
              />
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            {answered ? (
              <Pressable
                onPress={next}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.nextButton,
                  { backgroundColor: category.accent },
                  pressed && styles.pressed,
                ]}>
                <Text style={styles.nextText}>
                  {index + 1 >= round.length ? 'Voir mon résultat' : 'Question suivante'}
                </Text>
              </Pressable>
            ) : (
              <AnswerInput
                ref={inputRef}
                value={input}
                onChangeText={setInput}
                onSubmit={validate}
                label={answerLabel(question)}
                accent={category.accent}
                locked={false}
              />
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </CategoryBackground>
  );
}

/* -------------------------------- Résultat -------------------------------- */

type SummaryProps = {
  category: Category;
  modeLabel: string;
  score: number;
  total: number;
  bestStreak: number;
  onReplay: () => void;
  onBack: () => void;
};

function Summary({
  category,
  modeLabel,
  score,
  total,
  bestStreak,
  onReplay,
  onBack,
}: SummaryProps) {
  const ratio = score / total;
  const title =
    ratio === 1 ? 'Parfait !' : ratio >= 0.7 ? 'Bien joué !' : ratio >= 0.4 ? 'Pas mal' : 'À retravailler';
  const medal = ratio === 1 ? '🏆' : ratio >= 0.7 ? '🎉' : ratio >= 0.4 ? '👍' : '📚';

  return (
    <CategoryBackground category={category} style={styles.screen}>
      <SafeAreaView style={styles.centered}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryMedal}>{medal}</Text>
          <Text style={styles.summaryTitle}>{title}</Text>
          <Text style={styles.summaryScore}>
            {score}
            <Text style={styles.summaryScoreTotal}> / {total}</Text>
          </Text>
          <Text style={styles.summaryMeta}>
            {category.label} · {modeLabel} · meilleure série : {bestStreak}
          </Text>

          <Pressable
            onPress={onReplay}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.nextButton,
              styles.summaryButton,
              { backgroundColor: category.accent },
              pressed && styles.pressed,
            ]}>
            <Text style={styles.nextText}>Rejouer {QUESTIONS_PER_ROUND} questions</Text>
          </Pressable>
          <Pressable onPress={onBack} accessibilityRole="button" style={styles.ghostButton}>
            <Text style={styles.ghostButtonText}>Changer de zone</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </CategoryBackground>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  pressed: { opacity: 0.85 },
  safe: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.three,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  close: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: Palette.card,
    fontSize: 17,
    fontWeight: '800',
  },
  topLabels: { flex: 1 },
  topTitle: {
    color: Palette.card,
    fontSize: 17,
    fontWeight: '800',
  },
  topSub: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '600',
  },
  scorePill: {
    minWidth: 40,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Radius.pill,
    backgroundColor: Palette.yellow,
    alignItems: 'center',
  },
  scoreText: {
    fontWeight: '800',
    fontSize: 16,
    color: Palette.ink,
  },
  progressTrack: {
    height: 6,
    marginHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(255,255,255,0.3)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Palette.yellow,
    borderRadius: Radius.pill,
  },
  scroll: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  card: {
    backgroundColor: Palette.card,
    borderRadius: Radius.large,
    padding: Spacing.three,
    gap: Spacing.three,
    ...Shadow.card,
  },
  prompt: {
    fontSize: 19,
    fontWeight: '800',
    color: Palette.ink,
    textAlign: 'center',
  },
  mapBlock: {
    gap: Spacing.two,
  },
  zoomButton: {
    alignSelf: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    backgroundColor: Palette.yellowLight,
    borderWidth: 1,
    borderColor: Palette.yellow,
  },
  zoomText: {
    fontWeight: '700',
    color: Palette.brownDark,
  },
  countryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.four,
    paddingHorizontal: Spacing.three,
    backgroundColor: Palette.sand,
    borderRadius: Radius.medium,
  },
  countryFlag: { fontSize: 44 },
  capitalPin: { fontSize: 32 },
  countryName: {
    fontSize: 26,
    fontWeight: '800',
    color: Palette.ink,
    flexShrink: 1,
  },
  footer: {
    padding: Spacing.three,
    paddingTop: 0,
  },
  nextButton: {
    borderRadius: Radius.medium,
    paddingVertical: Spacing.three - 2,
    alignItems: 'center',
    ...Shadow.card,
  },
  nextText: {
    color: Palette.card,
    fontSize: 17,
    fontWeight: '800',
  },
  ghostButton: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
  ghostButtonText: {
    color: Palette.inkSoft,
    fontWeight: '700',
  },
  emptyText: {
    color: Palette.card,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  summaryCard: {
    backgroundColor: Palette.card,
    borderRadius: Radius.large,
    padding: Spacing.four,
    gap: Spacing.two,
    alignItems: 'center',
    ...Shadow.card,
  },
  summaryButton: {
    alignSelf: 'stretch',
  },
  summaryMedal: { fontSize: 56 },
  summaryTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: Palette.ink,
  },
  summaryScore: {
    fontSize: 52,
    fontWeight: '800',
    color: Palette.green,
  },
  summaryScoreTotal: {
    fontSize: 26,
    color: Palette.inkSoft,
  },
  summaryMeta: {
    fontSize: 14,
    color: Palette.inkSoft,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: Spacing.two,
  },
});
