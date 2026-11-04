import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView } from 'react-native';
import { Info, Plus, AlertTriangle, X } from 'lucide-react-native';
import { useNavigation, useRouteParams } from '@/app/navigation/NavigationContext';
import { Screen } from '@/shared/components/ui/Screen';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { BottomSheet } from '@/shared/components/ui/BottomSheet';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { StatusBanner } from '@/shared/components/ui/StatusBanner';
import { images } from '@/shared/constants/images';
import { showToast } from '@/shared/stores/toastStore';
import { useTheme } from '@/hooks/use-theme';
import { ThinkingIndicator } from '../../ai-coach/components/ThinkingIndicator';
import { mockAiTools } from '../../ai-coach/services/mockAiTools';
import { useHealthStore } from '../../health-integration/store/healthStore';
import { scaleFood, sumNutrients, useNutritionStore } from '../store/nutritionStore';
import { foodDatabase } from '../data/foodsMock';
import { mealLabels, mealOrder } from '../constants/meals';
import type { FoodItem, MealType } from '../types/nutrition';

type Row = { base: FoodItem; factor: number };

export function MealAnalysisScreen() {
  const { colors } = useTheme();
  const { popTo } = useNavigation();
  const params = useRouteParams<{ meal?: MealType }>();
  const mealParam = params.meal ?? 'lunch';

  const offline = useHealthStore((s) => s.status === 'offline');
  const { addEntry, removeEntry } = useNutritionStore();
  const [phase, setPhase] = useState<'analyzing' | 'review' | 'error'>('analyzing');
  const [rows, setRows] = useState<Row[]>([]);
  const [meal, setMeal] = useState<MealType>(mealParam as MealType);
  const [confirming, setConfirming] = useState(false);

  const run = async () => {
    setPhase('analyzing');
    if (offline) {
      setTimeout(() => setPhase('error'), 1500);
      return;
    }
    const res = await mockAiTools.analyzeMealImage({ imageUri: 'photo://lunch' });
    setRows(res.items.map((base) => ({ base, factor: 1 })));
    setPhase('review');
  };

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const items = rows.map((r) => scaleFood(r.base, r.factor));
  const totals = sumNutrients(items);

  const save = () => {
    const id = addEntry({
      meal,
      time: 'Just now',
      method: 'photo',
      items: items.map((i, idx) => ({ ...i, id: `ph-${Date.now()}-${idx}` })),
    });
    setConfirming(false);
    showToast({
      message: `Meal saved to ${mealLabels[meal]}`,
      actionLabel: 'Undo',
      onAction: () => removeEntry(id),
    });
    popTo('nutrition');
  };

  return (
    <Screen
      title="Meal analysis"
      footer={
        phase === 'review' ? (
          <Button
            size="lg"
            fullWidth
            disabled={!rows.length}
            onPress={() => setConfirming(true)}
          >
            Review & save · {Math.round(totals.kcal)} kcal
          </Button>
        ) : undefined
      }
    >
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Photo preview */}
        <View style={styles.imageContainer}>
          <Image source={images.mealPhoto} style={styles.photo} resizeMode="cover" />
        </View>

        {/* Phase: Analyzing */}
        {phase === 'analyzing' && (
          <View style={styles.phaseBox}>
            <Text style={[styles.phaseTitle, { color: colors.ink }]}>Identifying foods…</Text>
            <View style={styles.thinkingWrapper}>
              <ThinkingIndicator toolCalls={['analyzeMealImage', 'searchFood', 'getNutritionLogs']} />
            </View>
          </View>
        )}

        {/* Phase: Error */}
        {phase === 'error' && (
          <View style={styles.phaseBox}>
            <StatusBanner
              tone="error"
              title="Couldn’t analyze this photo"
              body="The analysis service didn’t respond. Your photo wasn’t uploaded."
              actionLabel="Retry"
              onAction={run}
            />
            <Button variant="outline" fullWidth onPress={() => popTo('nutrition')}>
              Log manually instead
            </Button>
          </View>
        )}

        {/* Phase: Review */}
        {phase === 'review' && (
          <>
            <View style={[styles.infoBanner, { backgroundColor: colors.surface2 }]}>
              <View style={{ marginTop: 2 }}>
                <Info size={16} color={colors.ink} />
              </View>
              <Text style={[styles.infoBannerText, { color: colors.muted }]}>
                All values are AI estimates from the photo. Adjust portions or remove anything that’s wrong before saving.
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
                          {Math.round((r.base.confidence ?? 1) * 100)}% sure
                        </Badge>
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={() => setRows(rows.filter((_, j) => j !== i))}
                          style={styles.removeBtn}
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
              variant="outline"
              fullWidth
              icon={Plus}
              onPress={() =>
                setRows([
                  ...rows,
                  {
                    base: {
                      ...(foodDatabase[10] || foodDatabase[0]!),
                      estimated: true,
                      confidence: 1,
                      id: `add-${Date.now()}`,
                    },
                    factor: 1,
                  },
                ])
              }
            >
              Add missing item (roti)
            </Button>

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
              Estimated · ±15–25% typical for photo analysis
            </Text>
          </>
        )}
      </ScrollView>

      {/* Confirmation Bottom Sheet */}
      <BottomSheet
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Save this meal?"
        description={`${rows.length} items · ${Math.round(totals.kcal)} kcal (estimated)`}
        footer={
          <Button size="lg" fullWidth onPress={save}>
            Save to {mealLabels[meal]}
          </Button>
        }
      >
        <SegmentedControl
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
          Saved items stay marked “Est.” so you and your coach know they weren’t weighed.
        </Text>
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 16,
  },
  imageContainer: {
    borderRadius: 24,
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
    fontSize: 17,
    fontWeight: '600',
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
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  itemsList: {
    gap: 10,
  },
  rowCard: {
    borderRadius: 20,
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
    fontSize: 15,
    fontWeight: '600',
  },
  rowServing: {
    fontSize: 12.5,
    marginTop: 2,
  },
  rowHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  removeBtn: {
    width: 32,
    height: 32,
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
    fontSize: 12.5,
  },
  rowFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  factorButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  factorBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  factorText: {
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  rowKcalSummary: {
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  macroHero: {
    flexDirection: 'row',
    borderRadius: 18,
    padding: 14,
    justifyContent: 'space-between',
  },
  macroHeroItem: {
    alignItems: 'center',
    gap: 3,
  },
  macroHeroLabel: {
    fontSize: 11,
  },
  macroHeroVal: {
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  estFootnote: {
    textAlign: 'center',
    fontSize: 12,
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
    fontSize: 14,
    fontWeight: '500',
  },
  confirmKcal: {
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  confirmFootnote: {
    marginTop: 12,
    fontSize: 12.5,
    lineHeight: 17,
  },
});
