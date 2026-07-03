import { Command } from 'commander';
import chalk from 'chalk';
import * as core from '@spec-graph/core';

export function register(program: Command): void {
  program
    .command('machine')
    .description('Direct state machine control')
    .option('--session <id>', 'session id')
    .option('--init-stage <stage>', 'initialize session at specific stage')
    .option('--transition <dir>', 'force transition (next, rollback)')
    .option('--json', 'output as JSON')
    .action(async (opts) => {
      if (opts.initStage) {
        console.log(chalk.green(`Machine initialized at stage: ${opts.initStage}`));
        return;
      }

      const sessions = core.automator.listSessions();
      const sessionId = opts.session || (sessions.length > 0 ? sessions[0] : null);
      if (!sessionId) {
        console.log(JSON.stringify({ error: 'No active session' }));
        return;
      }

      if (opts.transition) {
        const action = opts.transition === 'rollback' ? 'rollback' : 'force-advance';
        const result = core.automator.intervene(sessionId, action);
        if (opts.json) {
          console.log(JSON.stringify(result.newStatus, null, 2));
        } else {
          console.log(`Transitioned to: ${result.newStatus.stage}`);
        }
      } else {
        const s = core.automator.status(sessionId);
        if (opts.json) {
          console.log(JSON.stringify(s, null, 2));
        } else {
          const currentStage = s.stage || 'unknown';
          console.log(chalk.bold(`Machine State: ${currentStage}`));
          console.log(`  State: ${s.state}`);
          console.log(`  Stages: ${core.automator.STAGES.join(' → ')}`);
          console.log(`  Current index: ${core.automator.STAGES.indexOf(currentStage as core.Stage)}`);
        }
      }
    });
}
