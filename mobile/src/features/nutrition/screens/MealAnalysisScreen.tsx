import { premium } from '@/shared/theme/premium';
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Info, Plus, AlertTriangle, X } from 'lucide-react-native';
import { useNavigation, useRouteParams } from '@/app/navigation/NavigationContext';
import { FeatureScreen as Screen } from '@/shared/components/ui/FeatureScreen';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { BottomSheet } from '@/shared/components/ui/BottomSheet';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { StatusBanner } from '@/shared/components/ui/StatusBanner';
import { showToast } from '@/shared/stores/toastStore';
import { useTheme } from '@/hooks/use-theme';
import { MealPhotoApi } from '../../ai-coach/services/meal-photo-api';
import { useHealthStore } from '../../health-integration/store/healthStore';
import { scaleFood, sumNutrients, useNutritionStore } from '../store/nutritionStore';
import { useQuery } from '@tanstack/react-query';
import { nutritionApi } from '../api/nutrition-api';
import { TextField } from '@/shared/components/ui/TextField';
import { mealLabels, mealOrder } from '../constants/meals';
import type { FoodItem, MealType } from '../types/nutrition';

type Row = { base: FoodItem; factor: number };

export function MealAnalysisScreen() {
  const { colors } = useTheme();
  const { popTo, replace } = useNavigation();
  const params = useRouteParams<{
    meal?: MealType;
    imageUri?: string;
    imageBase64?: string;
    mimeType?: string;
  }>();
  const mealParam = params.meal ?? 'lunch';

  const offline = useHealthStore((s) => s.status === 'offline');
  const { logMeal, removeEntry } = useNutritionStore();
  const saveLock = useRef(false);
  const [addingFood, setAddingFood] = useState(false);
  const [missingQuery, setMissingQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(missingQuery.trim()), 300);
    return () => clearTimeout(timer);
  }, [missingQuery]);
  const missingFood = useQuery({
    queryKey: ['nutrition', 'photo-missing', debouncedQuery],
    queryFn: () => nutritionApi.searchFoods({ q: debouncedQuery }),
    enabled: addingFood && debouncedQuery.length >= 2,
    retry: 1,
  });
  const [phase, setPhase] = useState<'analyzing' | 'review' | 'error'>('analyzing');
  const [rows, setRows] = useState<Row[]>([]);
  const [meal, setMeal] = useState<MealType>(mealParam as MealType);
  const [confirming, setConfirming] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [unclearWarning, setUnclearWarning] = useState<string | null>(null);

  const run = async () => {
    setPhase('analyzing');
    setErrorMessage(null);
    setUnclearWarning(null);

    if (offline) {
      setErrorMessage('You are offline. Reconnect to analyze meal photos.');
      setPhase('error');
      return;
    }

    try {
      if (!params.imageBase64) {
        setErrorMessage('No meal photo data provided. Please retake the photo.');
        setPhase('error');
        return;
      }

      const res = await MealPhotoApi.analyzeMealPhoto({
        image: params.imageBase64,
        mimeType: (params.mimeType as any) || 'image/jpeg',
        mealType: meal,
      });

      if (!res.isFood || res.items.length === 0) {
        setUnclearWarning(res.unclearReason || 'No recognizable food detected in the photo.');
        setRows([]);
        setPhase('review');
        return;
      }

      setRows(res.items.map((base) => ({ base, factor: 1 })));
      setPhase('review');
    } catch (err: any) {
      setErrorMessage(
        err?.message || 'The analysis service didn’t respond. Your photo wasn’t uploaded.',
      );
      setPhase('error');
    }
  };

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const items = rows.map((r) => scaleFood(r.base, r.factor));
  const totals = sumNutrients(items);

  const save = async () => {
    if (saveLock.current || !items.length) return;
    saveLock.current = true;
    try {
      setIsSaving(true);
      const id = await logMeal({
        mealType: meal,
        items,
        method: 'photo',
      });
      setConfirming(false);
      showToast({
        message: `Meal saved to ${mealLabels[meal]}`,
      });
      popTo('nutrition');
    } catch (err: any) {
      showToast({
        message: err?.message || 'Failed to save meal.',
      });
    } finally {
      saveLock.current = false;
      setIsSaving(false);
    }
  };

  return (
    <Screen
      title="Meal analysis"
      footer={
        phase === 'review' ? (
          <Button
            appearance="premium"
            size="lg"
            fullWidth
            disabled={!rows.length || isSaving}
            onPress={() => setConfirming(true)}
          >
            {isSaving ? 'Saving meal...' : `Review & save · ${Math.round(totals.kcal)} kcal`}
          </Button>
        ) : undefined
      }
      contentContainerStyle={styles.container}
    >
      {/* Photo preview */}
      <View style={styles.imageContainer}>
        {params.imageUri ? (
          <Image source={{ uri: params.imageUri }} style={styles.photo} resizeMode="cover" />
        ) : (
          <Text style={{ color: colors.muted, padding: 24 }}>No meal photo selected.</Text>
        )}
      </View>

      {/* Phase: Analyzing */}
      {phase === 'analyzing' && (
        <View style={styles.phaseBox}>
          <Text style={[styles.phaseTitle, { color: colors.ink }]}>Identifying foods…</Text>
          <View style={styles.thinkingWrapper}>
            <ActivityIndicator
              accessibilityLabel="Analyzing your meal photo"
              size="large"
              color={colors.accentStrong}
            />
          </View>
        </View>
      )}

      {/* Phase: Error */}
      {phase === 'error' && (
        <View style={styles.phaseBox}>
          <StatusBanner
            tone="error"
            title="Couldn’t analyze this photo"
            body={
              errorMessage || 'The analysis service didn’t respond. Your photo wasn’t uploaded.'
            }
            actionLabel="Retry"
            onAction={run}
          />
          <Button
            appearance="premium"
            variant="outline"
            fullWidth
            onPress={() => popTo('nutrition')}
          >
            Log manually instead
          </Button>
        </View>
      )}

      {/* Phase: Review */}
      {phase === 'review' && (
        <>
          {unclearWarning && (
            <View style={{ marginBottom: 16 }}>
              <StatusBanner
                tone="warning"
                title="Unclear or Non-Food Photo"
                body={unclearWarning}
                actionLabel="Retake Photo"
                onAction={() => replace('mealPhoto', { meal })}
              />
            </View>
          )}

          <View style={[styles.infoBanner, { backgroundColor: colors.surface2 }]}>
            <View style={{ marginTop: 2 }}>
              <Info size={16} color={colors.ink} />
            </View>
            <Text style={[styles.infoBannerText, { color: colors.muted }]}>
              All values are AI estimates from the photo. Adjust portions or remove anything that’s
              wrong before saving.
            </Text>
          </View>

          {/* Food Items List */}
          <View style={styles.itemsList}>
            {rows.map((r, i) => {
              const scaled = items[i]!;
              const low = (r.base.confidence ?? 1) < 0.7;

              return (
                <View
                  key={r.base.id}
                  style={[
                    styles.rowCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: low ? colors.warn : colors.line,
                    },
                  ]}
                >
                  <View style={styles.rowHeader}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={[styles.rowName, { color: colors.ink }]}>{r.base.name}</Text>
                      <Text style={[styles.rowServing, { color: colors.muted }]}>
                        {scaled.serving}
                      </Text>
                    </View>
                    <View style={styles.rowHeaderActions}>
                      <Badge tone={low ? 'warn' : 'neutral'}>
                        {r.base.confidence == null
                          ? 'AI estimate'
                          : `${Math.round(r.base.confidence * 100)}% confidence`}
                      </Badge>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => setRows(rows.filter((_, j) => j !== i))}
                        style={styles.removeBtn}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${r.base.name}`}
                      >
                        <X size={16} color={colors.muted} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {low && (
                    <View style={styles.warnRow}>
                      <AlertTriangle size={13} color={colors.warn} />
                      <Text style={[styles.warnText, { color: colors.warn }]}>
                        Low confidence — please check this item.
                      </Text>
                    </View>
                  )}

                  <View style={styles.rowFooter}>
                    <View style={styles.factorButtons}>
                      {[0.5, 1, 1.5, 2].map((f) => (
                        <TouchableOpacity
                          key={f}
                          activeOpacity={0.7}
                          onPress={() =>
                            setRows(rows.map((x, j) => (j === i ? { ...x, factor: f } : x)))
                          }
                          style={[
                            styles.factorBtn,
                            r.factor === f
                              ? { backgroundColor: colors.ink }
                              : { backgroundColor: colors.surface2 },
                          ]}
                        >
                          <Text
                            style={[
                              styles.factorText,
                              { color: r.factor === f ? colors.bg : colors.ink },
                            ]}
                          >
                            {f}×
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Text style={[styles.rowKcalSummary, { color: colors.ink }]}>
                      {scaled.kcal} kcal · {scaled.protein}g P
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>

          <Button
            appearance="premium"
            variant="outline"
            icon={Plus}
            title="Add a missing food"
            onPress={() => setAddingFood(true)}
          />

          {/* Macro Summary Hero */}
          <View style={[styles.macroHero, { backgroundColor: colors.surface2 }]}>
            {[
              ['kcal', Math.round(totals.kcal)],
              ['Protein', `${Math.round(totals.protein)}g`],
              ['Carbs', `${Math.round(totals.carbs)}g`],
              ['Fat', `${Math.round(totals.fat)}g`],
              ['Fiber', `${Math.round(totals.fiber)}g`],
            ].map(([l, v]) => (
              <View key={String(l)} style={styles.macroHeroItem}>
                <Text style={[styles.macroHeroLabel, { color: colors.muted }]}>{l}</Text>
                <Text style={[styles.macroHeroVal, { color: colors.ink }]}>{v}</Text>
              </View>
            ))}
          </View>
          <Text style={[styles.estFootnote, { color: colors.muted }]}>
            AI estimate · Review the portions and ingredients before saving.
          </Text>
        </>
      )}

      <BottomSheet
        visible={addingFood}
        onClose={() => setAddingFood(false)}
        title="Add a missing food"
        description="Choose a food and review its portion."
      >
        <TextField
          appearance="premium"
          label="Search foods"
          placeholder="Food, brand or dish"
          value={missingQuery}
          onChangeText={setMissingQuery}
        />
        {missingFood.isFetching ? (
          <ActivityIndicator
            accessibilityLabel="Searching missing food"
            color={colors.accentStrong}
          />
        ) : null}
        {missingFood.isError ? (
          <StatusBanner
            tone="error"
            title="Couldn’t search foods"
            actionLabel="Retry"
            onAction={() => {
              void missingFood.refetch();
            }}
          />
        ) : null}
        {missingFood.data?.foods.length === 0 && !missingFood.isFetching ? (
          <Text accessibilityLiveRegion="polite" style={{ color: colors.muted }}>
            No matching foods. Try another name.
          </Text>
        ) : null}
        <View style={styles.confirmList}>
          {missingFood.data?.foods.map((food) => (
            <Button
              appearance="premium"
              variant="secondary"
              fullWidth
              key={food.id}
              title={`${food.name} · ${food.kcal} kcal · ${food.serving}`}
              onPress={() => {
                setRows((previous) => [...previous, { base: food, factor: 1 }]);
                setAddingFood(false);
                setMissingQuery('');
              }}
            />
          ))}
        </View>
      </BottomSheet>
      {/* Confirmation Bottom Sheet */}
      <BottomSheet
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Save this meal?"
        description={`${rows.length} items · ${Math.round(totals.kcal)} kcal (estimated)`}
        footer={
          <Button appearance="premium" size="lg" fullWidth disabled={isSaving} onPress={save}>
            {isSaving ? 'Saving...' : `Save to ${mealLabels[meal]}`}
          </Button>
        }
      >
        <SegmentedControl
          appearance="premium"
          options={mealOrder.map((m) => ({ value: m, label: mealLabels[m] }))}
          value={meal}
          onChange={(val) => setMeal(val as MealType)}
        />
        <View style={styles.confirmList}>
          {items.map((i, idx) => (
            <View
              key={i.id || idx.toString()}
              style={[
                styles.confirmRow,
                { borderBottomColor: colors.line },
                idx === items.length - 1 && { borderBottomWidth: 0 },
              ]}
            >
              <Text style={[styles.confirmName, { color: colors.ink }]}>{i.name}</Text>
              <Text style={[styles.confirmKcal, { color: colors.muted }]}>{i.kcal} kcal</Text>
            </View>
          ))}
        </View>
        <Text style={[styles.confirmFootnote, { color: colors.muted }]}>
          Review these estimated portions before saving this meal.
        </Text>
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 24,
    gap: 16,
  },
  imageContainer: {
    borderRadius: premium.radius.card,
    overflow: 'hidden',
    height: 220,
    width: '100%',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  phaseBox: {
    gap: 14,
  },
  phaseTitle: {
    ...premium.type.label,
  },
  thinkingWrapper: {
    marginTop: 4,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 16,
    padding: 14,
  },
  infoBannerText: {
    ...premium.type.caption,
    flex: 1,
  },
  itemsList: {
    gap: 10,
  },
  rowCard: {
    borderRadius: premium.radius.card,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  rowName: {
    ...premium.type.body,
  },
  rowServing: {
    ...premium.type.caption,
    marginTop: 2,
  },
  rowHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  removeBtn: {
    width: 32,
    minHeight: premium.layout.touch,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  warnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  warnText: {
    ...premium.type.caption,
  },
  rowFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  factorButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  factorBtn: {
    minHeight: premium.layout.touch,
    minWidth: premium.layout.touch,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  factorText: {
    ...premium.type.caption,
    fontVariant: ['tabular-nums'],
  },
  rowKcalSummary: {
    ...premium.type.caption,
    fontVariant: ['tabular-nums'],
  },
  macroHero: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    borderRadius: 18,
    padding: 14,
    justifyContent: 'space-between',
  },
  macroHeroItem: {
    flexBasis: 80,
    flexGrow: 1,
    minWidth: 80,
    alignItems: 'center',
    gap: 3,
  },
  macroHeroLabel: {
    ...premium.type.caption,
  },
  macroHeroVal: {
    ...premium.type.body,
    fontVariant: ['tabular-nums'],
  },
  estFootnote: {
    ...premium.type.caption,
    textAlign: 'center',
  },
  confirmList: {
    marginTop: 16,
    gap: 0,
  },
  confirmRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  confirmName: {
    ...premium.type.body,
  },
  confirmKcal: {
    ...premium.type.body,
    fontVariant: ['tabular-nums'],
  },
  confirmFootnote: {
    ...premium.type.caption,
    marginTop: 12,
  },
});
