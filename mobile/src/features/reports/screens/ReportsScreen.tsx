import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import { CalendarDays, CalendarRange, ChevronRight, Sparkles } from 'lucide-react-native';
import { useNavigation } from '@/app/navigation/NavigationContext';
import { Screen } from '@/shared/components/ui/Screen';
import { Button } from '@/shared/components/ui/Button';
import { ThinkingIndicator } from '../../ai-coach/components/ThinkingIndicator';
import { useTheme } from '@/hooks/use-theme';
import { hasReportRecords, useProgressReport } from '../hooks/use-progress-report';
import { showToast } from '@/shared/stores/toastStore';
import { StatusBanner } from '@/shared/components/ui/StatusBanner';

export function ReportsScreen() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const [generating, setGenerating] = useState(false);
  const weekly = useProgressReport('weekly');
  const monthly = useProgressReport('monthly');
  const activeWeekly = hasReportRecords(weekly.data) ? weekly.data : null;
  const activeMonthly = hasReportRecords(monthly.data) ? monthly.data : null;
  const generate = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const result = await weekly.refetch();
      if (result.isError) throw result.error;
      if (!hasReportRecords(result.data)) {
        showToast({ message: 'Log workouts, meals or weights to build your first report.' });
        return;
      }
      navigate('weeklyReport');
    } catch {
      showToast({ tone: 'error', message: 'Could not load your report. Please try again.' });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Screen
      title="AI reports"
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={weekly.isRefetching || monthly.isRefetching}
          onRefresh={() => {
            void weekly.refetch();
            void monthly.refetch();
          }}
          tintColor={colors.accentStrong}
        />
      }
    >
      {weekly.isError || monthly.isError ? (
        <StatusBanner
          tone="error"
          title="Couldn’t refresh reports"
          body="Pull to try again. Any displayed report was previously loaded."
        />
      ) : null}
      {/* Weekly Report Hero Card */}
      {activeWeekly ? (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => navigate('weeklyReport')}
          style={[styles.heroCard, { backgroundColor: colors.surface2 }]}
        >
          <View style={styles.cardTagRow}>
            <CalendarRange size={13} color={colors.muted} />
            <Text style={[styles.cardTagText, { color: colors.muted }]}>
              Weekly · {activeWeekly.period}
            </Text>
          </View>
          <Text style={[styles.headline, { color: colors.ink }]}>{activeWeekly.headline}</Text>
          <View style={styles.readRow}>
            <Text style={[styles.readText, { color: colors.accentStrong }]}>Read report</Text>
            <ChevronRight size={14} color={colors.accentStrong} />
          </View>
        </TouchableOpacity>
      ) : (
        <View style={[styles.heroCard, { backgroundColor: colors.surface2 }]}>
          <View style={styles.cardTagRow}>
            <CalendarRange size={13} color={colors.muted} />
            <Text style={[styles.cardTagText, { color: colors.muted }]}>Weekly Report</Text>
          </View>
          <Text style={[styles.headline, { color: colors.ink, fontSize: 16 }]}>
            No weekly report available yet
          </Text>
          <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 18 }}>
            Log workouts, meals or weights to build your weekly review.
          </Text>
        </View>
      )}

      {/* Monthly Report Card */}
      {activeMonthly ? (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => navigate('monthlyReport')}
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}
        >
          <View style={styles.cardTagRow}>
            <CalendarDays size={13} color={colors.muted} />
            <Text style={[styles.cardTagText, { color: colors.muted }]}>
              Monthly · {activeMonthly.period}
            </Text>
          </View>
          <Text style={[styles.headline, { color: colors.ink }]}>{activeMonthly.headline}</Text>
          <View style={styles.readRow}>
            <Text style={[styles.readText, { color: colors.ink }]}>Read report</Text>
            <ChevronRight size={14} color={colors.ink} />
          </View>
        </TouchableOpacity>
      ) : (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={styles.cardTagRow}>
            <CalendarDays size={13} color={colors.muted} />
            <Text style={[styles.cardTagText, { color: colors.muted }]}>Monthly Report</Text>
          </View>
          <Text style={[styles.headline, { color: colors.ink, fontSize: 15 }]}>
            No monthly report available yet
          </Text>
          <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 18 }}>
            Monthly comprehensive summaries are generated at the end of each calendar month.
          </Text>
        </View>
      )}

      {/* Generator Box */}
      <View style={[styles.generatorBox, { borderColor: colors.line }]}>
        {generating ? (
          <ThinkingIndicator
            toolCalls={[
              'getWorkoutHistory',
              'getNutritionLogs',
              'getWeightHistory',
              'generateWeeklyReport',
            ]}
          />
        ) : (
          <View style={{ gap: 4 }}>
            <Text style={[styles.genTitle, { color: colors.ink }]}>Your weekly review</Text>
            <Text style={[styles.genSub, { color: colors.muted }]}>
              Want a preview of this week so far?
            </Text>
            <View style={{ marginTop: 8, alignSelf: 'flex-start' }}>
              <Button variant="secondary" size="sm" icon={Sparkles} onPress={generate}>
                Generate preview
              </Button>
            </View>
          </View>
        )}
      </View>

      {/* Past Reports Archive */}
      <View style={styles.archiveBlock}>
        <Text style={[styles.archiveHeading, { color: colors.ink }]}>Past reports</Text>
        <View
          style={[styles.listCard, { backgroundColor: colors.surface, borderColor: colors.line }]}
        >
          <Text style={{ color: colors.muted, textAlign: 'center', padding: 16, fontSize: 13 }}>
            No past reports archived yet.
          </Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 24,
    gap: 16,
  },
  heroCard: {
    borderRadius: 28,
    padding: 20,
    gap: 8,
  },
  card: {
    borderRadius: 28,
    borderWidth: 1,
    padding: 20,
    gap: 8,
  },
  cardTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardTagText: {
    fontSize: 12,
  },
  headline: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
    letterSpacing: -0.4,
  },
  readRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  readText: {
    fontSize: 13,
    fontWeight: '600',
  },
  generatorBox: {
    borderRadius: 24,
    borderWidth: 1,
    borderStyle: 'dashed',
    padding: 18,
  },
  genTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  genSub: {
    fontSize: 13,
  },
  archiveBlock: {
    gap: 8,
    marginTop: 8,
  },
  archiveHeading: {
    fontSize: 17,
    fontWeight: '600',
    paddingHorizontal: 4,
  },
  listCard: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
  },
  archiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  reportType: {
    width: 68,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  reportTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  reportSummary: {
    fontSize: 12.5,
  },
});
