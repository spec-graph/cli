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
 *   3. hook — agent hook integration (future)
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as core from '@spec-graph/core';

const program = new Command();

program
  .name('spec-graph')
  .description(
    'spec-graph v2: strict-gate, prompt-driven, automatic progression development brain'
  )
  .version(core.VERSION);

// ---------------------------------------------------------------------------
// Status command
// ---------------------------------------------------------------------------
program
  .command('status')
  .description('Show current workflow state')
  .option('--json', 'output as JSON')
  .option('--session <id>', 'session id')
  .action(async (opts) => {
    const sessions = core.automator.listSessions();
    const s = core.automator.status(
      opts.session || (sessions.length > 0 ? sessions[0] : undefined)
    );

    if (opts.json) {
      console.log(JSON.stringify(s, null, 2));
    } else {
      if (!s.sessionId || !s.state) {
        console.log(chalk.yellow('No active session.'));
        console.log(`Run ${chalk.cyan('spec-graph plan "<intent>"')} to start.`);
        return;
      }
      console.log(chalk.bold(`Session:  ${s.sessionId}`));
      console.log(`Intent:   ${s.intent}`);
      console.log(`Stage:    ${s.stage} (${s.state})`);
      console.log(`Progress: ${s.progress.currentStageIndex + 1}/${s.progress.totalStages} stages`);
      console.log(`Artifacts: ${s.progress.completedArtifacts}`);
      if (s.blockers.length > 0) {
        console.log(chalk.red(`Blockers: ${s.blockers.join(', ')}`));
      }
      if (s.recentDiagnosis) {
        console.log(chalk.yellow('\nRecent diagnosis:'));
        for (const fc of s.recentDiagnosis.failedCriteria) {
          console.log(`  ✗ ${fc.id}: ${fc.reason}`);
        }
      }
    }
  });

// ---------------------------------------------------------------------------
// Plan command
// ---------------------------------------------------------------------------
program
  .command('plan <intent>')
  .description('Transform user intent into a structured plan')
  .option('--json', 'output plan as JSON')
  .option('--confirm', 'auto-confirm the generated plan')
  .action(async (intent, opts) => {
    const plan = core.automator.startSession(intent);

    if (opts.confirm) {
      core.automator.confirmPlan(plan.sessionId, plan);
    }

    if (opts.json) {
      console.log(JSON.stringify({ confirmed: !!opts.confirm, ...plan }, null, 2));
    } else {
      console.log(chalk.bold(`\nPlan: "${plan.intent}"`));
      console.log(chalk.gray(`Session:    ${plan.sessionId}`));
      console.log(chalk.gray(`Complexity: ${plan.complexity}`));
      console.log('');
      console.log(chalk.bold('Capabilities:'));
      for (const cap of plan.capabilities) {
        const deps = cap.dependsOn.length > 0
          ? chalk.gray(` (depends on: ${cap.dependsOn.join(', ')})`)
          : '';
        console.log(`  - ${cap.id}${deps}`);
      }
      if (plan.risks.length > 0) {
        console.log('');
        console.log(chalk.bold('Risks:'));
        for (const r of plan.risks) {
          console.log(`  - ${r}`);
        }
      }
      console.log('');
      if (!opts.confirm) {
        console.log(chalk.yellow('⚠ Plan not yet confirmed.'));
        console.log(`Run ${chalk.cyan(`spec-graph plan "${intent}" --confirm`)} to confirm.`);
      } else {
        console.log(chalk.green('✓ Plan confirmed. Ready!'));
        console.log(`Run: ${chalk.cyan('spec-graph next-prompt')}`);
      }
    }
  });

// ---------------------------------------------------------------------------
// Auto command
// ---------------------------------------------------------------------------
program
  .command('auto <intent>')
  .description('Start the full automatic workflow')
  .action(async (intent) => {
    const plan = core.automator.startSession(intent);
    core.automator.confirmPlan(plan.sessionId, plan);

    console.log(chalk.green(`✓ Session: ${plan.sessionId}`));
    console.log(chalk.gray(`  Stage: specify (1/8)`));
    console.log('');
    console.log(`Run ${chalk.cyan('spec-graph next-prompt')} for the first prompt.`);
  });

