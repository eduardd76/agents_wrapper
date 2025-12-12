export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface SessionMetadata {
  createdAt: Date;
  lastActivity: Date;
  totalTokens: number;
  totalCost: number;
  messageCount: number;
}

export interface SessionContext {
  sessionId: string;
  agentName: string;
  messages: ConversationMessage[];
  metadata: SessionMetadata;
}

export interface SessionStorageAdapter {
  save(sessionId: string, agentName: string, context: SessionContext): Promise<void>;
  load(sessionId: string, agentName: string): Promise<SessionContext | null>;
  delete(sessionId: string, agentName?: string): Promise<void>;
  list(sessionId?: string): Promise<string[]>;
}
