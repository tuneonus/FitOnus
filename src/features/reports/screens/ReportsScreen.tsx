import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { CalendarDays, CalendarRange, ChevronRight, Sparkles } from 'lucide-react-native';
import { useNavigation } from '@/app/navigation/NavigationContext';
import { Screen } from '@/shared/components/ui/Screen';
import { Button } from '@/shared/components/ui/Button';
import { ThinkingIndicator } from '../../ai-coach/components/ThinkingIndicator';
import { reportArchive, weeklyReport, monthlyReport } from '../data/reportsMock';
import { useTheme } from '@/hooks/use-theme';

export function ReportsScreen() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const [generating, setGenerating] = useState(false);

  const generate = () => {
    setGenerating(true);
    setTimeout(() => {
      setGenerating(false);
      navigate('weeklyReport', { period: 'Oct 4 – 9 (so far)' });
    }, 2400);
  };

  return (
    <Screen title="AI reports">
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Weekly Report Hero Card */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => navigate('weeklyReport')}
          style={[styles.heroCard, { backgroundColor: colors.surface2 }]}
        >
          <View style={styles.cardTagRow}>
            <CalendarRange size={13} color={colors.muted} />
            <Text style={[styles.cardTagText, { color: colors.muted }]}>
              Weekly · {weeklyReport.period}
            </Text>
          </View>
          <Text style={[styles.headline, { color: colors.ink }]}>{weeklyReport.headline}</Text>
          <View style={styles.readRow}>
            <Text style={[styles.readText, { color: colors.accent }]}>Read report</Text>
            <ChevronRight size={14} color={colors.accent} />
          </View>
        </TouchableOpacity>

        {/* Monthly Report Card */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => navigate('monthlyReport')}
          style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}
        >
          <View style={styles.cardTagRow}>
            <CalendarDays size={13} color={colors.muted} />
            <Text style={[styles.cardTagText, { color: colors.muted }]}>
              Monthly · {monthlyReport.month}
            </Text>
          </View>
          <Text style={[styles.headline, { color: colors.ink }]}>{monthlyReport.headline}</Text>
          <View style={styles.readRow}>
            <Text style={[styles.readText, { color: colors.ink }]}>Read report</Text>
            <ChevronRight size={14} color={colors.ink} />
          </View>
        </TouchableOpacity>

        {/* Generator Box */}
        <View style={[styles.generatorBox, { borderColor: colors.line }]}>
          {generating ? (
            <ThinkingIndicator
              toolCalls={[
                'getWorkoutHistory',
                'getNutritionLogs',
                'getSleepHistory',
                'getWeightHistory',
                'generateWeeklyReport',
              ]}
            />
          ) : (
            <View style={{ gap: 4 }}>
              <Text style={[styles.genTitle, { color: colors.ink }]}>
                Next weekly report: Sunday, Oct 11
              </Text>
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
          <View style={[styles.listCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            {reportArchive.map((r, idx) => (
              <TouchableOpacity
                key={r.id}
                activeOpacity={0.7}
                onPress={() =>
                  navigate(r.type === 'weekly' ? 'weeklyReport' : 'monthlyReport', { id: r.id })
                }
                style={[
                  styles.archiveRow,
                  { borderBottomColor: colors.line },
                  idx === reportArchive.length - 1 && { borderBottomWidth: 0 },
                ]}
              >
                <Text style={[styles.reportType, { color: colors.muted }]}>{r.type}</Text>
                <View style={{ flex: 1, marginRight: 8, gap: 2 }}>
                  <Text style={[styles.reportTitle, { color: colors.ink }]} numberOfLines={1}>
                    {r.title}
                  </Text>
                  <Text style={[styles.reportSummary, { color: colors.muted }]} numberOfLines={1}>
                    {r.summary}
                  </Text>
                </View>
                <ChevronRight size={16} color={colors.muted} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 32,
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

