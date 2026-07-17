import { useState, useCallback, useEffect } from 'react';
import { ChatMessage } from '../types/coach';
import { CoachService } from '../services/coach-service';

export const useChat = (conversationId: string) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    const fetchMessages = async () => {
      setIsLoading(true);
      try {
        const msgs = await CoachService.getMessages(conversationId);
        setMessages(msgs);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchMessages();
  }, [conversationId]);

  const sendMessage = useCallback(async (content: string) => {
    // Optimistically add user message
    const userMsg: ChatMessage = {
      id: Math.random().toString(),
      conversationId,
      role: 'user',
      content,
      timestamp: new Date().toISOString()
    };
    
    setMessages(prev => [...prev, userMsg]);
    setIsStreaming(true);
    
    // Placeholder for AI streaming
    const tempAiMsg: ChatMessage = {
      id: 'temp-' + Math.random().toString(),
      conversationId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, tempAiMsg]);

    try {
      await CoachService.sendMessage(conversationId, content, (chunk) => {
        setMessages(prev => {
          const newMsgs = [...prev];
          const lastIndex = newMsgs.length - 1;
          const lastMsg = newMsgs[lastIndex];
          if (lastMsg) {
            newMsgs[lastIndex] = { ...lastMsg, content: chunk };
          }
          return newMsgs;
        });
      });
    } catch (e) {
      console.error(e);
      // Handle error
    } finally {
      setIsStreaming(false);
    }
  }, [conversationId]);

  return {
    messages,
    isLoading,
    isStreaming,
    sendMessage
  };
};
