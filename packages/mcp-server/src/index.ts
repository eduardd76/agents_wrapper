import { homedir } from 'os';
import { join } from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  AgentOrchestrator,
  ClaudeAdapter,
  OpenAIAdapter,
  GeminiAdapter,
  LocalOperatorAdapter,
  SessionManager,
  FileSessionStorage,
} from '@multi-agent/core';
import type { AgentResponse, OrchestrationResult } from '@multi-agent/core';

/**
 * Stdio MCP server that exposes the orchestrator to Claude Code.
 *
 * stdout carries the MCP protocol, so all diagnostics go to stderr.
 * Config is read from the environment only (no .env or config file), so the
 * server never picks up keys from whatever project Claude Code is running in.
 */

/**
 * Return the first non-empty value among the given env vars.
 * Values that are still an unsubstituted `${...}` placeholder count as unset,
 * so a blank plugin option falls back to the standard variable name.
 */
function readEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value && !value.startsWith('${')) {
      return value;
    }
  }
  return undefined;
}

function buildOrchestrator(): AgentOrchestrator {
  const sessionPath =
    readEnv('CLAUDE_PLUGIN_DATA') !== undefined
      ? join(process.env.CLAUDE_PLUGIN_DATA!, 'sessions')
      : join(homedir(), '.multi-agent', 'sessions');
  const orchestrator = new AgentOrchestrator(
    new SessionManager(new FileSessionStorage(sessionPath))
  );

  const register = (name: string, create: () => void) => {
    try {
      create();
    } catch (error) {
      console.error(`[agents-wrapper] Failed to initialize ${name}:`, error);
    }
  };

  const anthropicKey = readEnv('AGENTS_WRAPPER_ANTHROPIC_API_KEY', 'ANTHROPIC_API_KEY');
  if (anthropicKey) {
    register('claude', () =>
      orchestrator.registerAdapter(
        new ClaudeAdapter({ apiKey: anthropicKey, model: readEnv('ANTHROPIC_MODEL') })
      )
    );
  }

  const openaiKey = readEnv('AGENTS_WRAPPER_OPENAI_API_KEY', 'OPENAI_API_KEY');
  if (openaiKey) {
    register('openai', () =>
      orchestrator.registerAdapter(
        new OpenAIAdapter({ apiKey: openaiKey, model: readEnv('OPENAI_MODEL') })
      )
    );
  }

  const googleKey = readEnv('AGENTS_WRAPPER_GOOGLE_API_KEY', 'GOOGLE_API_KEY');
  if (googleKey) {
    register('gemini', () =>
      orchestrator.registerAdapter(
        new GeminiAdapter({ apiKey: googleKey, model: readEnv('GEMINI_MODEL') })
      )
    );
  }

  // Only register local-operator when explicitly configured; otherwise every
  // comparison would include a guaranteed connection failure.
  const localOperatorUrl = readEnv('LOCAL_OPERATOR_API_URL');
  if (localOperatorUrl) {
    register('local-operator', () =>
      orchestrator.registerAdapter(
        new LocalOperatorAdapter({
          apiKey: '',
          mode: (readEnv('LOCAL_OPERATOR_MODE') as 'api' | 'cli') || 'api',
          apiUrl: localOperatorUrl,
          model: readEnv('LOCAL_OPERATOR_MODEL'),
        })
      )
    );
  }

  return orchestrator;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

function formatResponse(response: AgentResponse): string {
  const { model, responseTime, tokensUsed, cost } = response.metadata;
  const header = `## ${response.agentName} (${model}, ${responseTime}ms, ${tokensUsed} tokens, $${(cost ?? 0).toFixed(4)})`;
  if (response.error) {
    return `${header}\n\nERROR (${response.error.code}): ${response.error.message}`;
  }
  return `${header}\n\n${response.content}`;
}

/**
 * Adapters report API failures as a response with `error` set rather than
 * throwing, so the orchestrator's fastest/cheapest metrics can name a failed
 * agent. Recompute them from successful responses only.
 */
function formatComparison(result: OrchestrationResult): { text: string; allFailed: boolean } {
  const responses = [...result.responses.values()] as AgentResponse[];
  const succeeded = responses.filter((response) => !response.error);

  const sections = responses.map(formatResponse);
  for (const [agent, error] of result.errors) {
    sections.push(`## ${agent}\n\nERROR: ${errorMessage(error)}`);
  }

  const fastest = [...succeeded].sort(
    (a, b) => a.metadata.responseTime - b.metadata.responseTime
  )[0];
  const cheapest = [...succeeded].sort(
    (a, b) => (a.metadata.cost ?? 0) - (b.metadata.cost ?? 0)
  )[0];
  const summary = [
    `Succeeded: ${succeeded.length}/${responses.length + result.errors.size}`,
    `Total time: ${result.timing.totalDuration}ms`,
    fastest && `Fastest: ${fastest.agentName}`,
    cheapest && `Cheapest: ${cheapest.agentName}`,
    `Total cost: $${result.costs.total.toFixed(4)}`,
  ]
    .filter(Boolean)
    .join(' | ');

  return {
    text: `${sections.join('\n\n---\n\n')}\n\n---\n\n${summary}`,
    allFailed: succeeded.length === 0,
  };
}

const NO_AGENTS_MESSAGE =
  'No agents are configured. Set OPENAI_API_KEY, GOOGLE_API_KEY, ANTHROPIC_API_KEY, ' +
  'or LOCAL_OPERATOR_API_URL, or run /plugin configure agents-wrapper@agents-wrapper-tools.';

function textResult(text: string, isError = false) {
  return { content: [{ type: 'text' as const, text }], isError };
}

async function main(): Promise<void> {
  const orchestrator = buildOrchestrator();
  const server = new McpServer({ name: 'agents-wrapper', version: '0.1.0' });

  server.registerTool(
    'list_agents',
    {
      description: 'List the external AI agents (OpenAI, Gemini, Claude API, local-operator) that are configured.',
      inputSchema: {},
    },
    async () => {
      const agents = orchestrator.getAvailableAgents();
      return textResult(agents.length ? agents.join('\n') : NO_AGENTS_MESSAGE);
    }
  );

  const optionalExecutionInputs = {
    system_prompt: z.string().optional().describe('System prompt sent to every agent'),
    max_tokens: z.number().int().positive().max(32000).optional().describe('Max output tokens per agent'),
  };

  server.registerTool(
    'compare_agents',
    {
      description:
        'Send the same self-contained prompt to several external AI agents in parallel and return every answer with timing and cost. Use for second opinions; the agents cannot see local files, so include all needed context in the task.',
      inputSchema: {
        task: z.string().min(1).describe('Complete, self-contained prompt'),
        agents: z
          .array(z.string())
          .optional()
          .describe('Agent names from list_agents; defaults to all configured agents'),
        ...optionalExecutionInputs,
      },
    },
    async ({ task, agents, system_prompt, max_tokens }) => {
      const available = orchestrator.getAvailableAgents();
      if (available.length === 0) return textResult(NO_AGENTS_MESSAGE, true);

      const selected = agents?.length ? agents : available;
      const unknown = selected.filter((name) => !available.includes(name));
      if (unknown.length) {
        return textResult(
          `Unknown or unconfigured agents: ${unknown.join(', ')}. Available: ${available.join(', ')}`,
          true
        );
      }

      const result = await orchestrator.executeMultiple(task, selected, {
        systemPrompt: system_prompt,
        maxTokens: max_tokens,
      });
      const { text, allFailed } = formatComparison(result);
      return textResult(text, allFailed);
    }
  );

  server.registerTool(
    'run_agent',
    {
      description:
        'Send a self-contained prompt to one external AI agent and return its answer with timing and cost.',
      inputSchema: {
        task: z.string().min(1).describe('Complete, self-contained prompt'),
        agent: z.string().describe('Agent name from list_agents'),
        ...optionalExecutionInputs,
      },
    },
    async ({ task, agent, system_prompt, max_tokens }) => {
      const available = orchestrator.getAvailableAgents();
      if (!available.includes(agent)) {
        return textResult(
          available.length
            ? `Agent '${agent}' is not configured. Available: ${available.join(', ')}`
            : NO_AGENTS_MESSAGE,
          true
        );
      }
      try {
        const response = await orchestrator.executeSingle(task, agent, {
          systemPrompt: system_prompt,
          maxTokens: max_tokens,
        });
        return textResult(formatResponse(response), Boolean(response.error));
      } catch (error) {
        return textResult(`${agent} failed: ${errorMessage(error)}`, true);
      }
    }
  );

  await server.connect(new StdioServerTransport());
  console.error(
    `[agents-wrapper] MCP server ready; agents: ${orchestrator.getAvailableAgents().join(', ') || 'none'}`
  );
}

main().catch((error) => {
  console.error('[agents-wrapper] Fatal error:', error);
  process.exit(1);
});
