export interface AgentCapabilities {
  supportsStreaming: boolean;
  supportsCodeExecution: boolean;
  supportsImageInput: boolean;
  maxContextTokens: number;
}

export interface AgentConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
}

export interface ConfigValidation {
  isValid: boolean;
  error?: string;
  warnings?: string[];
}

export interface AgentMetadata {
  model: string;
  tokensUsed: number;
  inputTokens?: number;
  outputTokens?: number;
  responseTime: number;
  cost?: number;
}

export interface AgentError {
  code: 'RATE_LIMIT' | 'INVALID_API_KEY' | 'TIMEOUT' | 'NETWORK' | 'UNKNOWN' | 'MODEL_ERROR';
  message: string;
  retryable: boolean;
  originalError?: unknown;
}

export interface AgentResponse {
  agentName: string;
  content: string;
  metadata: AgentMetadata;
  error?: AgentError;
}

export interface StreamChunk {
  agentName: string;
  delta: string;
  isComplete: boolean;
  metadata?: Partial<AgentMetadata>;
}

export interface ExecutionOptions {
  sessionId?: string;
  temperature?: number;
  maxTokens?: number;
  streaming?: boolean;
  timeout?: number;
  systemPrompt?: string;
}

export type AgentName = 'claude' | 'openai' | 'gemini' | 'local-operator';
