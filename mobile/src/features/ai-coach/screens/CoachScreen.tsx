import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Brain, History, SquarePen } from 'lucide-react-native';
import { useNavigation, useRouteParams } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { IconButton } from '../../../shared/components/ui/IconButton';
import { StatusBanner } from '../../../shared/components/ui/StatusBanner';
import { useHealthStore } from '../../health-integration/store/healthStore';
import { useCoachStore } from '../store/coachStore';
import { CoachWelcome } from '../components/CoachWelcome';
import { AssistantMessage } from '../components/AssistantMessage';
import { UserMessage } from '../components/UserMessage';
import { Composer } from '../components/Composer';

export function CoachScreen() {
  const { navigate, isTabRoot } = useNavigation();
  const params = useRouteParams<{ q?: string }>();
  const { messages, busy, send, retry, setActionStatus, newConversation } = useCoachStore();
  const offline = useHealthStore((s) => s.status === 'offline');
  const sentParam = useRef(false);

  useEffect(() => {
    if (params.q && !sentParam.current) {
      sentParam.current = true;
      send(params.q);
    }
  }, [params.q, send]);

  return (
    <Screen
      title="AI Coach"
      showBack={!isTabRoot}
      headerLeft={
        isTabRoot ? (
          <IconButton
            icon={History}
            label="Conversation history"
            onPress={() => navigate('coachHistory')}
          />
        ) : undefined
      }
      headerRight={
        <View style={styles.headerRight}>
          <IconButton
            icon={Brain}
            label="AI memory"
            onPress={() => navigate('aiMemory')}
          />
          <IconButton
            icon={SquarePen}
            label="New conversation"
            onPress={newConversation}
            disabled={messages.length === 0}
          />
        </View>
      }
      footer={
        <Composer
          onSend={send}
          onVoice={() => navigate('voiceCoach')}
          disabled={busy}
        />
      }
    >
      {offline && (
        <View style={styles.offlineBanner}>
          <StatusBanner
            tone="offline"
            title="You’re offline"
            body="The coach needs a connection to answer. Your messages will fail until you reconnect."
          />
        </View>
      )}

      {messages.length === 0 ? (
        <CoachWelcome onAsk={send} />
      ) : (
        <View style={styles.messagesList}>
          {messages.map((m) =>
            m.role === 'user' ? (
              <UserMessage key={m.id} text={m.text ?? ''} />
            ) : (
              <AssistantMessage
                key={m.id}
                message={m}
                onFollowUp={send}
                onRetry={() => retry(m.id)}
                onActionStatus={(actionId, status, text) =>
                  setActionStatus(m.id, actionId, status, text)
                }
              />
            )
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  offlineBanner: {
    paddingBottom: 8,
  },
  messagesList: {
    paddingTop: 8,
    paddingBottom: 24,
    gap: 16,
  },
});
