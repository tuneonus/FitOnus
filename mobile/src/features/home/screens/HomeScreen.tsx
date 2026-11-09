import React from 'react';
import { View, StyleSheet, RefreshControl } from 'react-native';
import { useNavigation } from '@/app/navigation/NavigationContext';
import { useTheme } from '@/hooks/use-theme';
import { Screen } from '@/shared/components/ui/Screen';
import { StatusBanner } from '@/shared/components/ui/StatusBanner';
import { premium } from '@/shared/theme/premium';
import { useHealthStore } from '@/features/health-integration/store/healthStore';
import { useNutritionStore } from '@/features/nutrition/store/nutritionStore';
import { HomeHeader } from '../components/HomeHeader';
import { RecommendedWorkout } from '../components/RecommendedWorkout';
import { NutritionSummary } from '../components/NutritionSummary';
import { HydrationSummary } from '../components/HydrationSummary';
import { DailyMovement } from '../components/DailyMovement';
import { CoachEntry } from '../components/CoachEntry';
import { HomeSkeleton } from '../components/HomeSkeleton';
import { QuickActions } from '../components/QuickActions';
import { useHomeOverview } from '../hooks/use-home-overview';
import { localDateKey } from '../utils/home-overview';

export function HomeScreen() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const offline = useHealthStore((s) => s.status === 'offline');
  const { date, overview, dashboard, isLoading, isRefreshing, isError, pendingSyncCount, refresh } =
    useHomeOverview();

  const openToday = (destination: 'nutrition' | 'foodSearch') => {
    // A deliberate logging action opens today; viewing Home leaves historical diary state alone.
    const store = useNutritionStore.getState();
    if (store.selectedDate !== date) store.setSelectedDate(date);
    navigate(destination);
  };
  const summary =
    dashboard.data && localDateKey(new Date(dashboard.dataUpdatedAt)) === date
      ? dashboard.data.summary
      : undefined;

  return (
    <Screen
      showBack={false}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={() => {
            void refresh();
          }}
          tintColor={colors.accentStrong}
          colors={[colors.accentStrong]}
        />
      }
    >
      <HomeHeader />
      <View style={styles.sections}>
        {offline || isError ? (
          <StatusBanner
            tone={offline ? 'offline' : 'error'}
            title={offline ? 'You’re offline' : 'Couldn’t refresh nutrition'}
            body={
              overview.available
                ? 'Showing saved data. New logs will sync when connected.'
                : 'Your latest totals aren’t available. You can still log a meal.'
            }
            actionLabel="Retry"
            onAction={() => {
              void refresh();
            }}
          />
        ) : pendingSyncCount > 0 ? (
          <StatusBanner
            tone="offline"
            title="Logs saved on this device"
            body={`${pendingSyncCount} ${pendingSyncCount === 1 ? 'entry is' : 'entries are'} waiting to sync.`}
          />
        ) : null}
        <View style={styles.overview}>
          {isLoading ? (
            <HomeSkeleton />
          ) : (
            <NutritionSummary overview={overview} onOpen={() => openToday('nutrition')} />
          )}
          <QuickActions onLogMeal={() => openToday('foodSearch')} />
        </View>
        <RecommendedWorkout />
        <HydrationSummary overview={overview} onOpen={() => openToday('nutrition')} />
        <CoachEntry />
        <DailyMovement summary={summary} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: premium.layout.gutter,
    paddingTop: 0,
    width: '100%',
    maxWidth: premium.layout.maxWidth + premium.layout.gutter * 2,
    alignSelf: 'center',
  },
  sections: { gap: premium.space.xxl, paddingBottom: premium.space.xl },
  overview: { gap: premium.space.md },
});
