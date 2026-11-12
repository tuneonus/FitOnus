import { TextField } from '@/shared/components/ui/TextField';
import { ActionButton } from '@/shared/components/ui/ActionButton';
import { useReducedMotion } from 'react-native-reanimated';
import { premium } from '@/shared/theme/premium';
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, Mic, MicOff, X, RefreshCw, Send } from 'lucide-react-native';
import { useNavigation, useRouteParams } from '@/app/navigation/NavigationContext';
import { Button } from '@/shared/components/ui/Button';
import { Chip } from '@/shared/components/ui/Chip';
import { StatusBanner } from '@/shared/components/ui/StatusBanner';
import { showToast } from '@/shared/stores/toastStore';
import { VoiceWaveform } from '../../voice-coach/components/VoiceWaveform';
import { useVoiceStore } from '../../voice-coach/store/voiceStore';
import { useNutritionStore } from '../store/nutritionStore';
import { mealLabels, mealOrder } from '../constants/meals';
import { useTheme } from '@/hooks/use-theme';
import type { FoodItem, MealType } from '../types/nutrition';
import { VoiceMealApi } from '../../ai-coach/services/voice-meal-api';
import { useAudioRecorder, RecordingPresets, requestRecordingPermissionsAsync } from 'expo-audio';
import { File } from 'expo-file-system';

type Phase = 'idle' | 'listening' | 'processing' | 'review' | 'error';

