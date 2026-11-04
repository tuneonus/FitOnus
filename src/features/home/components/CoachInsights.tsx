import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ArrowUpRight, Dumbbell, Apple } from 'lucide-react-native';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { SectionHeader } from '../../../shared/components/ui/SectionHeader';
import { coachInsights } from '../data/homeMock';
import { useTheme } from '@/hooks/use-theme';

const icons = { nutrition: Apple, strength: Dumbbell };

export function CoachInsights() {
  const { colors } = useTheme();
  const { navigate, switchTab } = useNavigation();

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
        {coachInsights.map((insight, index) => {
          const Icon = icons[insight.kind as keyof typeof icons] || Dumbbell;
          const isLast = index === coachInsights.length - 1;

          return (
            <View
              key={insight.title}
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
                <Icon size={17} color={colors.accentInk} />
              </View>

              <View style={styles.contentCol}>
                <Text style={[styles.title, { color: colors.ink }]}>
                  {insight.title}
                </Text>
                <Text style={[styles.body, { color: colors.muted }]}>
                  {insight.body}
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
    paddingHorizontal: 16,
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
});

