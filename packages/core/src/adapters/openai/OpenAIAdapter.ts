import OpenAI from 'openai';
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
 * Adapter for OpenAI models (GPT-4, GPT-4o, etc.).
 */
export class OpenAIAdapter extends BaseAdapter {
  private client: OpenAI;
  private defaultModel: string;

  // Pricing per million tokens (as of Dec 2025)
  private readonly PRICING = {
    'gpt-4o': { input: 2.5, output: 10.0 },
    'gpt-4o-mini': { input: 0.15, output: 0.6 },
    'gpt-4-turbo': { input: 10.0, output: 30.0 },
    'gpt-4': { input: 30.0, output: 60.0 },
  };

  constructor(config: AgentConfig) {
    super('openai', config);

    if (!config.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    this.client = new OpenAI({
      apiKey: config.apiKey,
      maxRetries: config.maxRetries || 3,
      timeout: config.timeout || 120000,
    });

    this.defaultModel = config.model || 'gpt-4o-mini';
  }

  async execute(
    task: string,
    options?: ExecutionOptions
  ): Promise<AgentResponse> {
    try {
      const [response, responseTime] = await this.measureTime(async () => {
        return await this.executeWithRetry(async () => {
          return await this.client.chat.completions.create({
            model: this.defaultModel,
            max_tokens: options?.maxTokens || 4096,
            temperature: options?.temperature,
            messages: [
              ...(options?.systemPrompt
                ? [{ role: 'system' as const, content: options.systemPrompt }]
                : []),
              { role: 'user' as const, content: task },
            ],
          });
        });
      });

      const content = response.choices[0]?.message?.content || '';
      const usage = response.usage!;

      return {
        agentName: this.agentName,
        content,
        metadata: {
          model: response.model,
          tokensUsed: usage.total_tokens,
          inputTokens: usage.prompt_tokens,
          outputTokens: usage.completion_tokens,
          responseTime,
          cost: this.calculateCost(usage.prompt_tokens, usage.completion_tokens),
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
      const stream = await this.client.chat.completions.create({
        model: this.defaultModel,
        max_tokens: options?.maxTokens || 4096,
        temperature: options?.temperature,
        messages: [
          ...(options?.systemPrompt
            ? [{ role: 'system' as const, content: options.systemPrompt }]
            : []),
          { role: 'user' as const, content: task },
        ],
        stream: true,
        stream_options: { include_usage: true },
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;

        if (delta) {
          fullContent += delta;
          onChunk({
            agentName: this.agentName,
            delta,
            isComplete: false,
          });
        }

        // Usage info comes in the final chunk
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens;
          outputTokens = chunk.usage.completion_tokens;
        }
      }

      const responseTime = Date.now() - startTime;

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

  getCapabilities(): AgentCapabilities {
    return {
      supportsStreaming: true,
      supportsCodeExecution: false,
      supportsImageInput: this.defaultModel.includes('gpt-4'),
      maxContextTokens: 128000,
    };
  }

  async validateConfig(): Promise<ConfigValidation> {
    try {
      await this.client.chat.completions.create({
        model: this.defaultModel,
        max_tokens: 5,
        messages: [{ role: 'user', content: 'test' }],
      });

      return { isValid: true };
    } catch (error: any) {
      if (error.status === 401) {
        return {
          isValid: false,
          error: 'Invalid OpenAI API key',
        };
      }

      return {
        isValid: false,
        error: `Validation failed: ${error.message}`,
      };
    }
  }

  async healthCheck(): Promise<boolean> {
    const validation = await this.validateConfig();
    return validation.isValid;
  }

  protected calculateCost(inputTokens: number, outputTokens: number): number {
    const pricing =
      this.PRICING[this.defaultModel as keyof typeof this.PRICING] ||
      this.PRICING['gpt-4o-mini'];

    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;

    return inputCost + outputCost;
  }
}