// ---------------------------------------------------------------------------
// next-prompt command
// ---------------------------------------------------------------------------
program
  .command('next-prompt')
  .description('Get the next prompt for the external agent')
  .option('--session <id>', 'session id')
  .action(async (opts) => {
    const sessions = core.automator.listSessions();
    const sessionId = opts.session || (sessions.length > 0 ? sessions[0] : null);
    if (!sessionId) {
      console.log(JSON.stringify({ error: 'No active sessions' }));
      return;
    }

    try {
      const prompt = core.automator.nextPrompt(sessionId);
      console.log(prompt.xml);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(JSON.stringify({ error: msg }));
    }
  });

// ---------------------------------------------------------------------------
// advance command
// ---------------------------------------------------------------------------
program
  .command('advance')
  .description('Submit agent result and advance state')
  .option('--result <json>', 'agent result as JSON')
  .option('--session <id>', 'session id')
  .action(async (opts) => {
    const sessions = core.automator.listSessions();
    const sessionId = opts.session || (sessions.length > 0 ? sessions[0] : null);
    if (!sessionId) {
      console.log(JSON.stringify({ error: 'No session found' }));
      return;
    }

    let result: core.AgentResult;
    try {
      result = opts.result
        ? JSON.parse(opts.result)
        : { artifacts: [], selfCheck: { acceptanceCriteriaMet: true } };
    } catch {
      result = { artifacts: [] };
    }

    const advanceResult = core.automator.submitResult(sessionId, result);
    console.log(JSON.stringify(advanceResult, null, 2));
  });

// ---------------------------------------------------------------------------
// validate command
// ---------------------------------------------------------------------------
program
  .command('validate')
  .description('Validate current state / artifacts')
  .option('--session <id>', 'session id')
  .action(async (opts) => {
    const sessions = core.automator.listSessions();
    const sessionId = opts.session || (sessions.length > 0 ? sessions[0] : null);
    if (!sessionId) {
      console.log(JSON.stringify({ error: 'No session found' }));
      return;
    }
    const s = core.automator.status(sessionId);
    console.log(JSON.stringify(s, null, 2));
  });

// ---------------------------------------------------------------------------
// intervene command
// ---------------------------------------------------------------------------
program
  .command('intervene <action>')
  .description('Intervene: force-advance | rollback | resume | modify-plan')
  .option('--session <id>', 'session id')
  .action(async (action, opts) => {
    const sessions = core.automator.listSessions();
    const sessionId = opts.session || (sessions.length > 0 ? sessions[0] : null);
    if (!sessionId) {
      console.log(JSON.stringify({ error: 'No session found' }));
      return;
    }

    const valid = ['force-advance', 'rollback', 'resume', 'modify-plan'];
    if (!valid.includes(action)) {
      console.log(JSON.stringify({ error: `Invalid action. Choose: ${valid.join(', ')}` }));
      return;
    }

    const result = core.automator.intervene(sessionId, action as any);
    console.log(JSON.stringify(result, null, 2));
  });

// ---------------------------------------------------------------------------
// diagnose command
// ---------------------------------------------------------------------------
program
  .command('diagnose')
  .description('Show the most recent gate failure diagnosis')
  .option('--session <id>', 'session id')
  .option('--json', 'output as JSON')
  .action(async (opts) => {
    const sessions = core.automator.listSessions();
    const sessionId = opts.session || (sessions.length > 0 ? sessions[0] : null);
    if (!sessionId) {
      console.log(JSON.stringify({ error: 'No session found' }));
      return;
    }
    const s = core.automator.status(sessionId);
    if (opts.json) {
      console.log(JSON.stringify(s.recentDiagnosis, null, 2));
    } else {
      if (!s.recentDiagnosis) {
        console.log(chalk.green('No recent diagnosis. Gates are passing.'));
      } else {
        console.log(chalk.red(`Gate: ${s.recentDiagnosis.gateId}`));
        console.log(`Retry level: ${s.recentDiagnosis.retryLevel}`);
        for (const fc of s.recentDiagnosis.failedCriteria) {
          console.log(chalk.bold(`\n  ✗ ${fc.id}`));
          console.log(`    Reason: ${fc.reason}`);
          if (fc.suggestedFix) console.log(`    Fix:    ${fc.suggestedFix}`);
        }
      }
    }
  });

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
program.parseAsync(process.argv).catch((err: Error) => {
  console.error(chalk.red('spec-graph error:'), err.message);
  process.exit(1);
});
