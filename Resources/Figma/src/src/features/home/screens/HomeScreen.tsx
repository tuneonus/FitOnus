import React from 'react';
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

export function HomeScreen() {
  const { status, lastSync, syncNow } = useHealthStore();

  return (
    <Screen>
      <HomeHeader />
      {status === 'loading' ?
      <HomeSkeleton /> :

      <div className="space-y-8">
          {status === 'offline' &&
        <div className="px-4">
              <StatusBanner tone="offline" title="You’re offline" body={`Showing data synced at ${lastSync}. Coach answers need a connection.`} />
            </div>
        }
          {status === 'error' &&
        <div className="px-4">
              <StatusBanner tone="error" title="Couldn’t refresh health data" body={`Last successful sync ${lastSync}.`} actionLabel="Retry" onAction={syncNow} />
            </div>
        }
          <DailyBrief />
          <RecommendedWorkout />
          <ActivitySummary />
          <NutritionSummary />
          <BodySignals />
          <CoachInsights />
        </div>
      }
    </Screen>);

}