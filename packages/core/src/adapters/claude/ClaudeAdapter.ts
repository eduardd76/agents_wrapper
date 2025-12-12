import Anthropic from '@anthropic-ai/sdk';
import { BaseAdapter } from '../base/BaseAdapter.js';
import type {
  AgentCapabilities,
  AgentConfig,
  AgentResponse,
  ConfigValidation,
  ExecutionOptions,
  StreamChunk,
} from '../../types/agent.types.js';

/**
 * Adapter for Claude (Anthropic) AI models.
 * Reference implementation demonstrating best practices.
 */
export class ClaudeAdapter extends BaseAdapter {
  private client: Anthropic;
  private defaultModel: string;

  // Pricing per million tokens (as of Dec 2025)
  private readonly PRICING = {
    'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
    'claude-3-5-haiku-20241022': { input: 0.8, output: 4.0 },
    'claude-opus-4-5-20251101': { input: 15.0, output: 75.0 },
  };

  constructor(config: AgentConfig) {
    super('claude', config);

    if (!config.apiKey) {
      throw new Error('Anthropic API key is required');
    }

    this.client = new Anthropic({
      apiKey: config.apiKey,
      maxRetries: config.maxRetries || 3,
      timeout: config.timeout || 120000,
    });

    this.defaultModel = config.model || 'claude-3-5-sonnet-20241022';
  }

  /**
   * Execute a task and return the complete response.
   */
  async execute(
    task: string,
    options?: ExecutionOptions
  ): Promise<AgentResponse> {
    try {
      const [response, responseTime] = await this.measureTime(async () => {
        return await this.executeWithRetry(async () => {
          return await this.client.messages.create({
            model: this.defaultModel,
            max_tokens: options?.maxTokens || 4096,
            temperature: options?.temperature,
            system: options?.systemPrompt,
            messages: [{ role: 'user', content: task }],
          });
        });
      });

      const content = response.content
        .filter((block) => block.type === 'text')
        .map((block) => (block as any).text)
        .join('\n');

      return {
        agentName: this.agentName,
        content,
        metadata: {
          model: response.model,
          tokensUsed:
            response.usage.input_tokens + response.usage.output_tokens,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          responseTime,
          cost: this.calculateCost(
            response.usage.input_tokens,
            response.usage.output_tokens
          ),
        },
      };
    } catch (error) {
      return {
        agentName: this.agentName,
        content: '',
        metadata: {
          model: this.defaultModel,
          tokensUsed: 0,
          responseTime: 0,
        },
        error: this.createAgentError(error),
      };
    }
  }

  /**
   * Execute a task with streaming responses.
   */
  async stream(
    task: string,
    onChunk: (chunk: StreamChunk) => void,
    options?: ExecutionOptions
  ): Promise<AgentResponse> {
    const startTime = Date.now();
    let fullContent = '';
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const stream = await this.client.messages.create({
        model: this.defaultModel,
        max_tokens: options?.maxTokens || 4096,
        temperature: options?.temperature,
        system: options?.systemPrompt,
        messages: [{ role: 'user', content: task }],
        stream: true,
      });

      for await (const event of stream) {
        if (event.type === 'message_start') {
          inputTokens = event.message.usage.input_tokens;
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            fullContent += event.delta.text;
            onChunk({
              agentName: this.agentName,
              delta: event.delta.text,
              isComplete: false,
            });
          }
        } else if (event.type === 'message_delta') {
          outputTokens = event.usage.output_tokens;
        }
      }

      const responseTime = Date.now() - startTime;

      // Send completion chunk
      onChunk({
        agentName: this.agentName,
        delta: '',
        isComplete: true,
        metadata: {
          model: this.defaultModel,
          tokensUsed: inputTokens + outputTokens,
          inputTokens,
          outputTokens,
          responseTime,
          cost: this.calculateCost(inputTokens, outputTokens),
        },
      });

      return {
        agentName: this.agentName,
        content: fullContent,
        metadata: {
          model: this.defaultModel,
          tokensUsed: inputTokens + outputTokens,
          inputTokens,
          outputTokens,
          responseTime,
          cost: this.calculateCost(inputTokens, outputTokens),
        },
      };
    } catch (error) {
      onChunk({
        agentName: this.agentName,
        delta: '',
        isComplete: true,
      });

      return {
        agentName: this.agentName,
        content: fullContent,
        metadata: {
          model: this.defaultModel,
          tokensUsed: inputTokens + outputTokens,
          inputTokens,
          outputTokens,
          responseTime: Date.now() - startTime,
        },
        error: this.createAgentError(error),
      };
    }
  }

  /**
   * Get Claude's capabilities.
   */
  getCapabilities(): AgentCapabilities {
    return {
      supportsStreaming: true,
      supportsCodeExecution: false,
      supportsImageInput: true,
      maxContextTokens: 200000,
    };
  }

  /**
   * Validate API key by making a test request.
   */
  async validateConfig(): Promise<ConfigValidation> {
    try {
      // Simple test message to verify API key
      await this.client.messages.create({
        model: this.defaultModel,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'test' }],
      });

      return { isValid: true };
    } catch (error: any) {
      if (error.status === 401 || error.status === 403) {
        return {
          isValid: false,
          error: 'Invalid Anthropic API key',
        };
      }

      return {
        isValid: false,
        error: `Validation failed: ${error.message}`,
      };
    }
  }

  /**
   * Perform health check.
   */
  async healthCheck(): Promise<boolean> {
    const validation = await this.validateConfig();
    return validation.isValid;
  }

  /**
   * Calculate cost based on token usage and model pricing.
   */
  protected calculateCost(inputTokens: number, outputTokens: number): number {
    const pricing =
      this.PRICING[this.defaultModel as keyof typeof this.PRICING] ||
      this.PRICING['claude-3-5-sonnet-20241022'];

    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;

    return inputCost + outputCost;
  }
}