export function VoiceMealEntryScreen() {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const { goBack, replace } = useNavigation();
  const params = useRouteParams<{ meal?: MealType }>();
  const mealParam = params.meal;

  const { micPermission, setMicPermission } = useVoiceStore();
  const logMeal = useNutritionStore((s) => s.logMeal);
  const removeEntry = useNutritionStore((s) => s.removeEntry);

  const [phase, setPhase] = useState<Phase>('idle');
  const [transcript, setTranscript] = useState('');
  const [manualText, setManualText] = useState('');
  const [items, setItems] = useState<FoodItem[]>([]);
  const [meal, setMeal] = useState<MealType>(mealParam ?? 'lunch');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [unclearReason, setUnclearReason] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const isRecordingRef = useRef(false);

  useEffect(() => {
    return () => {
      if (isRecordingRef.current) {
        recorder.stop().catch(() => {});
        isRecordingRef.current = false;
      }
    };
  }, [recorder]);

  const handleStartListening = async () => {
    try {
      setErrorMessage(null);
      setUnclearReason(null);
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setMicPermission('denied');
        return;
      }
      setMicPermission('granted');

      await recorder.prepareToRecordAsync();
      recorder.record();
      isRecordingRef.current = true;
      setPhase('listening');
      setTranscript('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not access microphone.';
      setPhase('error');
      setErrorMessage(msg);
    }
  };

  const handleStopListening = async () => {
    if (!isRecordingRef.current) return;
    try {
      isRecordingRef.current = false;
      setPhase('processing');
      await recorder.stop();

      const uri = recorder.uri;
      if (!uri) {
        throw new Error('No audio file was recorded.');
      }

      const audioBase64 = await new File(uri).base64();

      const result = await VoiceMealApi.parseVoiceMeal({
        audio: audioBase64,
        mimeType: 'audio/m4a',
        mealType: meal,
      });

      if (!result.items || result.items.length === 0) {
        setPhase('error');
        setErrorMessage(
          result.unclearReason || "Didn't catch any food items. Try speaking closer to the mic.",
        );
        return;
      }

      setTranscript(result.transcript || 'Spoken meal entry');
      setItems(result.items);
      setUnclearReason(result.unclearReason || null);
      setPhase('review');
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Failed to analyze voice input. Please try again.';
      setPhase('error');
      setErrorMessage(msg);
    }
  };

  const handleParseManualText = async () => {
    const text = manualText.trim();
    if (!text) return;

    try {
      setErrorMessage(null);
      setUnclearReason(null);
      setPhase('processing');

      const result = await VoiceMealApi.parseVoiceMeal({
        transcript: text,
        mealType: meal,
      });

      if (!result.items || result.items.length === 0) {
        setPhase('error');
        setErrorMessage(
          result.unclearReason ||
            'No recognizable food items found. Please describe foods and portions.',
        );
        return;
      }

      setTranscript(result.transcript || text);
      setItems(result.items);
      setUnclearReason(result.unclearReason || null);
      setPhase('review');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to parse text description.';
      setPhase('error');
      setErrorMessage(msg);
    }
  };

  const total = items.reduce(
    (a, i) => ({ kcal: a.kcal + i.kcal, protein: a.protein + i.protein }),
    { kcal: 0, protein: 0 },
  );

  const save = async () => {
    if (items.length === 0 || isSaving) return;
    try {
      setIsSaving(true);
      const id = await logMeal({
        mealType: meal,
        items,
        method: 'voice',
        ...(transcript ? { notes: `Voice entry: "${transcript}"` } : {}),
      });
      showToast({
        message: `${mealLabels[meal]} logged · ${total.kcal} kcal`,
      });
      replace('nutrition');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save meal.';
      showToast({ tone: 'error', message: msg });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
        {/* Top Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.muted }]}>Log a meal by voice</Text>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={goBack}
            style={[styles.closeCircle, { backgroundColor: colors.surface2 }]}
            accessibilityRole="button"
            accessibilityLabel="Close voice meal entry"
          >
            <X size={20} color={colors.ink} />
          </TouchableOpacity>
        </View>

        {/* Body Content */}
        {micPermission === 'denied' ? (
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.centerBox}>
            <MicOff size={36} color={colors.muted} />
            <Text style={[styles.permTitle, { color: colors.ink }]}>Microphone is off</Text>
            <Text style={[styles.permSub, { color: colors.muted }]}>
              Allow microphone access to log meals by voice, or type your meal below.
            </Text>
            <Button appearance="premium" style={{ marginTop: 24 }} onPress={handleStartListening}>
              Allow microphone
            </Button>

            <View style={styles.fallbackInputRow}>
              <TextInput
                style={[
                  styles.fallbackInput,
                  { color: colors.ink, borderColor: colors.line, backgroundColor: colors.surface },
                ]}
                placeholder="e.g. 2 rotis with dal and paneer"
                placeholderTextColor={colors.muted}
                value={manualText}
                onChangeText={setManualText}
                accessibilityLabel="Meal description"
                onSubmitEditing={handleParseManualText}
              />
              <TouchableOpacity
                style={[styles.sendBtn, { backgroundColor: colors.accent }]}
                onPress={handleParseManualText}
                accessibilityLabel="Parse text"
              >
                <Send size={18} color={colors.ink} />
              </TouchableOpacity>
            </View>
          </ScrollView>
        ) : phase === 'review' ? (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 24 }}
            style={styles.reviewContainer}
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.reviewLabel, { color: colors.muted }]}>You said</Text>
            <Text style={[styles.reviewPhrase, { color: colors.ink }]}>“{transcript}”</Text>

            {unclearReason && (
              <StatusBanner
                tone="warning"
                title="Estimate Notice"
                body={unclearReason}
                style={{ marginTop: 12 }}
              />
            )}

            <View style={styles.chipsRow}>
              {mealOrder.map((m) => (
                <Chip
                  appearance="premium"
                  key={m}
                  label={mealLabels[m]}
                  selected={m === meal}
                  onPress={() => setMeal(m)}
                />
              ))}
            </View>

            <View
              style={[
                styles.itemsCard,
                { backgroundColor: colors.surface, borderColor: colors.line },
              ]}
            >
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
              Voice entries are AI estimates. You can edit portions later from the meal diary.
            </Text>
          </ScrollView>
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.listenBox}>
            <Text style={[styles.promptText, { color: colors.ink }]}>
              {phase === 'idle' && (
                <Text style={{ color: colors.muted }}>
                  Say what you ate in English, Tamil, or Tanglish
                </Text>
              )}
              {phase === 'listening' &&
                (transcript || (
                  <Text style={{ color: colors.muted }}>Recording… Tap stop when you’re done.</Text>
                ))}
              {phase === 'idle' ? (
                <View style={{ width: '100%', gap: 12, marginTop: 24 }}>
                  <TextField
                    appearance="premium"
                    label="Meal description"
                    placeholder="Or type your meal and portions"
                    value={manualText}
                    onChangeText={setManualText}
                    multiline
                  />
                  <ActionButton
                    title="Review meal description"
                    variant="secondary"
                    disabled={!manualText.trim()}
                    onPress={handleParseManualText}
                  />
                </View>
              ) : null}

              {phase === 'processing' && (transcript || 'Analyzing food items…')}
              {phase === 'error' && (
                <Text style={{ color: colors.bad }}>
                  {errorMessage || 'Didn’t catch that. Try again in a quieter spot.'}
                </Text>
              )}
            </Text>

            <View style={styles.waveformContainer}>
              <VoiceWaveform active={phase === 'listening' && !reducedMotion} />
            </View>

            {phase === 'processing' && (
              <View style={styles.processingRow}>
                <ActivityIndicator size="small" color={colors.muted} />
                <Text style={[styles.processingText, { color: colors.muted }]}>
                  Matching foods and calculating nutrition…
                </Text>
              </View>
            )}

            {phase === 'error' && (
              <View style={styles.retrySection}>
                <Button
                  appearance="premium"
                  variant="outline"
                  size="sm"
                  icon={RefreshCw}
                  onPress={handleStartListening}
                >
                  Try speaking again
                </Button>

                <View style={styles.fallbackInputRow}>
                  <TextInput
                    style={[
                      styles.fallbackInput,
                      {
                        color: colors.ink,
                        borderColor: colors.line,
                        backgroundColor: colors.surface,
                      },
                    ]}
                    placeholder="Or type what you ate..."
                    placeholderTextColor={colors.muted}
                    value={manualText}
                    onChangeText={setManualText}
                    accessibilityLabel="Meal description"
                    onSubmitEditing={handleParseManualText}
                  />
                  <TouchableOpacity
                    style={[styles.sendBtn, { backgroundColor: colors.accent }]}
                    onPress={handleParseManualText}
                    accessibilityLabel="Parse text"
                  >
                    <Send size={18} color={colors.ink} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>
        )}

        {/* Bottom Controls */}
        {micPermission !== 'denied' && (
          <View style={styles.bottomBar}>
            {phase === 'review' ? (
              <View style={styles.reviewActions}>
                <Button
                  appearance="premium"
                  variant="outline"
                  size="lg"
                  icon={Mic}
                  onPress={handleStartListening}
                >
                  Redo
                </Button>
                <View style={{ flex: 1 }}>
                  <Button
                    appearance="premium"
                    size="lg"
                    fullWidth
                    icon={Check}
                    disabled={items.length === 0 || isSaving}
                    onPress={save}
                  >
                    {isSaving ? 'Logging…' : `Log ${mealLabels[meal].toLowerCase()}`}
                  </Button>
                </View>
              </View>
            ) : (
              <View style={styles.micBtnWrapper}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={phase === 'listening' ? handleStopListening : handleStartListening}
                  disabled={phase === 'processing'}
                  style={[
                    styles.micCircle,
                    { backgroundColor: colors.accent },
                    phase === 'processing' && { opacity: 0.5 },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{
                    disabled: phase === 'processing',
                    busy: phase === 'processing',
                  }}
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
    </KeyboardAvoidingView>
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
    ...premium.type.body,
  },
  closeCircle: {
    width: 44,
    minHeight: 48,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerBox: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  permTitle: {
    ...premium.type.title,
    marginTop: 16,
  },
  permSub: {
    ...premium.type.body,
    textAlign: 'center',
    marginTop: 8,
  },
  listenBox: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  promptText: {
    ...premium.type.title,
    textAlign: 'center',
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
    ...premium.type.body,
  },
  retrySection: {
    marginTop: 20,
    alignItems: 'center',
    width: '100%',
  },
  fallbackInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    width: '100%',
    gap: 8,
  },
  fallbackInput: {
    ...premium.type.body,
    flex: 1,
    minHeight: 48,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
  },
  sendBtn: {
    width: 44,
    minHeight: premium.layout.touch,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewContainer: {
    flex: 1,
    paddingTop: 12,
  },
  reviewLabel: {
    ...premium.type.caption,
  },
  reviewPhrase: {
    ...premium.type.label,
    marginTop: 4,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  itemsCard: {
    borderRadius: premium.radius.card,
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
    ...premium.type.body,
  },
  itemServing: {
    ...premium.type.caption,
    marginTop: 2,
  },
  warnPortion: {
    ...premium.type.caption,
    marginTop: 2,
  },
  itemKcal: {
    ...premium.type.body,
    fontVariant: ['tabular-nums'],
    marginRight: 8,
  },
  itemDeleteBtn: {
    width: 32,
    minHeight: premium.layout.touch,
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
    ...premium.type.body,
  },
  totalValue: {
    ...premium.type.body,
    fontVariant: ['tabular-nums'],
  },
  voiceFootnote: {
    ...premium.type.caption,
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
