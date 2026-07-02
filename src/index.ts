#!/usr/bin/env node

/**
 * spec-graph v3 CLI
 *
 * The human-facing (and agent-orchestrated) command-line interface to
 * the spec-graph engine. Every command delegates to @spec-graph/core.
 *
 * Two API surfaces:
 *   1. hook — dispatch + dispatch-watcher hook for local agent integration
 *   2. stateless — verb commands for external orchestration (dispatch, advance)
 *
 * spec-graph is a declaration engine: it generates dispatch manifests and
 * evaluates gates, but never executes directly. All agent invocation is
 * delegated to external coordinators.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as core from '@spec-graph/core';

import { register as registerStatus } from './commands/status.js';
import { register as registerPlan } from './commands/plan.js';
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
import { register as registerArtifactComplete } from './commands/artifact-complete.js';
import { register as registerCheckRun } from './commands/check-run.js';

const program = new Command();

program
  .name('spec-graph')
  .description(
    'spec-graph v3: declaration engine — dispatch manifest generator + gate evaluator'
  )
  .version(core.VERSION);

// Register all commands
registerStatus(program);
registerPlan(program);
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
registerArtifactComplete(program);
registerCheckRun(program);
registerAnalyze(program);

// Run
program.parseAsync(process.argv).catch((err: Error) => {
  console.error(chalk.red('spec-graph error:'), err.message);
  process.exit(1);
});
