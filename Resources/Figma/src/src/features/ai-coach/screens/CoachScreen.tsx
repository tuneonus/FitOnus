import React, { useEffect, useRef } from 'react';
import { BrainIcon, HistoryIcon, SquarePenIcon } from 'lucide-react';
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
  const params = useRouteParams();
  const { messages, busy, send, retry, setActionStatus, newConversation } = useCoachStore();
  const offline = useHealthStore((s) => s.status === 'offline');
  const endRef = useRef<HTMLDivElement>(null);
  const sentParam = useRef(false);

  useEffect(() => {
    if (params.q && !sentParam.current) {
      sentParam.current = true;
      send(params.q);
    }
  }, [params.q, send]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  return (
    <Screen
      title="AI Coach"
      headerLeft={isTabRoot ? <IconButton icon={HistoryIcon} label="Conversation history" onClick={() => navigate('coachHistory')} /> : undefined}
      headerRight={
      <>
          <IconButton icon={BrainIcon} label="AI memory" onClick={() => navigate('aiMemory')} />
          <IconButton icon={SquarePenIcon} label="New conversation" onClick={newConversation} disabled={messages.length === 0} />
        </>
      }
      footer={<Composer onSend={send} onVoice={() => navigate('voiceCoach')} disabled={busy} />}>
      
      {offline &&
      <div className="px-4 pb-2">
          <StatusBanner tone="offline" title="You’re offline" body="The coach needs a connection to answer. Your messages will fail until you reconnect." />
        </div>
      }
      {messages.length === 0 ?
      <CoachWelcome onAsk={send} /> :

      <div className="space-y-6 px-4 pt-2">
          {messages.map((m) =>
        m.role === 'user' ?
        <UserMessage key={m.id} text={m.text ?? ''} /> :

        <AssistantMessage
          key={m.id}
          message={m}
          onFollowUp={send}
          onRetry={() => retry(m.id)}
          onActionStatus={(actionId, status, text) => setActionStatus(m.id, actionId, status, text)} />


        )}
          <div ref={endRef} />
        </div>
      }
    </Screen>);

}