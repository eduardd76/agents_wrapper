import { spawn } from 'child_process';
import axios from 'axios';
import { BaseAdapter } from '../base/BaseAdapter.js';
import type {
  AgentCapabilities,
  AgentConfig,
  AgentResponse,
  ConfigValidation,
  ExecutionOptions,
  StreamChunk,
} from '../../types/agent.types.js';

export interface LocalOperatorConfig extends AgentConfig {
  mode: 'api' | 'cli';
  apiUrl?: string;
  hosting?: string;
  model?: string;
}

/**
 * Adapter for local-operator (Python-based AI coding agent).
 * Supports both CLI execution and HTTP API modes.
 */
export class LocalOperatorAdapter extends BaseAdapter {
  private mode: 'api' | 'cli';
  private apiUrl: string;
  private hosting: string;
  private model: string;

  constructor(config: LocalOperatorConfig) {
    super('local-operator', config);

    this.mode = config.mode || 'api';
    this.apiUrl = config.apiUrl || 'http://localhost:8080';

    // Parse hosting:model format (e.g., "openai:gpt-4o-mini")
    const [hosting, model] = (config.model || 'openai:gpt-4o-mini').split(':');
    this.hosting = hosting || 'openai';
    this.model = model || 'gpt-4o-mini';
  }

  async execute(
    task: string,
    options?: ExecutionOptions
  ): Promise<AgentResponse> {
    if (this.mode === 'api') {
      return await this.executeViaApi(task, options);
    } else {
      return await this.executeViaCli(task, options);
    }
  }

  /**
   * Execute via HTTP API (preferred for web deployments).
   */
  private async executeViaApi(
    task: string,
    options?: ExecutionOptions
  ): Promise<AgentResponse> {
    const startTime = Date.now();

    try {
      // Ensure server is running
      await this.ensureServerRunning();

      const response = await axios.post(
        `${this.apiUrl}/api/execute`,
        {
          task,
          sessionId: options?.sessionId,
          hosting: this.hosting,
          model: this.model,
        },
        {
          timeout: options?.timeout || 300000, // 5 min default
        }
      );

      const responseTime = Date.now() - startTime;

      return {
        agentName: this.agentName,
        content: response.data.result || response.data.output || '',
        metadata: {
          model: `${this.hosting}:${this.model}`,
          tokensUsed: 0, // local-operator doesn't report token usage
          responseTime,
          cost: 0,
        },
      };
    } catch (error: any) {
      return {
        agentName: this.agentName,
        content: '',
        metadata: {
          model: `${this.hosting}:${this.model}`,
          tokensUsed: 0,
          responseTime: Date.now() - startTime,
        },
        error: this.createAgentError(error),
      };
    }
  }

  /**
   * Execute via CLI (simpler for single requests).
   */
  private async executeViaCli(
    task: string,
    options?: ExecutionOptions
  ): Promise<AgentResponse> {
    const startTime = Date.now();

    return new Promise((resolve) => {
      let output = '';
      let errorOutput = '';

      const args = [
        'exec',
        task,
        '--hosting',
        this.hosting,
        '--model',
        this.model,
      ];

      const process = spawn('local-operator', args, {
        timeout: options?.timeout || 300000,
      });

      process.stdout.on('data', (data) => {
        output += data.toString();
      });

      process.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      process.on('close', (code) => {
        const responseTime = Date.now() - startTime;

        if (code === 0) {
          resolve({
            agentName: this.agentName,
            content: output,
            metadata: {
              model: `${this.hosting}:${this.model}`,
              tokensUsed: 0,
              responseTime,
              cost: 0,
            },
          });
        } else {
          resolve({
            agentName: this.agentName,
            content: output,
            metadata: {
              model: `${this.hosting}:${this.model}`,
              tokensUsed: 0,
              responseTime,
            },
            error: {
              code: 'MODEL_ERROR',
              message: `local-operator exited with code ${code}: ${errorOutput}`,
              retryable: false,
            },
          });
        }
      });

      process.on('error', (error) => {
        resolve({
          agentName: this.agentName,
          content: '',
          metadata: {
            model: `${this.hosting}:${this.model}`,
            tokensUsed: 0,
            responseTime: Date.now() - startTime,
          },
          error: this.createAgentError(error),
        });
      });
    });
  }

  /**
   * Streaming not natively supported by local-operator.
   * Falls back to non-streaming execution.
   */
  async stream(
    task: string,
    onChunk: (chunk: StreamChunk) => void,
    options?: ExecutionOptions
  ): Promise<AgentResponse> {
    const response = await this.execute(task, options);

    // Simulate streaming by sending the complete response at once
    onChunk({
      agentName: this.agentName,
      delta: response.content,
      isComplete: false,
    });

    onChunk({
      agentName: this.agentName,
      delta: '',
      isComplete: true,
      metadata: response.metadata,
    });

    return response;
  }

  getCapabilities(): AgentCapabilities {
    return {
      supportsStreaming: false, // Not natively supported
      supportsCodeExecution: true, // Main feature!
      supportsImageInput: false,
      maxContextTokens: 128000, // Depends on underlying model
    };
  }

  async validateConfig(): Promise<ConfigValidation> {
    if (this.mode === 'api') {
      try {
        await axios.get(`${this.apiUrl}/health`, { timeout: 5000 });
        return { isValid: true };
      } catch (error) {
        return {
          isValid: false,
          error: `local-operator API server not reachable at ${this.apiUrl}`,
          warnings: ['Start the server with: local-operator serve'],
        };
      }
    } else {
      // CLI mode - check if command exists
      return new Promise((resolve) => {
        const process = spawn('local-operator', ['--version']);

        process.on('close', (code) => {
          if (code === 0) {
            resolve({ isValid: true });
          } else {
            resolve({
              isValid: false,
              error: 'local-operator CLI not found',
              warnings: ['Install with: pip install local-operator'],
            });
          }
        });

        process.on('error', () => {
          resolve({
            isValid: false,
            error: 'local-operator CLI not found',
            warnings: ['Install with: pip install local-operator'],
          });
        });
      });
    }
  }

  async healthCheck(): Promise<boolean> {
    const validation = await this.validateConfig();
    return validation.isValid;
  }

  /**
   * Ensure API server is running (start if needed).
   */
  private async ensureServerRunning(): Promise<void> {
    try {
      await axios.get(`${this.apiUrl}/health`, { timeout: 2000 });
    } catch (error) {
      // Server not running, try to start it
      console.log('Starting local-operator server...');

      spawn('local-operator', ['serve', '--port', '8080'], {
        detached: true,
        stdio: 'ignore',
      }).unref();

      // Wait for server to start
      await this.waitForServer(10);
    }
  }

  /**
   * Wait for server to become available.
   */
  private async waitForServer(maxAttempts: number = 10): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        await axios.get(`${this.apiUrl}/health`, { timeout: 1000 });
        return;
      } catch (error) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    throw new Error('local-operator server failed to start');
  }
}
