import type {
  AgentCapabilities,
  AgentConfig,
  AgentResponse,
  ConfigValidation,
  ExecutionOptions,
  StreamChunk,
} from '../../types/agent.types.js';

/**
 * Abstract base class that all AI agent adapters must implement.
 * Provides a unified interface for executing tasks across different AI providers.
 */
export abstract class AgentAdapter {
  protected agentName: string;
  protected config: AgentConfig;

  constructor(agentName: string, config: AgentConfig) {
    this.agentName = agentName;
    this.config = config;
  }

  /**
   * Execute a task synchronously and return the complete response.
   * @param task - The task/prompt to send to the agent
   * @param options - Optional execution parameters
   * @returns Promise resolving to the agent's response
   */
  abstract execute(
    task: string,
    options?: ExecutionOptions
  ): Promise<AgentResponse>;

  /**
   * Execute a task with streaming responses.
   * @param task - The task/prompt to send to the agent
   * @param onChunk - Callback function called for each streamed chunk
   * @param options - Optional execution parameters
   * @returns Promise resolving to the complete response after streaming finishes
   */
  abstract stream(
    task: string,
    onChunk: (chunk: StreamChunk) => void,
    options?: ExecutionOptions
  ): Promise<AgentResponse>;

  /**
   * Get the capabilities of this agent.
   * @returns The agent's capabilities
   */
  abstract getCapabilities(): AgentCapabilities;

  /**
   * Validate the agent's configuration (e.g., API key validity).
   * @returns Promise resolving to validation result
   */
  abstract validateConfig(): Promise<ConfigValidation>;

  /**
   * Perform a health check to ensure the agent is reachable.
   * @returns Promise resolving to true if healthy, false otherwise
   */
  abstract healthCheck(): Promise<boolean>;

  /**
   * Get the agent's name.
   */
  public getName(): string {
    return this.agentName;
  }

  /**
   * Calculate cost based on token usage and pricing.
   * Should be overridden by specific adapters with their pricing models.
   */
  protected calculateCost(inputTokens: number, outputTokens: number): number {
    // Default implementation returns 0, should be overridden
    return 0;
  }

  /**
   * Mask API key for logging (shows first/last few characters only).
   */
  protected maskApiKey(apiKey: string): string {
    if (!apiKey || apiKey.length < 10) return '***';
    return `${apiKey.slice(0, 7)}...${apiKey.slice(-4)}`;
  }
}
