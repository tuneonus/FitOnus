import React from 'react';
import { View, Text, StyleSheet, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { BookOpenText } from 'lucide-react-native';
import { useNavigation } from '@/app/navigation/NavigationContext';
import { FeatureScreen } from '@/shared/components/ui/FeatureScreen';
import { SectionHeader } from '@/shared/components/ui/SectionHeader';
import { MetricDisplay } from '@/shared/components/ui/MetricDisplay';
import { ActionRow } from '@/shared/components/ui/ActionRow';
import { EmptyState } from '@/shared/components/ui/EmptyState';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { StatusBanner } from '@/shared/components/ui/StatusBanner';
import { BarChart } from '@/shared/components/charts/BarChart';
import { useTheme } from '@/hooks/use-theme';
import { premium } from '@/shared/theme/premium';
import { useNutritionStore } from '../store/nutritionStore';
import { nutritionApi } from '../api/nutrition-api';

export function MealDiaryScreen() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const setSelectedDate = useNutritionStore((state) => state.setSelectedDate);
  const diary = useQuery({
    queryKey: ['dashboard', 'nutrition-diary', 'week'],
    queryFn: () => nutritionApi.getNutritionAnalytics('week'),
    retry: 1,
  });
  const data = diary.data;
  const days = [...(data?.caloriesTrend ?? [])].reverse();
  return (
    <FeatureScreen
      title="Meal diary"
      refreshControl={
        <RefreshControl
          refreshing={diary.isRefetching}
          onRefresh={() => {
            void diary.refetch();
          }}
          tintColor={colors.accentStrong}
        />
      }
    >
      <View style={styles.content}>
        <Text style={[premium.type.body, { color: colors.muted }]}>
          A clearer view of your week. Tap a logged day to review its meals.
        </Text>
        {diary.isLoading ? (
          <View accessibilityLabel="Loading nutrition history" accessibilityState={{ busy: true }}>
            <Skeleton height={160} />
          </View>
        ) : null}
        {diary.isError ? (
          <StatusBanner
            tone="error"
            title="Couldn’t refresh your diary"
            body="Your saved meal entries are unchanged. Try loading the week again."
            actionLabel="Retry"
            onAction={() => {
              void diary.refetch();
            }}
          />
        ) : null}
        {data ? (
          <>
            <View style={[styles.metrics, { borderColor: colors.line }]}>
              <MetricDisplay
                label="Average calories"
                value={Math.round(data.avgCalories).toLocaleString()}
                unit="kcal"
              />
              <MetricDisplay
                label="Average protein"
                value={String(Math.round(data.avgProtein))}
                unit="g"
              />
            </View>
            <SectionHeader
              appearance="premium"
              title="Calories this week"
              subtitle={`${data.loggedDaysCount} of ${data.totalDaysInRange} days logged`}
            />
            {days.length ? (
              <BarChart
                data={data.caloriesTrend.map((day) => ({ label: day.label, value: day.value }))}
                height={144}
                barColor={colors.accentStrong}
                formatValue={(value) => `${Math.round(value)} kcal`}
              />
            ) : null}
          </>
        ) : null}
        {!diary.isLoading && !diary.isError && !days.length ? (
          <EmptyState
            appearance="premium"
            icon={BookOpenText}
            title="Your diary starts here"
            body="Logged meals will build a picture of your week."
            actionLabel="Log a meal"
            onAction={() => navigate('nutrition')}
          />
        ) : null}
        {days.length ? (
          <View>
            <SectionHeader appearance="premium" title="Logged days" />
            {days.map((day) => (
              <ActionRow
                key={day.date}
                icon={BookOpenText}
                title={day.label || day.date}
                detail={`${Math.round(day.value).toLocaleString()} kcal logged`}
                onPress={() => {
                  setSelectedDate(day.date);
                  navigate('nutrition');
                }}
              />
            ))}
          </View>
        ) : null}
      </View>
    </FeatureScreen>
  );
}
const styles = StyleSheet.create({
  content: { gap: 20, paddingBottom: 24 },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 24,
    paddingVertical: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
