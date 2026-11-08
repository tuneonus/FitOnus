import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Screen } from '../../../shared/components/ui/Screen';
import { StatusBanner } from '../../../shared/components/ui/StatusBanner';
import { useHealthStore } from '../../health-integration/store/healthStore';
import { HomeHeader } from '../components/HomeHeader';
import { DailyBrief } from '../components/DailyBrief';
import { RecommendedWorkout } from '../components/RecommendedWorkout';
import { ActivitySummary } from '../components/ActivitySummary';
import { NutritionSummary } from '../components/NutritionSummary';
import { BodySignals } from '../components/BodySignals';
import { CoachInsights } from '../components/CoachInsights';
import { HomeSkeleton } from '../components/HomeSkeleton';
import { QuickActions } from '../components/QuickActions';

export function HomeScreen() {
  const { status, lastSync, syncNow } = useHealthStore();

  return (
    <Screen showBack={false}>
      <HomeHeader />

      {status === 'loading' ? (
        <HomeSkeleton />
      ) : (
        <View style={styles.body}>
          {status === 'offline' && (
            <View style={styles.bannerWrap}>
              <StatusBanner
                tone="offline"
                title="You’re offline"
                body={`Showing data synced at ${lastSync}. Coach answers need a connection.`}
              />
            </View>
          )}

          {status === 'error' && (
            <View style={styles.bannerWrap}>
              <StatusBanner
                tone="error"
                title="Couldn’t refresh health data"
                body={`Last successful sync ${lastSync}.`}
                actionLabel="Retry"
                onAction={syncNow}
              />
            </View>
          )}

          <DailyBrief />
          <QuickActions />
          <RecommendedWorkout />
          <ActivitySummary />
          <NutritionSummary />
          <BodySignals />
          <CoachInsights />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingBottom: 24,
    gap: 8,
  },
  bannerWrap: {
    marginBottom: 16,
  },
});

