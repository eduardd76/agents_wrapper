import { GoogleGenerativeAI } from '@google/generative-ai';
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
 * Adapter for Google Gemini models.
 */
export class GeminiAdapter extends BaseAdapter {
  private client: GoogleGenerativeAI;
  private defaultModel: string;

  // Pricing per million tokens (as of Dec 2025)
  private readonly PRICING = {
    'gemini-2.0-flash-exp': { input: 0.0, output: 0.0 }, // Free during preview
    'gemini-1.5-pro': { input: 1.25, output: 5.0 },
    'gemini-1.5-flash': { input: 0.075, output: 0.3 },
  };

  constructor(config: AgentConfig) {
    super('gemini', config);

    if (!config.apiKey) {
      throw new Error('Google API key is required');
    }

    this.client = new GoogleGenerativeAI(config.apiKey);
    this.defaultModel = config.model || 'gemini-2.0-flash-exp';
  }

  async execute(
    task: string,
    options?: ExecutionOptions
  ): Promise<AgentResponse> {
    try {
      const model = this.client.getGenerativeModel({ model: this.defaultModel });

      const [response, responseTime] = await this.measureTime(async () => {
        return await this.executeWithRetry(async () => {
          return await model.generateContent(task);
        });
      });

      const result = response.response;
      const content = result.text();
      const usage = result.usageMetadata;

      return {
        agentName: this.agentName,
        content,
        metadata: {
          model: this.defaultModel,
          tokensUsed: usage?.totalTokenCount || 0,
          inputTokens: usage?.promptTokenCount || 0,
          outputTokens: usage?.candidatesTokenCount || 0,
          responseTime,
          cost: this.calculateCost(
            usage?.promptTokenCount || 0,
            usage?.candidatesTokenCount || 0
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
      const model = this.client.getGenerativeModel({ model: this.defaultModel });
      const result = await model.generateContentStream(task);

      for await (const chunk of result.stream) {
        const delta = chunk.text();

        if (delta) {
          fullContent += delta;
          onChunk({
            agentName: this.agentName,
            delta,
            isComplete: false,
          });
        }
      }

      // Get final response with usage metadata
      const finalResponse = await result.response;
      const usage = finalResponse.usageMetadata;

      inputTokens = usage?.promptTokenCount || 0;
      outputTokens = usage?.candidatesTokenCount || 0;

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
      supportsImageInput: true,
      maxContextTokens: 1000000, // Gemini 1.5 has 1M context window
    };
  }

  async validateConfig(): Promise<ConfigValidation> {
    try {
      const model = this.client.getGenerativeModel({ model: this.defaultModel });
      await model.generateContent('test');

      return { isValid: true };
    } catch (error: any) {
      if (error.message?.includes('API key')) {
        return {
          isValid: false,
          error: 'Invalid Google API key',
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
      this.PRICING['gemini-2.0-flash-exp'];

    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;

    return inputCost + outputCost;
  }
}
