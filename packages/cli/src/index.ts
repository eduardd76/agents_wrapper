#!/usr/bin/env node

import { Command } from 'commander';
import { compareCommand } from './commands/compare.js';
import { runCommand } from './commands/run.js';
import { configCommand } from './commands/config.js';

const program = new Command();

program
  .name('multi-agent')
  .description('AI coding agent orchestrator for Claude, OpenAI, Gemini, and local-operator')
  .version('0.1.0');

program.addCommand(runCommand);
program.addCommand(compareCommand);
program.addCommand(configCommand);

program.parse();
