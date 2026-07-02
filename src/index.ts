#!/usr/bin/env node

/**
 * spec-graph v2 CLI
 *
 * The human-facing (and agent-orchestrated) command-line interface to
 * the spec-graph engine. Every command delegates to @spec-graph/core.
 *
 * Three API surfaces:
 *   1. auto — full automatic workflow
 *   2. stateless — verb commands for external orchestration
 *   3. hook — agent hook integration
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as core from '@spec-graph/core';

// Register built-in adapters at startup so `auto` works immediately
const { createClaudeCodeAdapter, createCodexAdapter } = require('@spec-graph/core');
try { createClaudeCodeAdapter(); } catch {}
try { createCodexAdapter(); } catch {}

import { register as registerStatus } from './commands/status.js';
import { register as registerPlan } from './commands/plan.js';
import { register as registerAuto } from './commands/auto.js';
import { register as registerNextPrompt } from './commands/next-prompt.js';
import { register as registerAdvance } from './commands/advance.js';
import { register as registerValidate } from './commands/validate.js';
import { register as registerIntervene } from './commands/intervene.js';
import { register as registerDiagnose } from './commands/diagnose.js';
import { register as registerCompletion } from './commands/completion.js';
import { register as registerSessions } from './commands/sessions.js';
import { register as registerInit } from './commands/init.js';
import { register as registerCompose } from './commands/compose.js';
import { register as registerConfig } from './commands/config.js';
import { register as registerInstall } from './commands/install.js';
import { register as registerDispatch } from './commands/dispatch.js';
import { register as registerGate } from './commands/gate.js';
import { register as registerCheck } from './commands/check.js';
import { register as registerMachine } from './commands/machine.js';
import { register as registerAnalyze } from './commands/analyze.js';

const program = new Command();

program
  .name('spec-graph')
  .description(
    'spec-graph v2: strict-gate, prompt-driven, automatic progression development brain'
  )
  .version(core.VERSION);

// Register all commands
registerStatus(program);
registerPlan(program);
registerAuto(program);
registerNextPrompt(program);
registerAdvance(program);
registerValidate(program);
registerIntervene(program);
registerDiagnose(program);
registerCompletion(program);
registerSessions(program);
registerInit(program);
registerCompose(program);
registerConfig(program);
registerInstall(program);
registerDispatch(program);
registerGate(program);
registerCheck(program);
registerMachine(program);
registerAnalyze(program);

// Run
program.parseAsync(process.argv).catch((err: Error) => {
  console.error(chalk.red('spec-graph error:'), err.message);
  process.exit(1);
});
