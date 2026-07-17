import React, { useCallback } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Alert } from 'react-native';
import { Activity, Moon, Droplets, Utensils, Scale, LineChart } from 'lucide-react-native';
import { ScreenContainer } from '@/components/shared/screen-container';
import { ErrorState } from '@/components/shared/error-state';
import { Spacing } from '@/constants/theme';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { useTheme } from '@/hooks/use-theme';

// Dashboard Hooks & Components
import { useDashboard } from '@/features/dashboard/hooks/use-dashboard';
import { DashboardHeader } from '@/features/dashboard/components/dashboard-header';
import { MetricCard } from '@/features/dashboard/components/metric-card';
import { AISummaryCard } from '@/features/dashboard/components/ai-summary-card';
import { WorkoutCard } from '@/features/dashboard/components/workout-card';
import { NutritionCard } from '@/features/dashboard/components/nutrition-card';
import { ProgressCard } from '@/features/dashboard/components/progress-card';
import { ActivityCard } from '@/features/dashboard/components/activity-card';
import { QuickActionCard } from '@/features/dashboard/components/quick-action-card';
import { DashboardSkeleton } from '@/features/dashboard/components/dashboard-skeleton';
import { Text } from '@/components/ui/text';

export default function DashboardScreen() {
  const user = useAuthStore((state) => state.user);
  const { colors } = useTheme();
  
  const { 
    data, 
    isLoading, 
    isError, 
    error,
    refetch,
    isRefetching
  } = useDashboard();

  const handleStartWorkout = useCallback(() => {
    Alert.alert('Start Workout', 'Navigating to workout player...');
  }, []);

  const handleQuickAction = useCallback((action: string) => {
    Alert.alert('Quick Action', `Triggered: ${action}`);
  }, []);

  if (isLoading && !data) {
    return <DashboardSkeleton />;
  }

  if (isError && !data) {
    return (
      <ScreenContainer edges={['top', 'bottom', 'left', 'right']}>
        <ErrorState 
          title="Failed to Load Dashboard" 
          message={error?.message || 'Please check your connection and try again.'}
          onRetry={refetch}
        />
      </ScreenContainer>
    );
  }

  // Fallback if somehow data is undefined but not loading/error
  if (!data) return null;

  return (
    <ScreenContainer edges={['top', 'left', 'right']} style={{ backgroundColor: colors.background }}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl 
            refreshing={isRefetching} 
            onRefresh={refetch} 
            tintColor={colors.primary}
          />
        }
      >
        <DashboardHeader user={user} />

        <View style={styles.metricsRow}>
          <MetricCard 
            title="Recovery" 
            value={`${data.summary.recoveryScore}%`} 
            icon={<Activity size={14} color={colors.primary} />} 
          />
          <MetricCard 
            title="Sleep" 
            value={data.summary.sleepDuration} 
            icon={<Moon size={14} color="#6366F1" />} 
          />
          <MetricCard 
            title="Water" 
            value={`${data.summary.waterIntake}L`} 
            icon={<Droplets size={14} color="#0EA5E9" />} 
          />
        </View>

        <View style={styles.section}>
          <AISummaryCard summary={data.aiSummary} />
        </View>

        <View style={styles.section}>
          <WorkoutCard workout={data.todayWorkout} onStart={handleStartWorkout} />
        </View>

        <View style={styles.section}>
          <NutritionCard nutrition={data.nutrition} />
        </View>

        <View style={styles.section}>
          <ProgressCard progress={data.progress} />
        </View>

        <View style={styles.section}>
          <Text variant="headlineSmall" style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickActionsRow}>
            <QuickActionCard 
              title="Log Meal" 
              icon={<Utensils size={24} color="#F87171" />} 
              onPress={() => handleQuickAction('Log Meal')} 
            />
            <QuickActionCard 
              title="Log Weight" 
              icon={<Scale size={24} color="#60A5FA" />} 
              onPress={() => handleQuickAction('Log Weight')} 
            />
            <QuickActionCard 
              title="Reports" 
              icon={<LineChart size={24} color="#10B981" />} 
              onPress={() => handleQuickAction('Reports')} 
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text variant="headlineSmall" style={styles.sectionTitle}>Recent Activity</Text>
          {data.recentActivity.map((activity) => (
            <ActivityCard key={activity.id} activity={activity} />
          ))}
        </View>
        
        {/* Added bottom padding for smooth scrolling over bottom edges */}
        <View style={{ height: Spacing.xxxl }} />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: Spacing.lg,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    marginBottom: Spacing.md,
  },
  quickActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: -4,
  },
});
