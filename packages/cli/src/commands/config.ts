import { Command } from 'commander';
import chalk from 'chalk';
import { prompt } from 'enquirer';
import { ConfigManager } from '@multi-agent/core';

export const configCommand = new Command('config')
  .description('Manage agent configurations and API keys')
  .option('--validate', 'Validate all configured agents')
  .option('--set <agent>', 'Set API key for an agent')
  .action(async (options) => {
    const configManager = new ConfigManager();
    await configManager.loadConfig();

    if (options.validate) {
      console.log(chalk.bold('\n🔍 Validating Agent Configurations...\n'));

      const validations = await configManager.validateAll();

      for (const [agent, validation] of validations) {
        if (validation.isValid) {
          console.log(chalk.green(`✓ ${agent}: Valid`));
        } else {
          console.log(chalk.red(`✗ ${agent}: ${validation.error}`));
          if (validation.warnings) {
            validation.warnings.forEach((warning) => {
              console.log(chalk.yellow(`  ⚠ ${warning}`));
            });
          }
        }
      }
    } else if (options.set) {
      const agent = options.set;

      const response: any = await prompt({
        type: 'password',
        name: 'apiKey',
        message: `Enter API key for ${agent}:`,
      });

      await configManager.setCredential(agent, response.apiKey);
      console.log(chalk.green(`\n✓ API key for ${agent} has been saved`));
    } else {
      // Show current configuration
      const config = configManager.getConfig();

      console.log(chalk.bold('\n⚙️  Current Configuration:\n'));

      console.log(chalk.cyan('Claude:'));
      console.log(
        `  API Key: ${config.anthropic?.apiKey ? ConfigManager.maskApiKey(config.anthropic.apiKey) : chalk.red('Not set')}`
      );
      console.log(`  Model: ${config.anthropic?.model || 'Not set'}`);

      console.log(chalk.cyan('\nOpenAI:'));
      console.log(
        `  API Key: ${config.openai?.apiKey ? ConfigManager.maskApiKey(config.openai.apiKey) : chalk.red('Not set')}`
      );
      console.log(`  Model: ${config.openai?.model || 'Not set'}`);

      console.log(chalk.cyan('\nGemini:'));
      console.log(
        `  API Key: ${config.gemini?.apiKey ? ConfigManager.maskApiKey(config.gemini.apiKey) : chalk.red('Not set')}`
      );
      console.log(`  Model: ${config.gemini?.model || 'Not set'}`);

      console.log(chalk.cyan('\nLocal Operator:'));
      console.log(`  Mode: ${config.localOperator?.mode || 'Not set'}`);
      console.log(`  API URL: ${config.localOperator?.apiUrl || 'Not set'}`);
      console.log(`  Model: ${config.localOperator?.model || 'Not set'}`);

      console.log(chalk.gray('\nRun with --validate to check configurations'));
      console.log(chalk.gray('Run with --set <agent> to configure API keys'));
    }
  });
