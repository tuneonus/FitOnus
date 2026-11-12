import React from 'react';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ArrowUpRight, ShieldCheck } from 'lucide-react-native';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { useHealthStore } from '../../health-integration/store/healthStore';
import { useMemoryStore } from '../../ai-memory/store/memoryStore';
import { welcomePrompts } from '../data/conversationsMock';
import { useTheme } from '@/hooks/use-theme';
import { WEARABLES_ENABLED } from '@/shared/constants/featureFlags';

export function CoachWelcome({ onAsk }: { onAsk: (q: string) => void }) {
  const { colors } = useTheme();
  const firstName = useAuthStore((s) => s.user?.name?.trim().split(/\s+/)[0]) || 'there';
  const { navigate } = useNavigation();
  const status = useHealthStore((s) => s.status);
  const memoryCount = useMemoryStore((s) => (s.enabled ? s.items.length : 0));
  const hasDevice =
    WEARABLES_ENABLED && (status === 'synced' || status === 'offline' || status === 'error');
  const access = hasDevice
    ? ['Sleep', 'HRV', 'Heart rate', 'Workouts', 'Meals', 'Weight']
    : ['Workouts', 'Meals', 'Weight'];

  return (
    <View style={styles.container}>
      <Text style={[styles.heading, { color: colors.ink }]}>
        Hi {firstName}.{'\n'}
        <Text style={[styles.subheading, { color: colors.muted }]}>What’s on your mind?</Text>
      </Text>

      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() =>
          navigate(hasDevice ? 'aiMemory' : WEARABLES_ENABLED ? 'healthIntegration' : 'aiMemory')
        }
        style={[styles.accessCard, { backgroundColor: colors.surface2 }]}
      >
        <View style={styles.accessBadge}>
          <ShieldCheck size={13} color={colors.muted} />
          <Text style={[styles.accessBadgeText, { color: colors.muted }]}>Your coach can see</Text>
        </View>

        <View style={styles.accessTagsRow}>
          {access.map((a) => (
            <View key={a} style={[styles.tag, { backgroundColor: colors.surface }]}>
              <Text style={[styles.tagText, { color: colors.ink }]}>{a}</Text>
            </View>
          ))}
          <View style={[styles.tag, { backgroundColor: colors.surface }]}>
            <Text style={[styles.tagText, { color: colors.ink }]}>{memoryCount} memories</Text>
          </View>
        </View>

        {!hasDevice && WEARABLES_ENABLED && (
          <Text style={[styles.deviceHint, { color: colors.muted }]}>
            Connect a device to unlock recovery and sleep answers →
          </Text>
        )}
      </TouchableOpacity>

      <View style={styles.promptsSection}>
        {welcomePrompts.map((group) => (
          <View key={group.topic} style={styles.promptGroup}>
            <Text style={[styles.topicTitle, { color: colors.muted }]}>{group.topic}</Text>
            <View style={styles.questionsList}>
              {group.questions.map((q, idx) => (
                <TouchableOpacity
                  key={q}
                  activeOpacity={0.7}
                  onPress={() => onAsk(q)}
                  style={[
                    styles.questionRow,
                    idx > 0 && {
                      borderTopWidth: 1,
                      borderTopColor: colors.line,
                    },
                  ]}
                >
                  <Text style={[styles.questionText, { color: colors.ink }]}>{q}</Text>
                  <ArrowUpRight size={16} color={colors.muted} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 8,
    paddingBottom: 32,
  },
  heading: {
    fontSize: 30,
    fontWeight: '600',
    lineHeight: 36,
    letterSpacing: -0.5,
  },
  subheading: {
    fontWeight: '400',
  },
  accessCard: {
    marginTop: 20,
    borderRadius: 20,
    padding: 16,
  },
  accessBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  accessBadgeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  accessTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  tag: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '500',
  },
  deviceHint: {
    marginTop: 10,
    fontSize: 12.5,
  },
  promptsSection: {
    marginTop: 24,
    gap: 20,
  },
  promptGroup: {},
  topicTitle: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 6,
  },
  questionsList: {},
  questionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    gap: 12,
  },
  questionText: {
    fontSize: 15,
    flex: 1,
  },
});
