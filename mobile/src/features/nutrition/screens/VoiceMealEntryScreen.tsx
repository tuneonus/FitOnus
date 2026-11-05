import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { Check, Mic, MicOff, X } from 'lucide-react-native';
import { useNavigation, useRouteParams } from '@/app/navigation/NavigationContext';
import { Button } from '@/shared/components/ui/Button';
import { Chip } from '@/shared/components/ui/Chip';
import { showToast } from '@/shared/stores/toastStore';
import { VoiceWaveform } from '../../voice-coach/components/VoiceWaveform';
import { useVoiceStore } from '../../voice-coach/store/voiceStore';
import { useNutritionStore } from '../store/nutritionStore';
import { mealLabels, mealOrder } from '../constants/meals';
import { useTheme } from '@/hooks/use-theme';
import type { FoodItem, MealType } from '../types/nutrition';

type Phase = 'idle' | 'listening' | 'processing' | 'review' | 'error';

const phrase = 'Two rotis, a bowl of dal and some paneer tikka';
const parsed: FoodItem[] = [
  {
    id: 'v1',
    name: 'Roti, whole wheat',
    serving: '2 pieces',
    kcal: 240,
    protein: 8,
    carbs: 40,
    fat: 6,
    fiber: 6,
    estimated: true,
    confidence: 0.92,
  },
  {
    id: 'v2',
    name: 'Dal tadka',
    serving: '1 bowl · 200 g',
    kcal: 230,
    protein: 12,
    carbs: 30,
    fat: 7,
    fiber: 8,
    estimated: true,
    confidence: 0.88,
  },
  {
    id: 'v3',
    name: 'Paneer tikka',
    serving: '“some” → 100 g',
    kcal: 220,
    protein: 16,
    carbs: 6,
    fat: 15,
    fiber: 1,
    estimated: true,
    confidence: 0.61,
  },
];

