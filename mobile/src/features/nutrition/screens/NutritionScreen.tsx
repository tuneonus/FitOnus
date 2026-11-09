import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import {
  BookOpenText,
  BarChart3,
  Camera,
  ScanBarcode,
  Mic,
  Plus,
  Sparkles,
} from 'lucide-react-native';
import { useNavigation } from '@/app/navigation/NavigationContext';
import { FeatureScreen } from '@/shared/components/ui/FeatureScreen';
import { ActionButton } from '@/shared/components/ui/ActionButton';
import { ActionRow } from '@/shared/components/ui/ActionRow';
import { SectionHeader } from '@/shared/components/ui/SectionHeader';
import { StatusBanner } from '@/shared/components/ui/StatusBanner';
import { ProgressBar } from '@/shared/components/ui/ProgressBar';
import { showToast } from '@/shared/stores/toastStore';
import { useTheme } from '@/hooks/use-theme';
import { premium } from '@/shared/theme/premium';
import { NutritionSummary } from '@/features/home/components/NutritionSummary';
import { HomeSkeleton } from '@/features/home/components/HomeSkeleton';
import {
  buildHomeNutrition,
  localDateKey,
  progressRatio,
} from '@/features/home/utils/home-overview';
import { useNutritionStore } from '../store/nutritionStore';
import { mealLabels, mealOrder } from '../constants/meals';
import { AddFoodSheet } from '../components/AddFoodSheet';
import { FoodItemSheet } from '../components/FoodItemSheet';
import type { FoodItem, MealEntry, MealType } from '../types/nutrition';

