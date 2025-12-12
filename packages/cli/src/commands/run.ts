import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { initOrchestrator } from '../utils/orchestrator.js';

export const runCommand = new Command('run')
  .description('Execute a task on a single agent')
  .argument('<task>', 'Task to execute')
  .option('-a, --agent <name>', 'Agent to use', 'claude')
  .option('--stream', 'Stream the response in real-time')
  .option('--session <id>', 'Session ID for conversation context')
  .action(async (task: string, options) => {
    const spinner = ora(`Executing task with ${options.agent}...`).start();

    try {
      const orchestrator = await initOrchestrator();

      if (options.stream) {
        spinner.stop();
        console.log(chalk.bold.cyan(`\n${options.agent.toUpperCase()}:\n`));

        await orchestrator.streamSingle(
          task,
          options.agent,
          (chunk) => {
            if (!chunk.isComplete) {
              process.stdout.write(chunk.delta);
            } else if (chunk.metadata) {
              console.log(
                chalk.gray(
                  `\n\n[${chunk.metadata.responseTime}ms, ${chunk.metadata.tokensUsed} tokens, $${chunk.metadata.cost?.toFixed(4) || '0.0000'}]`
                )
              );
            }
          },
          {
            sessionId: options.session,
          }
        );
      } else {
        const response = await orchestrator.executeSingle(
          task,
          options.agent,
          {
            sessionId: options.session,
          }
        );

        spinner.stop();

        if (response.error) {
          console.log(chalk.red(`\nError: ${response.error.message}`));
          process.exit(1);
        }

        console.log(chalk.bold.cyan(`\n${options.agent.toUpperCase()}:\n`));
        console.log(response.content);
        console.log(
          chalk.gray(
            `\n[${response.metadata.responseTime}ms, ${response.metadata.tokensUsed} tokens, $${response.metadata.cost?.toFixed(4) || '0.0000'}]`
          )
        );
      }
    } catch (error: any) {
      spinner.fail(chalk.red(error.message));
      process.exit(1);
    }
  });
