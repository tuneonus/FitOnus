import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Brain, Database, RefreshCw, Sparkles, AlertTriangle } from 'lucide-react-native';
import type { ActionStatus, Block, CoachMessage } from '../types/coach';
import { ThinkingIndicator } from './ThinkingIndicator';
import { MetricsBlock } from './blocks/MetricsBlock';
import { WorkoutBlock } from './blocks/WorkoutBlock';
import { NutritionBlock } from './blocks/NutritionBlock';
import { ChartBlock } from './blocks/ChartBlock';
import { ComparisonBlock } from './blocks/ComparisonBlock';
import { LinkBlock } from './blocks/LinkBlock';
import { ActionBlock } from './blocks/ActionBlock';
import { useTheme } from '@/hooks/use-theme';

type AssistantMessageProps = {
  message: CoachMessage;
  onFollowUp?: (q: string) => void;
  onRetry?: () => void;
  onActionStatus?: (actionId: string, status: ActionStatus, resultText?: string) => void;
  readOnly?: boolean;
};

export function AssistantMessage({
  message,
  onFollowUp,
  onRetry,
  onActionStatus,
  readOnly,
}: AssistantMessageProps) {
  const { colors } = useTheme();

  const renderBlock = (block: Block, i: number) => {
    switch (block.type) {
      case 'metrics':
        return <MetricsBlock key={i} block={block} />;
      case 'workout':
        return <WorkoutBlock key={i} block={block} />;
      case 'nutrition':
        return <NutritionBlock key={i} block={block} />;
      case 'chart':
        return <ChartBlock key={i} block={block} />;
      case 'comparison':
        return <ComparisonBlock key={i} block={block} />;
      case 'link':
        return <LinkBlock key={i} block={block} />;
      case 'action':
        return readOnly ? null : (
          <ActionBlock
            key={block.id}
            block={block}
            onStatusChange={(s, t) => onActionStatus?.(block.id, s, t)}
          />
        );
      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.avatar,
          { backgroundColor: colors.accent },
        ]}
      >
        <Sparkles size={15} color={colors.accentInk} />
      </View>

      <View style={styles.body}>
        {message.status === 'thinking' && (
          <ThinkingIndicator toolCalls={message.toolCalls} />
        )}

        {message.status === 'error' && (
          <View
            style={[
              styles.errorBox,
              { backgroundColor: `${colors.bad}20` },
            ]}
          >
            <View style={styles.errorHead}>
              <AlertTriangle size={16} color={colors.bad} />
              <Text style={[styles.errorTitle, { color: colors.ink }]}>
                Response failed
              </Text>
            </View>
            <Text style={[styles.errorMsg, { color: colors.muted }]}>
              {message.text}
            </Text>
            {onRetry && (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={onRetry}
                style={[
                  styles.retryBtn,
                  { backgroundColor: colors.surface },
                ]}
              >
                <RefreshCw size={14} color={colors.ink} />
                <Text style={[styles.retryText, { color: colors.ink }]}>
                  Try again
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {message.status === 'done' && (
          <View style={styles.doneContent}>
            {message.text ? (
              <Text style={[styles.messageText, { color: colors.ink }]}>
                {message.text}
              </Text>
            ) : null}

            {message.memoryUsed ? (
              <View
                style={[
                  styles.memoryNote,
                  { backgroundColor: colors.surface2 },
                ]}
              >
                <Brain size={14} color={colors.ink} style={{ marginTop: 2 }} />
                <Text style={[styles.memoryText, { color: colors.muted }]}>
                  <Text style={{ fontWeight: '600', color: colors.ink }}>
                    From memory:{' '}
                  </Text>
                  {message.memoryUsed}
                </Text>
              </View>
            ) : null}

            {message.blocks?.map(renderBlock)}

            {message.sources && message.sources.length > 0 && (
              <View style={styles.sourcesRow}>
                <View style={styles.sourceHead}>
                  <Database size={12} color={colors.muted} />
                  <Text style={[styles.sourceHeadText, { color: colors.muted }]}>
                    Based on
                  </Text>
                </View>
                {message.sources.map((s) => (
                  <View
                    key={s}
                    style={[
                      styles.sourcePill,
                      { backgroundColor: colors.surface2 },
                    ]}
                  >
                    <Text style={[styles.sourcePillText, { color: colors.ink }]}>
                      {s}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {message.medicalNote && (
              <Text style={[styles.medicalNote, { color: colors.muted }]}>
                Coaching insight from your data, not a medical diagnosis. Talk to a
                doctor about symptoms or persistent changes.
              </Text>
            )}

            {!readOnly && message.followUps && onFollowUp && (
              <View style={styles.followUpsRow}>
                {message.followUps.map((q) => (
                  <TouchableOpacity
                    key={q}
                    activeOpacity={0.7}
                    onPress={() => onFollowUp(q)}
                    style={[
                      styles.followUpChip,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.line,
                      },
                    ]}
                  >
                    <Text style={[styles.followUpText, { color: colors.ink }]}>
                      {q}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 12,
    marginVertical: 6,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  body: {
    flex: 1,
    gap: 10,
  },
  errorBox: {
    borderRadius: 16,
    padding: 14,
    gap: 6,
  },
  errorHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  errorMsg: {
    fontSize: 13,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 4,
  },
  retryText: {
    fontSize: 13,
    fontWeight: '600',
  },
  doneContent: {
    gap: 10,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  memoryNote: {
    flexDirection: 'row',
    gap: 8,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  memoryText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
  },
  sourcesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  sourceHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sourceHeadText: {
    fontSize: 11.5,
  },
  sourcePill: {
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  sourcePillText: {
    fontSize: 11.5,
  },
  medicalNote: {
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 2,
  },
  followUpsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 4,
  },
  followUpChip: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  followUpText: {
    fontSize: 13,
  },
});

