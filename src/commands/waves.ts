import { Command } from 'commander';
import * as core from '@spec-graph/core';
import chalk from 'chalk';

export function register(program: Command): void {
  program
    .command('waves')
    .description('Show execution plan (waves of parallel tasks)')
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
      if (!s.intent) { console.log(JSON.stringify({ error: 'No plan found' })); return; }

      // Generate mock waves for display (real waves come from dependency-analyzer)
      const waves = [
        ['user-model', 'books-model'],
        ['auth-endpoints'],
        ['e2e-tests'],
      ];

      if (opts.json) {
        console.log(JSON.stringify({ session: sessionId, stage: s.stage, waves }, null, 2));
      } else {
        console.log(chalk.bold(`Waves for: ${sessionId}`));
        console.log(chalk.gray(`Stage: ${s.stage}`));
        console.log('');
        for (let i = 0; i < waves.length; i++) {
          console.log(chalk.cyan(`Wave ${i + 1} (${waves[i].length} task(s)):`));
          for (const task of waves[i]) {
            console.log(`  - ${task}`);
          }
        }
      }
    });

  program
    .command('integration-status')
    .description('Show integration gate status for parallel execution')
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
      const integrationStatus = {
        session: sessionId,
        stage: s.stage,
        state: s.state,
        waveProgress: 'not started',
        individualGate: 'pending',
        mergeGate: 'pending',
        systemGate: 'pending',
        allPassed: false,
      };

      if (opts.json) {
        console.log(JSON.stringify(integrationStatus, null, 2));
      } else {
        console.log(chalk.bold(`Integration Status: ${sessionId}`));
        console.log('');
        console.log(`Stage:  ${s.stage} (${s.state})`);
        console.log(`Wave:   ${integrationStatus.waveProgress}`);
        console.log(`Level 1 (Individual): ${integrationStatus.individualGate}`);
        console.log(`Level 2 (Merge):      ${integrationStatus.mergeGate}`);
        console.log(`Level 3 (System):     ${integrationStatus.systemGate}`);
        console.log('');
        if (s.blockers.length > 0) {
          console.log(chalk.red(`Blockers: ${s.blockers.join(', ')}`));
        }
      }
    });
}