export function NutritionScreen() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const {
    entries,
    dailySummary,
    selectedDate,
    setSelectedDate,
    waterMl,
    isLoading,
    isRefreshing,
    error,
    pendingSyncCount,
    fetchDailyNutrition,
    logWater,
    syncPendingMutations,
    refreshPendingSyncCount,
  } = useNutritionStore();
  const [addMeal, setAddMeal] = useState<MealType | null>(null);
  const [editing, setEditing] = useState<{ entry: MealEntry; item: FoodItem } | null>(null);
  const [waterBusy, setWaterBusy] = useState<number | null>(null);
  const waterLock = useRef(false);
  const [syncing, setSyncing] = useState(false);
  useEffect(() => {
    void fetchDailyNutrition();
    void refreshPendingSyncCount();
  }, [fetchDailyNutrition, refreshPendingSyncCount]);
  const day = buildHomeNutrition({
    date: selectedDate,
    summary: dailySummary,
    cachedSummary: null,
    entries,
    selectedDate,
    waterMl,
  });
  const isToday = selectedDate === localDateKey();
  const overview = {
    ...day,
    sourceLabel: isToday ? day.sourceLabel : 'Logged nutrition for this date',
  };
  const dateLabel = new Date(`${selectedDate}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const logDrink = async (amount: number) => {
    if (waterLock.current) return;
    waterLock.current = true;
    setWaterBusy(amount);
    try {
      await logWater(amount);
      showToast({ message: `${amount} ml water added` });
    } catch {
      showToast({ message: 'Couldn’t save water. Please try again.' });
    } finally {
      waterLock.current = false;
      setWaterBusy(null);
    }
  };
  const sync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      await syncPendingMutations();
    } finally {
      setSyncing(false);
    }
  };
  const visibleEntries = entries.filter((entry) => !entry.date || entry.date === selectedDate);
  return (
    <FeatureScreen
      title="Nutrition"
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={() => {
            void fetchDailyNutrition(undefined, true);
          }}
          tintColor={colors.accentStrong}
        />
      }
      footer={<ActionButton title="Log a meal" icon={Plus} onPress={() => setAddMeal('lunch')} />}
    >
      <View style={styles.content}>
        <View style={styles.dateRow}>
          <Text style={[premium.type.label, { color: colors.muted }]}>
            {isToday ? 'TODAY' : 'VIEWING'} · {dateLabel}
          </Text>
          {!isToday ? (
            <ActionButton
              title="Today"
              variant="secondary"
              onPress={() => setSelectedDate(localDateKey())}
            />
          ) : null}
        </View>
        {error ? (
          <StatusBanner
            tone="error"
            title="Couldn’t refresh nutrition"
            body="Showing available logs. Your saved entries have not been removed."
            actionLabel="Retry"
            onAction={() => {
              void fetchDailyNutrition(undefined, true);
            }}
          />
        ) : null}
        {pendingSyncCount > 0 ? (
          <StatusBanner
            tone="offline"
            title={`${pendingSyncCount} entries waiting to sync`}
            body="Your entries are saved on this device."
            actionLabel={syncing ? 'Syncing…' : 'Sync now'}
            onAction={() => {
              void sync();
            }}
          />
        ) : null}
        {isLoading && !day.available ? (
          <HomeSkeleton />
        ) : (
          <NutritionSummary overview={overview} onOpen={() => navigate('mealDiary')} />
        )}
        <View style={styles.methods}>
          <ActionButton
            title="Meal photo"
            variant="secondary"
            icon={Camera}
            onPress={() => navigate('mealPhoto', { meal: 'lunch' })}
            style={styles.method}
          />
          <ActionButton
            title="Barcode"
            variant="secondary"
            icon={ScanBarcode}
            onPress={() => navigate('barcodeScanner', { meal: 'snacks' })}
            style={styles.method}
          />
          <ActionButton
            title="Voice entry"
            variant="secondary"
            icon={Mic}
            onPress={() => navigate('voiceMealEntry', { meal: 'lunch' })}
            style={styles.method}
          />
        </View>
        <View>
          <SectionHeader
            appearance="premium"
            title="Water"
            subtitle="Tap an amount to add it to this day."
          />
          <Text style={[styles.waterValue, { color: colors.ink }]}>
            {day.waterMl === null
              ? '—'
              : (day.waterMl / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })}{' '}
            L
            <Text style={[premium.type.body, { color: colors.muted }]}>
              {day.goals.waterMl === null
                ? ' · Goal unavailable'
                : ` / ${day.goals.waterMl / 1000} L`}
            </Text>
          </Text>
          <ProgressBar
            value={progressRatio(day.waterMl, day.goals.waterMl)}
            height={5}
            color={colors.sky}
            style={styles.waterBar}
          />
          <View style={styles.methods}>
            {[250, 500, 750].map((amount) => (
              <ActionButton
                key={amount}
                title={`+ ${amount} ml`}
                accessibilityLabel={`Log ${amount} millilitres of water`}
                variant="secondary"
                disabled={waterBusy !== null}
                loading={waterBusy === amount}
                onPress={() => {
                  void logDrink(amount);
                }}
                style={styles.method}
              />
            ))}
          </View>
        </View>
        <View>
          <SectionHeader appearance="premium" title="Your meals" />
          {mealOrder.map((meal) => {
            const group = visibleEntries.filter((entry) => entry.meal === meal);
            const kcal = group
              .flatMap((entry) => entry.items)
              .reduce((sum, item) => sum + item.kcal, 0);
            return (
              <View key={meal} style={[styles.meal, { borderColor: colors.line }]}>
                <View style={styles.dateRow}>
                  <Text
                    accessibilityRole="header"
                    style={[premium.type.label, { color: colors.ink }]}
                  >
                    {mealLabels[meal]}
                  </Text>
                  <Text style={[premium.type.caption, { color: colors.muted }]}>
                    {group.length ? `${Math.round(kcal)} kcal logged` : 'Nothing logged'}
                  </Text>
                </View>
                {group.flatMap((entry) =>
                  entry.items.map((item, index) => (
                    <TouchableOpacity
                      key={`${entry.id}-${item.id}-${index}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${item.name}, ${Math.round(item.kcal)} calories`}
                      onPress={() => setEditing({ entry, item })}
                      style={styles.food}
                    >
                      <View style={styles.copy}>
                        <Text style={[premium.type.body, { color: colors.ink }]}>{item.name}</Text>
                        <Text style={[premium.type.caption, { color: colors.muted }]}>
                          {item.serving} · {entry.time}
                          {item.estimated ? ' · AI estimate' : ''}
                          {entry.isSynced === false ? ' · Pending sync' : ''}
                        </Text>
                      </View>
                      <Text style={[premium.type.label, { color: colors.ink }]}>
                        {Math.round(item.kcal)}
                      </Text>
                    </TouchableOpacity>
                  )),
                )}
                <ActionButton
                  title={`Add to ${mealLabels[meal].toLowerCase()}`}
                  icon={Plus}
                  variant="secondary"
                  onPress={() => setAddMeal(meal)}
                  style={styles.add}
                />
              </View>
            );
          })}
        </View>
        <View>
          <ActionRow
            icon={BookOpenText}
            title="Meal diary"
            detail="Review your logged days and weekly trends."
            onPress={() => navigate('mealDiary')}
          />
          <ActionRow
            icon={BarChart3}
            title="Nutrition analytics"
            detail="See your nutrition patterns over time."
            onPress={() => navigate('nutritionAnalytics')}
          />
          <ActionRow
            icon={Sparkles}
            title="Plan with your Coach"
            detail="Ask about meals and your saved nutrition targets."
            onPress={() =>
              navigate('coach', { q: 'Help me plan meals around my saved nutrition targets.' })
            }
          />
        </View>
      </View>
      <AddFoodSheet
        open={addMeal !== null}
        meal={addMeal ?? 'lunch'}
        onClose={() => setAddMeal(null)}
      />
      <FoodItemSheet target={editing} onClose={() => setEditing(null)} />
    </FeatureScreen>
  );
}
const styles = StyleSheet.create({
  content: { gap: 24, paddingBottom: 24 },
  dateRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  methods: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  method: { flexGrow: 1, flexBasis: 95 },
  waterValue: { ...premium.type.metric, marginVertical: 12 },
  waterBar: { marginBottom: 20 },
  meal: { paddingVertical: 20, borderTopWidth: StyleSheet.hairlineWidth },
  food: { minHeight: 72, flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  copy: { flex: 1, gap: 4 },
  add: { marginTop: 12 },
});
