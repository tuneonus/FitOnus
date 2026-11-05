import React, { useMemo } from 'react';
import { useNavigation, useRouteParams } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { Button } from '../../../shared/components/ui/Button';
import { pastConversations } from '../data/conversationsMock';
import { buildCoachResponse } from '../services/mockCoachEngine';
import { AssistantMessage } from '../components/AssistantMessage';
import { UserMessage } from '../components/UserMessage';
import { useCoachStore } from '../store/coachStore';

export function CoachConversationScreen() {
  const { id } = useRouteParams();
  const { switchTab } = useNavigation();
  const loadConversation = useCoachStore((s) => s.loadConversation);
  const convo = pastConversations.find((c) => c.id === id) ?? pastConversations[0];
  const replies = useMemo(() => convo.questions.map((q) => buildCoachResponse(q)), [convo]);

  const continueChat = () => {
    loadConversation(convo.questions);
    switchTab('coach');
  };

  return (
    <Screen title={convo.title} footer={<Button fullWidth size="lg" onClick={continueChat}>Continue this conversation</Button>}>
      <p className="px-5 pb-4 text-center text-[12px] text-muted">{convo.date} · Continue to pick up where you left off. Past actions won’t re-run automatically.</p>
      <div className="space-y-6 px-4">
        {convo.questions.map((q, i) =>
        <React.Fragment key={q}>
            <UserMessage text={q} />
            <AssistantMessage readOnly message={{ id: `${convo.id}-${i}`, role: 'assistant', status: 'done', ...replies[i] }} />
          </React.Fragment>
        )}
      </div>
    </Screen>);

}