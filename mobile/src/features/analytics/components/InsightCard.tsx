import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { CheckCircle2, Eye, Info, ArrowUpRight } from 'lucide-react-native';
import { Badge } from '@/shared/components/ui/Badge';
import { Sparkline } from '@/shared/components/charts/Sparkline';
import { useTheme } from '@/hooks/use-theme';
import type { AiInsight } from '../data/insightsMock';
import type { CoachInsightItem } from '@/features/ai-coach/types/coach';

export type InsightCardItem = AiInsight | CoachInsightItem;

export function InsightCard({
  insight,
  onAsk,
}: {
  insight: InsightCardItem;
  onAsk: () => void;
}) {
  const { colors } = useTheme();

  const iconInfo = {
    positive: { Icon: CheckCircle2, color: colors.good },
    watch: { Icon: Eye, color: colors.warn },
    info: { Icon: Info, color: '#38BDF8' },
  }[insight.severity] || { Icon: Info, color: '#38BDF8' };

  const Icon = iconInfo.Icon;
  const explanation = ('explanation' in insight ? insight.explanation : insight.description) || '';
  const evidence = insight.evidence || [];
  const series = 'series' in insight ? insight.series : undefined;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      <View style={styles.topRow}>
        <View style={{ marginTop: 2 }}>
          <Icon size={18} color={iconInfo.color} />
        </View>

        <View style={styles.contentCol}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: colors.ink }]}>{insight.title}</Text>
            {series && (
              <Sparkline
                values={series.map((p) => p.value)}
                width={56}
                height={22}
                color={colors.ink}
              />
            )}
          </View>

          <Text style={[styles.explanation, { color: colors.muted }]}>
            {explanation}
          </Text>

          {/* Evidence tags */}
          {evidence.length > 0 && (
            <View style={styles.evidenceRow}>
              {evidence.map((e) => (
                <View key={e} style={[styles.evidencePill, { backgroundColor: colors.surface2 }]}>
                  <Text style={[styles.evidenceText, { color: colors.ink }]}>{e}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Footer with confidence badge and action button */}
          <View style={styles.cardFooter}>
            <Badge
              tone={
                insight.confidence === 'high'
                  ? 'good'
                  : insight.confidence === 'low'
                  ? 'warn'
                  : 'neutral'
              }
            >
              {`${insight.confidence} confidence`}
            </Badge>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={onAsk}
              style={styles.actionBtn}
            >
              <Text style={[styles.actionText, { color: colors.ink }]}>{insight.action}</Text>
              <ArrowUpRight size={14} color={colors.ink} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  contentCol: {
    flex: 1,
    gap: 6,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    lineHeight: 20,
  },
  explanation: {
    fontSize: 13.5,
    lineHeight: 19,
  },
  evidenceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  evidencePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  evidenceText: {
    fontSize: 11.5,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600',
  },
});

