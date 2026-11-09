import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { ArrowUpRight, Dumbbell, Apple, Droplets, Target, Sparkles } from 'lucide-react-native';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { SectionHeader } from '../../../shared/components/ui/SectionHeader';
import { useTheme } from '@/hooks/use-theme';
import { useCoachInsights } from '@/features/ai-coach/hooks/use-coach-insights';

const icons: Record<string, React.ComponentType<{ size: number; color: string }>> = {
  nutrition: Apple,
  workout: Dumbbell,
  strength: Dumbbell,
  hydration: Droplets,
  goal: Target,
  recovery: Sparkles,
};

export function CoachInsights() {
  const { colors } = useTheme();
  const { navigate, switchTab } = useNavigation();
  const { data, isLoading, isError, refetch } = useCoachInsights();

  const insights = data?.insights ?? [];
  const hasData = Boolean(data?.hasSufficientData && insights.length > 0);

  return (
    <View style={styles.container}>
      <SectionHeader
        title="From your coach"
        action="Insights"
        onAction={() => switchTab('progress')}
      />
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.line,
          },
        ]}
      >
        {isLoading && (
          <View style={styles.stateContainer}>
            <ActivityIndicator size="small" color={colors.accentStrong} />
            <Text style={[styles.stateText, { color: colors.muted }]}>
              Generating personalized insights...
            </Text>
          </View>
        )}

        {isError && (
          <View style={styles.stateContainer}>
            <Text style={[styles.stateText, { color: colors.muted }]}>
              Unable to load insights right now.
            </Text>
            <TouchableOpacity onPress={() => refetch()} style={styles.retryBtn}>
              <Text style={[styles.retryText, { color: colors.ink }]}>Tap to retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {!isLoading && !isError && !hasData && (
          <View style={styles.stateContainer}>
            <Text style={[styles.stateTitle, { color: colors.ink }]}>
              {data?.greeting || 'Ready when you are!'}
            </Text>
            <Text style={[styles.stateText, { color: colors.muted }]}>
              Log your workouts, water, or meals to receive personalized AI guidance.
            </Text>
          </View>
        )}

        {!isLoading && !isError && hasData &&
          insights.map((insight, index) => {
            const Icon = icons[insight.category] || Dumbbell;
            const isLast = index === insights.length - 1;

            return (
              <View
                key={insight.id || insight.title}
                style={[
                  styles.itemRow,
                  !isLast && { borderBottomWidth: 1, borderBottomColor: colors.line },
                ]}
              >
                <View
                  style={[
                    styles.iconContainer,
                    { backgroundColor: `${colors.accent}40` },
                  ]}
                >
                  <Icon size={17} color={colors.accentStrong} />
                </View>

                <View style={styles.contentCol}>
                  <Text style={[styles.title, { color: colors.ink }]}>
                    {insight.title}
                  </Text>
                  <Text style={[styles.body, { color: colors.muted }]}>
                    {insight.description}
                  </Text>

                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => navigate('coach', { q: insight.question })}
                    style={styles.actionBtn}
                  >
                    <Text style={[styles.actionText, { color: colors.ink }]}>
                      {insight.action}
                    </Text>
                    <ArrowUpRight size={14} color={colors.ink} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 6,
    marginBottom: 24,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
  },
  itemRow: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentCol: {
    flex: 1,
  },
  title: {
    fontSize: 14.5,
    fontWeight: '600',
    lineHeight: 20,
  },
  body: {
    marginTop: 4,
    fontSize: 13.5,
    lineHeight: 18,
  },
  actionBtn: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  stateContainer: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  stateTitle: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  stateText: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  retryBtn: {
    marginTop: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  retryText: {
    fontSize: 13,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});

