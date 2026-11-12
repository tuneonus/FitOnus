import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, RefreshControl } from 'react-native';
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
import { ListGroup, ListRow } from '@/shared/components/ui/ListRow';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
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

/** Equal-width shortcut tile for one way of logging food. */
function LogMethodTile({
  icon: Icon,
  label,
  onPress,
}: {
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        {
          backgroundColor: colors.surface,
          borderColor: colors.line,
          opacity: pressed ? 0.8 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
      ]}
    >
      <View style={[styles.tileIcon, { backgroundColor: colors.accentSoft }]}>
        <Icon size={20} color={colors.accentStrong} strokeWidth={2} />
      </View>
      <Text style={[styles.tileLabel, { color: colors.ink }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

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
      showToast({ tone: 'error', message: 'Couldn’t save water. Please try again.' });
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
      eyebrow={`${isToday ? 'Today' : 'Viewing'} · ${dateLabel}`}
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
        {!isToday ? (
          <StatusBanner
            tone="info"
            title={`Viewing ${dateLabel}`}
            body="Logs you add go to this date."
            actionLabel="Today"
            onAction={() => setSelectedDate(localDateKey())}
          />
        ) : null}
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
          <LogMethodTile
            icon={Camera}
            label="Photo"
            onPress={() => navigate('mealPhoto', { meal: 'lunch' })}
          />
          <LogMethodTile
            icon={ScanBarcode}
            label="Barcode"
            onPress={() => navigate('barcodeScanner', { meal: 'snacks' })}
          />
          <LogMethodTile
            icon={Mic}
            label="Voice"
            onPress={() => navigate('voiceMealEntry', { meal: 'lunch' })}
          />
        </View>
        <View>
          <SectionHeader title="Water" subtitle="Tap an amount to add it to this day." />
          <Card style={styles.waterCard}>
            <Text style={[styles.waterValue, { color: colors.ink }]}>
              {day.waterMl === null
                ? '—'
                : (day.waterMl / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              <Text style={[premium.type.label, { color: colors.muted }]}>
                {day.goals.waterMl === null
                  ? ' L · Goal unavailable'
                  : ` / ${day.goals.waterMl / 1000} L`}
              </Text>
            </Text>
            <ProgressBar
              value={progressRatio(day.waterMl, day.goals.waterMl)}
              height={6}
              color={colors.sky}
            />
            <View style={styles.waterButtons}>
              {[250, 500, 750].map((amount) => (
                <Button
                  key={amount}
                  title={`+${amount} ml`}
                  size="sm"
                  variant="secondary"
                  disabled={waterBusy !== null}
                  loading={waterBusy === amount}
                  onPress={() => {
                    void logDrink(amount);
                  }}
                  style={styles.waterButton}
                />
              ))}
            </View>
          </Card>
        </View>
        <View style={styles.meals}>
          <SectionHeader title="Your meals" />
          {mealOrder.map((meal) => {
            const group = visibleEntries.filter((entry) => entry.meal === meal);
            const kcal = group
              .flatMap((entry) => entry.items)
              .reduce((sum, item) => sum + item.kcal, 0);
            const items = group.flatMap((entry) =>
              entry.items.map((item, index) => ({ entry, item, index })),
            );
            return (
              <Card key={meal} padded={false}>
                <View style={styles.mealHeader}>
                  <View style={styles.copy}>
                    <Text
                      accessibilityRole="header"
                      style={[premium.type.cardTitle, { color: colors.ink }]}
                    >
                      {mealLabels[meal]}
                    </Text>
                    <Text style={[premium.type.caption, { color: colors.muted }]}>
                      {group.length ? `${Math.round(kcal)} kcal logged` : 'Nothing logged yet'}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Add to ${mealLabels[meal].toLowerCase()}`}
                    onPress={() => setAddMeal(meal)}
                    hitSlop={6}
                    style={({ pressed }) => [
                      styles.addButton,
                      { backgroundColor: colors.accentSoft, opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <Plus size={18} color={colors.accentStrong} strokeWidth={2.4} />
                    <Text style={[styles.addText, { color: colors.accentStrong }]}>Add</Text>
                  </Pressable>
                </View>
                {items.map(({ entry, item, index }) => (
                  <Pressable
                    key={`${entry.id}-${item.id}-${index}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${item.name}, ${Math.round(item.kcal)} calories`}
                    onPress={() => setEditing({ entry, item })}
                    style={({ pressed }) => [
                      styles.food,
                      { borderTopColor: colors.lineSoft },
                      pressed && { backgroundColor: colors.surface2 },
                    ]}
                  >
                    <View style={styles.copy}>
                      <Text style={[premium.type.label, { color: colors.ink }]} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text
                        style={[premium.type.caption, { color: colors.muted }]}
                        numberOfLines={1}
                      >
                        {item.serving} · {entry.time}
                        {item.estimated ? ' · AI estimate' : ''}
                        {entry.isSynced === false ? ' · Pending sync' : ''}
                      </Text>
                    </View>
                    <Text style={[styles.kcal, { color: colors.ink }]}>
                      {Math.round(item.kcal)}
                      <Text style={[premium.type.caption, { color: colors.muted }]}> kcal</Text>
                    </Text>
                  </Pressable>
                ))}
              </Card>
            );
          })}
        </View>
        <View>
          <SectionHeader title="Go deeper" />
          <ListGroup style={styles.group}>
            <ListRow
              icon={BookOpenText}
              title="Meal diary"
              subtitle="Review your logged days and weekly trends."
              onPress={() => navigate('mealDiary')}
            />
            <ListRow
              icon={BarChart3}
              title="Nutrition analytics"
              subtitle="See your nutrition patterns over time."
              onPress={() => navigate('nutritionAnalytics')}
            />
            <ListRow
              icon={Sparkles}
              title="Plan with your Coach"
              subtitle="Ask about meals and your saved nutrition targets."
              onPress={() =>
                navigate('coach', { q: 'Help me plan meals around my saved nutrition targets.' })
              }
            />
          </ListGroup>
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
  methods: { flexDirection: 'row', gap: 10 },
  tile: {
    flex: 1,
    minHeight: 88,
    borderRadius: premium.radius.card,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  tileIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: { ...premium.type.label, fontSize: 13.5 },
  waterCard: { gap: 14 },
  waterValue: { ...premium.type.metric },
  waterButtons: { flexDirection: 'row', gap: 8 },
  waterButton: { flex: 1 },
  meals: { gap: 10 },
  mealHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
  },
  addText: { fontSize: 13.5, fontWeight: '700' },
  food: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 18,
    gap: 12,
    borderTopWidth: 1,
  },
  copy: { flex: 1, gap: 2 },
  kcal: { ...premium.type.label, fontVariant: ['tabular-nums'] },
  group: { marginVertical: 0 },
});
