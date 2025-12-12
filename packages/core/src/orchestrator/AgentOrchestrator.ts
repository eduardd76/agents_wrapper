import type { AgentAdapter } from '../adapters/base/AgentAdapter.js';
import type {
  AgentResponse,
  ExecutionOptions,
  StreamChunk,
} from '../types/agent.types.js';
import type { OrchestrationResult } from '../types/task.types.js';
import { SessionManager } from '../session/SessionManager.js';

/**
 * Main orchestrator for coordinating multiple AI agents.
 * Supports single agent execution, multi-agent comparison, and streaming.
 */
export class AgentOrchestrator {
  private adapters: Map<string, AgentAdapter>;
  private sessionManager: SessionManager;

  constructor(sessionManager: SessionManager) {
    this.adapters = new Map();
    this.sessionManager = sessionManager;
  }

  /**
   * Register an agent adapter.
   */
  registerAdapter(adapter: AgentAdapter): void {
    this.adapters.set(adapter.getName(), adapter);
  }

  /**
   * Get all registered agent names.
   */
  getAvailableAgents(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Execute a task on a single agent.
   */
  async executeSingle(
    task: string,
    agentName: string,
    options?: ExecutionOptions
  ): Promise<AgentResponse> {
    const adapter = this.adapters.get(agentName);
    if (!adapter) {
      throw new Error(`Agent '${agentName}' not found`);
    }

    // Add user message to session if sessionId provided
    if (options?.sessionId) {
      await this.sessionManager.addMessage(
        options.sessionId,
        agentName,
        {
          role: 'user',
          content: task,
          timestamp: new Date(),
        }
      );
    }

    const response = await adapter.execute(task, options);

    // Add assistant response to session
    if (options?.sessionId) {
      await this.sessionManager.addMessage(
        options.sessionId,
        agentName,
        {
          role: 'assistant',
          content: response.content,
          timestamp: new Date(),
        }
      );

      // Update session metadata with token usage and cost
      await this.sessionManager.updateMetadata(
        options.sessionId,
        agentName,
        {
          totalTokens: response.metadata.tokensUsed,
          totalCost: response.metadata.cost || 0,
        }
      );
    }

    return response;
  }

  /**
   * Execute a task on multiple agents in parallel.
   * Returns all responses (successful and failed).
   */
  async executeMultiple(
    task: string,
    agentNames: string[],
    options?: ExecutionOptions
  ): Promise<OrchestrationResult> {
    // Validate all agents exist
    for (const name of agentNames) {
      if (!this.adapters.has(name)) {
        throw new Error(`Agent '${name}' not found`);
      }
    }

    const startTime = Date.now();

    // Execute all agents in parallel
    const executions = agentNames.map(async (agentName) => {
      const agentStartTime = Date.now();
      try {
        const response = await this.executeSingle(task, agentName, options);
        return {
          agentName,
          response,
          duration: Date.now() - agentStartTime,
          success: !response.error,
        };
      } catch (error) {
        return {
          agentName,
          error,
          duration: Date.now() - agentStartTime,
          success: false,
        };
      }
    });

    const results = await Promise.allSettled(executions);

    // Separate successful from failed responses
    const responses = new Map<string, AgentResponse>();
    const errors = new Map<string, any>();
    const timings = new Map<string, number>();
    const costs = new Map<string, number>();

    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        const { agentName, response, error, duration } = result.value;

        if (response) {
          responses.set(agentName, response);
          costs.set(agentName, response.metadata.cost || 0);
        } else if (error) {
          errors.set(agentName, error);
        }

        timings.set(agentName, duration);
      } else {
        // Promise rejected
        const agentName = agentNames[results.indexOf(result)];
        errors.set(agentName, result.reason);
      }
    });

    // Calculate metrics
    const totalDuration = Date.now() - startTime;
    let fastestAgent: string | undefined;
    let fastestTime: number | undefined;
    let cheapestAgent: string | undefined;
    let cheapestCost = Infinity;
    let totalCost = 0;

    timings.forEach((time, agent) => {
      if (responses.has(agent)) {
        if (!fastestTime || time < fastestTime) {
          fastestTime = time;
          fastestAgent = agent;
        }
      }
    });

    costs.forEach((cost, agent) => {
      totalCost += cost;
      if (cost < cheapestCost) {
        cheapestCost = cost;
        cheapestAgent = agent;
      }
    });

    return {
      responses,
      errors,
      timing: {
        totalDuration,
        fastestAgent,
        fastestTime,
      },
      costs: {
        total: totalCost,
        byAgent: costs,
        cheapestAgent,
      },
    };
  }

  /**
   * Execute a task on multiple agents with streaming.
   * Multiplexes stream chunks from all agents.
   */
  async streamMultiple(
    task: string,
    agentNames: string[],
    onChunk: (chunk: StreamChunk) => void,
    options?: ExecutionOptions
  ): Promise<OrchestrationResult> {
    // Validate all agents exist
    for (const name of agentNames) {
      if (!this.adapters.has(name)) {
        throw new Error(`Agent '${name}' not found`);
      }
    }

    const startTime = Date.now();

    // Track session messages
    if (options?.sessionId) {
      for (const agentName of agentNames) {
        await this.sessionManager.addMessage(
          options.sessionId,
          agentName,
          {
            role: 'user',
            content: task,
            timestamp: new Date(),
          }
        );
      }
    }

    // Start all streams in parallel
    const streams = agentNames.map(async (agentName) => {
      const agentStartTime = Date.now();
      const adapter = this.adapters.get(agentName)!;

      try {
        const response = await adapter.stream(task, onChunk, options);

        // Update session
        if (options?.sessionId) {
          await this.sessionManager.addMessage(
            options.sessionId,
            agentName,
            {
              role: 'assistant',
              content: response.content,
              timestamp: new Date(),
            }
          );

          await this.sessionManager.updateMetadata(
            options.sessionId,
            agentName,
            {
              totalTokens: response.metadata.tokensUsed,
              totalCost: response.metadata.cost || 0,
            }
          );
        }

        return {
          agentName,
          response,
          duration: Date.now() - agentStartTime,
          success: !response.error,
        };
      } catch (error) {
        return {
          agentName,
          error,
          duration: Date.now() - agentStartTime,
          success: false,
        };
      }
    });

    const results = await Promise.allSettled(streams);

    // Build result (same structure as executeMultiple)
    const responses = new Map<string, AgentResponse>();
    const errors = new Map<string, any>();
    const timings = new Map<string, number>();
    const costs = new Map<string, number>();

    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        const { agentName, response, error, duration } = result.value;

        if (response) {
          responses.set(agentName, response);
          costs.set(agentName, response.metadata.cost || 0);
        } else if (error) {
          errors.set(agentName, error);
        }

        timings.set(agentName, duration);
      }
    });

    const totalDuration = Date.now() - startTime;
    let fastestAgent: string | undefined;
    let fastestTime: number | undefined;
    let cheapestAgent: string | undefined;
    let cheapestCost = Infinity;
    let totalCost = 0;

    timings.forEach((time, agent) => {
      if (responses.has(agent)) {
        if (!fastestTime || time < fastestTime) {
          fastestTime = time;
          fastestAgent = agent;
        }
      }
    });

    costs.forEach((cost, agent) => {
      totalCost += cost;
      if (cost < cheapestCost) {
        cheapestCost = cost;
        cheapestAgent = agent;
      }
    });

    return {
      responses,
      errors,
      timing: {
        totalDuration,
        fastestAgent,
        fastestTime,
      },
      costs: {
        total: totalCost,
        byAgent: costs,
        cheapestAgent,
      },
    };
  }

  /**
   * Stream a task to a single agent.
   */
  async streamSingle(
    task: string,
    agentName: string,
    onChunk: (chunk: StreamChunk) => void,
    options?: ExecutionOptions
  ): Promise<AgentResponse> {
    const adapter = this.adapters.get(agentName);
    if (!adapter) {
      throw new Error(`Agent '${agentName}' not found`);
    }

    if (options?.sessionId) {
      await this.sessionManager.addMessage(
        options.sessionId,
        agentName,
        {
          role: 'user',
          content: task,
          timestamp: new Date(),
        }
      );
    }

    const response = await adapter.stream(task, onChunk, options);

    if (options?.sessionId) {
      await this.sessionManager.addMessage(
        options.sessionId,
        agentName,
        {
          role: 'assistant',
          content: response.content,
          timestamp: new Date(),
        }
      );

      await this.sessionManager.updateMetadata(
        options.sessionId,
        agentName,
        {
          totalTokens: response.metadata.tokensUsed,
          totalCost: response.metadata.cost || 0,
        }
      );
    }

    return response;
  }
}
