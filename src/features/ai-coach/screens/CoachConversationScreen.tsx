import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation, useRouteParams } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { Button } from '../../../shared/components/ui/Button';
import { pastConversations } from '../data/conversationsMock';
import { buildCoachResponse } from '../services/mockCoachEngine';
import { AssistantMessage } from '../components/AssistantMessage';
import { UserMessage } from '../components/UserMessage';
import { useCoachStore } from '../store/coachStore';
import { useTheme } from '@/hooks/use-theme';

export function CoachConversationScreen() {
  const { colors } = useTheme();
  const { id } = useRouteParams<{ id?: string }>();
  const { switchTab } = useNavigation();
  const loadConversation = useCoachStore((s) => s.loadConversation);
  const convo = pastConversations.find((c) => c.id === id) ?? pastConversations[0]!;
  const replies = useMemo(
    () => convo.questions.map((q) => buildCoachResponse(q)),
    [convo]
  );

  const continueChat = () => {
    loadConversation(convo.questions);
    switchTab('coach');
  };

  return (
    <Screen
      title={convo.title}
      footer={
        <Button fullWidth size="lg" title="Continue this conversation" onPress={continueChat} />
      }
    >
      <Text style={[styles.headerNotice, { color: colors.muted }]}>
        {convo.date} · Continue to pick up where you left off. Past actions won’t re-run automatically.
      </Text>

      <View style={styles.convoBody}>
        {convo.questions.map((q, i) => (
          <View key={q} style={styles.turnWrap}>
            <UserMessage text={q} />
            <AssistantMessage
              readOnly
              message={{
                id: `${convo.id}-${i}`,
                role: 'assistant',
                status: 'done',
                ...replies[i],
              }}
            />
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
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

