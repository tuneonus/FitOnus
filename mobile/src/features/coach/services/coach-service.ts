import { ChatMessage, Conversation } from '../types/coach';

const mockConversations: Conversation[] = [
  {
    id: 'c1',
    title: 'Workout Advice',
    lastMessageAt: new Date().toISOString(),
    messageCount: 4,
  }
];

let mockMessages: ChatMessage[] = [
  {
    id: 'm1',
    conversationId: 'c1',
    role: 'user',
    content: 'I want to build muscle. What should I do?',
    timestamp: new Date(Date.now() - 60000).toISOString(),
  },
  {
    id: 'm2',
    conversationId: 'c1',
    role: 'assistant',
    content: 'To build muscle (hypertrophy), you should focus on resistance training 3-5 times a week, ensuring progressive overload. Make sure to eat enough protein!',
    timestamp: new Date(Date.now() - 50000).toISOString(),
  }
];

export const CoachService = {
  getConversations: async (): Promise<Conversation[]> => {
    return new Promise(resolve => setTimeout(() => resolve(mockConversations), 500));
  },
  getMessages: async (conversationId: string): Promise<ChatMessage[]> => {
    return new Promise(resolve => setTimeout(() => resolve(mockMessages.filter(m => m.conversationId === conversationId)), 500));
  },
  sendMessage: async (conversationId: string, content: string, onChunk: (text: string) => void): Promise<ChatMessage> => {
    // 1. Add user message
    const userMsg: ChatMessage = {
      id: Math.random().toString(),
      conversationId,
      role: 'user',
      content,
      timestamp: new Date().toISOString()
    };
    mockMessages.push(userMsg);
    
    // 2. Simulate streaming AI response
    const aiResponseText = `This is a simulated AI response to: "${content}". I am here to help you achieve your fitness goals!`;
    const words = aiResponseText.split(' ');
    
    let currentText = '';
    
    // We simulate SSE chunks
    for (let i = 0; i < words.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 100)); // 100ms per word
      currentText += (i === 0 ? '' : ' ') + words[i];
      onChunk(currentText);
    }
    
    const finalMsg: ChatMessage = {
      id: Math.random().toString(),
      conversationId,
      role: 'assistant',
      content: aiResponseText,
      timestamp: new Date().toISOString()
    };
    mockMessages.push(finalMsg);
    
    return finalMsg;
  }
};