export function VoiceMealEntryScreen() {
  const { colors } = useTheme();
  const { goBack, replace } = useNavigation();
  const params = useRouteParams<{ meal?: MealType }>();
  const mealParam = params.meal;

  const { micPermission, setMicPermission } = useVoiceStore();
  const addEntry = useNutritionStore((s) => s.addEntry);
  const removeEntry = useNutritionStore((s) => s.removeEntry);

  const [phase, setPhase] = useState<Phase>('idle');
  const [transcript, setTranscript] = useState('');
  const [items, setItems] = useState<FoodItem[]>(parsed);
  const [meal, setMeal] = useState<MealType>(mealParam ?? 'lunch');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const listen = () => {
    timers.current.forEach(clearTimeout);
    setTranscript('');
    setItems(parsed);
    setPhase('listening');
    const words = phrase.split(' ');
    words.forEach((_, i) =>
      timers.current.push(
        setTimeout(() => setTranscript(words.slice(0, i + 1).join(' ')), 400 + i * 220)
      )
    );
    const end = 400 + words.length * 220 + 400;
    timers.current.push(
      setTimeout(() => setPhase('processing'), end),
      setTimeout(() => setPhase('review'), end + 1200)
    );
  };

  const stop = () => {
    if (transcript !== phrase) {
      timers.current.forEach(clearTimeout);
      setPhase('error');
    }
  };

  const total = items.reduce(
    (a, i) => ({ kcal: a.kcal + i.kcal, protein: a.protein + i.protein }),
    { kcal: 0, protein: 0 }
  );

  const save = () => {
    const id = addEntry({ meal, time: 'Now', method: 'voice', items });
    showToast({
      message: `${mealLabels[meal]} logged · ${total.kcal} kcal`,
      actionLabel: 'Undo',
      onAction: () => removeEntry(id),
    });
    replace('nutrition');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Top Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.muted }]}>Log a meal by voice</Text>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={goBack}
          style={[styles.closeCircle, { backgroundColor: colors.surface2 }]}
          accessibilityLabel="Close"
        >
          <X size={20} color={colors.ink} />
        </TouchableOpacity>
      </View>

      {/* Body Content */}
      {micPermission === 'denied' ? (
        <View style={styles.centerBox}>
          <MicOff size={36} color={colors.muted} />
          <Text style={[styles.permTitle, { color: colors.ink }]}>Microphone is off</Text>
          <Text style={[styles.permSub, { color: colors.muted }]}>
            Allow microphone access to log meals by voice, or search instead.
          </Text>
          <Button style={{ marginTop: 24 }} onPress={() => setMicPermission('granted')}>
            Allow microphone
          </Button>
        </View>
      ) : phase === 'review' ? (
        <ScrollView style={styles.reviewContainer} showsVerticalScrollIndicator={false}>
          <Text style={[styles.reviewLabel, { color: colors.muted }]}>You said</Text>
          <Text style={[styles.reviewPhrase, { color: colors.ink }]}>“{phrase}”</Text>

          <View style={styles.chipsRow}>
            {mealOrder.map((m) => (
              <Chip
                key={m}
                label={mealLabels[m]}
                selected={m === meal}
                onPress={() => setMeal(m)}
              />
            ))}
          </View>

          <View style={[styles.itemsCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            {items.map((i, idx) => (
              <View
                key={i.id}
                style={[
                  styles.itemRow,
                  { borderBottomColor: colors.line },
                  idx === items.length - 1 && { borderBottomWidth: 0 },
                ]}
              >
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={[styles.itemName, { color: colors.ink }]}>{i.name}</Text>
                  <Text style={[styles.itemServing, { color: colors.muted }]}>
                    {i.serving} · {i.protein} g protein
                  </Text>
                  {(i.confidence ?? 1) < 0.7 && (
                    <Text style={[styles.warnPortion, { color: colors.warn }]}>
                      Portion unclear — check amount
                    </Text>
                  )}
                </View>
                <Text style={[styles.itemKcal, { color: colors.ink }]}>{i.kcal}</Text>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setItems(items.filter((x) => x.id !== i.id))}
                  style={styles.itemDeleteBtn}
                  accessibilityLabel={`Remove ${i.name}`}
                >
                  <X size={16} color={colors.muted} />
                </TouchableOpacity>
              </View>
            ))}
          </View>

          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: colors.muted }]}>Estimated total</Text>
            <Text style={[styles.totalValue, { color: colors.ink }]}>
              {total.kcal} kcal · {total.protein} g protein
            </Text>
          </View>

          <Text style={[styles.voiceFootnote, { color: colors.muted }]}>
            Voice entries are estimates. You can edit portions later from the meal diary.
          </Text>
        </ScrollView>
      ) : (
        <View style={styles.listenBox}>
          <Text style={[styles.promptText, { color: colors.ink }]}>
            {phase === 'idle' && (
              <Text style={{ color: colors.muted }}>
                Say what you ate, e.g. “{phrase}”
              </Text>
            )}
            {phase === 'listening' && (transcript || <Text style={{ color: colors.muted }}>Listening…</Text>)}
            {phase === 'processing' && transcript}
            {phase === 'error' && <Text>Didn’t catch that. Try again in a quieter spot.</Text>}
          </Text>

          <View style={styles.waveformContainer}>
            <VoiceWaveform active={phase === 'listening'} />
          </View>

          {phase === 'processing' && (
            <View style={styles.processingRow}>
              <ActivityIndicator size="small" color={colors.muted} />
              <Text style={[styles.processingText, { color: colors.muted }]}>
                Matching foods and portions…
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Bottom Controls */}
      {micPermission !== 'denied' && (
        <View style={styles.bottomBar}>
          {phase === 'review' ? (
            <View style={styles.reviewActions}>
              <Button
                variant="outline"
                size="lg"
                icon={Mic}
                onPress={listen}
              >
                Redo
              </Button>
              <View style={{ flex: 1 }}>
                <Button
                  size="lg"
                  fullWidth
                  icon={Check}
                  disabled={items.length === 0}
                  onPress={save}
                >
                  Log {mealLabels[meal].toLowerCase()}
                </Button>
              </View>
            </View>
          ) : (
            <View style={styles.micBtnWrapper}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={phase === 'listening' ? stop : listen}
                disabled={phase === 'processing'}
                style={[
                  styles.micCircle,
                  { backgroundColor: colors.accent },
                  phase === 'processing' && { opacity: 0.5 },
                ]}
                accessibilityLabel={phase === 'listening' ? 'Stop listening' : 'Start listening'}
              >
                {phase === 'listening' ? (
                  <View style={[styles.stopSquare, { backgroundColor: colors.ink }]} />
                ) : (
                  <Mic size={30} color={colors.ink} />
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '500',
  },
  closeCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  permTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 16,
  },
  permSub: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  listenBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  promptText: {
    fontSize: 22,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 30,
    minHeight: 64,
  },
  waveformContainer: {
    height: 64,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 32,
  },
  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  processingText: {
    fontSize: 14,
  },
  reviewContainer: {
    flex: 1,
    paddingTop: 12,
  },
  reviewLabel: {
    fontSize: 13,
  },
  reviewPhrase: {
    fontSize: 19,
    fontWeight: '600',
    lineHeight: 26,
    marginTop: 4,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  itemsCard: {
    borderRadius: 24,
    borderWidth: 1,
    marginTop: 18,
    overflow: 'hidden',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '600',
  },
  itemServing: {
    fontSize: 12,
    marginTop: 2,
  },
  warnPortion: {
    fontSize: 12,
    marginTop: 2,
  },
  itemKcal: {
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    marginRight: 8,
  },
  itemDeleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginTop: 14,
  },
  totalLabel: {
    fontSize: 14,
  },
  totalValue: {
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  voiceFootnote: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 8,
    paddingHorizontal: 4,
    paddingBottom: 24,
  },
  bottomBar: {
    paddingVertical: 16,
  },
  reviewActions: {
    flexDirection: 'row',
    gap: 12,
  },
  micBtnWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  micCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopSquare: {
    width: 24,
    height: 24,
    borderRadius: 6,
  },
});
