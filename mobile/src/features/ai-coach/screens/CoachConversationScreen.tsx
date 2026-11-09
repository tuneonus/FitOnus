import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useNavigation, useRouteParams } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { Button } from '../../../shared/components/ui/Button';
import { EmptyState } from '../../../shared/components/ui/EmptyState';
import { AssistantMessage } from '../components/AssistantMessage';
import { UserMessage } from '../components/UserMessage';
import { useCoachStore } from '../store/coachStore';
import { CoachApi } from '../services/coach-api';
import type { ConversationDetail } from '../types/coach';
import { useTheme } from '@/hooks/use-theme';
import { MessagesSquare } from 'lucide-react-native';

export function CoachConversationScreen() {
  const { colors } = useTheme();
  const { id } = useRouteParams<{ id?: string }>();
  const { switchTab } = useNavigation();
  const loadConversation = useCoachStore((s) => s.loadConversation);

  const [convo, setConvo] = useState<ConversationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConversation = useCallback(async () => {
    if (!id) {
      setError('Conversation ID is missing.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const detail = await CoachApi.getConversation(id);
      setConvo(detail);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to load conversation.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchConversation();
  }, [fetchConversation]);

  const continueChat = () => {
    if (!convo) return;
    loadConversation(convo);
    switchTab('coach');
  };

  if (loading) {
    return (
      <Screen title="Conversation">
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={[styles.loadingText, { color: colors.muted }]}>Loading messages…</Text>
        </View>
      </Screen>
    );
  }

  if (error || !convo) {
    return (
      <Screen title="Conversation">
        <EmptyState
          icon={MessagesSquare}
          title="Conversation not found"
          body={error || 'This conversation may have been deleted.'}
        />
      </Screen>
    );
  }

  const formattedDate = new Date(convo.updatedAt || convo.createdAt).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <Screen
      title={convo.title}
      footer={
        <Button
          fullWidth
          size="lg"
          title="Continue this conversation"
          onPress={continueChat}
        />
      }
    >
      <Text style={[styles.headerNotice, { color: colors.muted }]}>
        {formattedDate} · Continue to pick up where you left off. Past actions won’t re-run automatically.
      </Text>

      <View style={styles.convoBody}>
        {convo.messages.map((m) => (
          <View key={m.id} style={styles.turnWrap}>
            {m.role === 'user' ? (
              <UserMessage text={m.text} />
            ) : (
              <AssistantMessage
                readOnly
                message={{
                  id: m.id,
                  role: 'assistant',
                  status: 'done',
                  text: m.text,
                  blocks: m.blocks,
                  sources: m.sources,
                  followUps: m.followUps,
                }}
              />
            )}
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loadingBox: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
  },
  headerNotice: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 16,
  },
  convoBody: {
    paddingHorizontal: 16,
    gap: 20,
    paddingBottom: 32,
  },
  turnWrap: {
    gap: 12,
  },
});
