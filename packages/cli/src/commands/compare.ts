import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import Table from 'cli-table3';
import { initOrchestrator } from '../utils/orchestrator.js';
import type { StreamChunk } from '@multi-agent/core';

export const compareCommand = new Command('compare')
  .description('Compare responses from multiple agents')
  .argument('<task>', 'Task to execute')
  .option(
    '-a, --agents <names>',
    'Agents to use (comma-separated)',
    'claude,openai,gemini'
  )
  .option('--stream', 'Stream responses in real-time')
  .option('--session <id>', 'Session ID for conversation context')
  .action(async (task: string, options) => {
    const agents = options.agents.split(',').map((a: string) => a.trim());
    const spinner = ora(`Comparing ${agents.length} agents...`).start();

    try {
      const orchestrator = await initOrchestrator();

      if (options.stream) {
        spinner.stop();
        displayStreamingComparison(orchestrator, task, agents, options.session);
      } else {
        const result = await orchestrator.executeMultiple(task, agents, {
          sessionId: options.session,
        });

        spinner.stop();
        displayComparison(result, agents);
      }
    } catch (error: any) {
      spinner.fail(chalk.red(error.message));
      process.exit(1);
    }
  });

function displayComparison(result: any, agents: string[]) {
  console.log(chalk.bold('\n📊 Multi-Agent Comparison\n'));

  // Create table
  const table = new Table({
    head: ['Agent', 'Status', 'Time', 'Tokens', 'Cost'].map((h) =>
      chalk.bold.cyan(h)
    ),
    colWidths: [15, 12, 12, 12, 12],
  });

  for (const agent of agents) {
    const response = result.responses.get(agent);
    const error = result.errors.get(agent);

    if (response) {
      table.push([
        chalk.green(agent),
        chalk.green('✓ Success'),
        `${response.metadata.responseTime}ms`,
        response.metadata.tokensUsed.toString(),
        `$${response.metadata.cost?.toFixed(4) || '0.0000'}`,
      ]);
    } else if (error) {
      table.push([
        chalk.red(agent),
        chalk.red('✗ Failed'),
        '-',
        '-',
        '-',
      ]);
    }
  }

  console.log(table.toString());

  // Display metrics
  console.log(chalk.bold('\n📈 Metrics:\n'));
  console.log(
    `⚡ Fastest: ${chalk.green(result.timing.fastestAgent)} (${result.timing.fastestTime}ms)`
  );
  console.log(
    `💰 Cheapest: ${chalk.green(result.costs.cheapestAgent)} ($${result.costs.byAgent.get(result.costs.cheapestAgent)?.toFixed(4)})`
  );
  console.log(`💵 Total Cost: $${result.costs.total.toFixed(4)}`);

  // Display responses
  console.log(chalk.bold('\n📝 Responses:\n'));

  for (const agent of agents) {
    const response = result.responses.get(agent);
    if (response) {
      console.log(chalk.bold.cyan(`\n${agent.toUpperCase()}:`));
      console.log(chalk.gray('─'.repeat(60)));
      console.log(response.content);
      console.log(chalk.gray('─'.repeat(60)));
    }
  }

  // Display errors
  if (result.errors.size > 0) {
    console.log(chalk.bold.red('\n❌ Errors:\n'));
    for (const [agent, error] of result.errors) {
      console.log(chalk.red(`${agent}: ${error.message || error}`));
    }
  }
}

async function displayStreamingComparison(
  orchestrator: any,
  task: string,
  agents: string[],
  sessionId?: string
) {
  console.log(chalk.bold('\n🔄 Streaming Multi-Agent Comparison\n'));

  const outputs = new Map<string, string>();
  const completions = new Set<string>();

  // Initialize outputs
  for (const agent of agents) {
    outputs.set(agent, '');
    console.log(chalk.bold.cyan(`${agent.toUpperCase()}:`));
    console.log(chalk.gray('─'.repeat(60)));
  }

  await orchestrator.streamMultiple(
    task,
    agents,
    (chunk: StreamChunk) => {
      if (!chunk.isComplete) {
        const current = outputs.get(chunk.agentName) || '';
        outputs.set(chunk.agentName, current + chunk.delta);

        // For simplicity, just accumulate. Real implementation would
        // update in-place using ANSI codes
      } else {
        completions.add(chunk.agentName);

        if (chunk.metadata) {
          console.log(
            chalk.gray(
              `\n${chunk.agentName}: ${chunk.metadata.responseTime}ms, ${chunk.metadata.tokensUsed} tokens, $${chunk.metadata.cost?.toFixed(4) || '0.0000'}`
            )
          );
        }
      }
    },
    { sessionId }
  );

  // Display all outputs
  console.log(chalk.bold('\n📝 Complete Responses:\n'));
  for (const agent of agents) {
    console.log(chalk.bold.cyan(`\n${agent.toUpperCase()}:`));
    console.log(chalk.gray('─'.repeat(60)));
    console.log(outputs.get(agent) || '');
    console.log(chalk.gray('─'.repeat(60)));
  }
}
