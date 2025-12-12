import {
  AgentOrchestrator,
  ClaudeAdapter,
  OpenAIAdapter,
  GeminiAdapter,
  LocalOperatorAdapter,
  SessionManager,
  FileSessionStorage,
  ConfigManager,
} from '@multi-agent/core';
import { homedir } from 'os';
import { join } from 'path';

let cachedOrchestrator: AgentOrchestrator | null = null;

export async function initOrchestrator(): Promise<AgentOrchestrator> {
  if (cachedOrchestrator) {
    return cachedOrchestrator;
  }

  // Load configuration
  const configManager = new ConfigManager();
  const config = await configManager.loadConfig();

  // Initialize session manager
  const sessionPath = config.session?.storagePath || join(homedir(), '.multi-agent', 'sessions');
  const sessionStorage = new FileSessionStorage(sessionPath);
  const sessionManager = new SessionManager(sessionStorage);

  // Create orchestrator
  const orchestrator = new AgentOrchestrator(sessionManager);

  // Register adapters (only if API keys are configured)
  try {
    if (config.anthropic?.apiKey) {
      const claudeAdapter = new ClaudeAdapter(config.anthropic);
      orchestrator.registerAdapter(claudeAdapter);
    }
  } catch (error) {
    console.warn('Failed to initialize Claude adapter:', error);
  }

  try {
    if (config.openai?.apiKey) {
      const openaiAdapter = new OpenAIAdapter(config.openai);
      orchestrator.registerAdapter(openaiAdapter);
    }
  } catch (error) {
    console.warn('Failed to initialize OpenAI adapter:', error);
  }

  try {
    if (config.gemini?.apiKey) {
      const geminiAdapter = new GeminiAdapter(config.gemini);
      orchestrator.registerAdapter(geminiAdapter);
    }
  } catch (error) {
    console.warn('Failed to initialize Gemini adapter:', error);
  }

  try {
    const localOpAdapter = new LocalOperatorAdapter({
      apiKey: '', // Not needed for local-operator
      mode: config.localOperator?.mode || 'api',
      apiUrl: config.localOperator?.apiUrl,
      model: config.localOperator?.model,
    });
    orchestrator.registerAdapter(localOpAdapter);
  } catch (error) {
    console.warn('Failed to initialize LocalOperator adapter:', error);
  }

  cachedOrchestrator = orchestrator;
  return orchestrator;
}
