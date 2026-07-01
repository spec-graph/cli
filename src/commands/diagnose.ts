import { Command } from 'commander';
import chalk from 'chalk';
import * as core from '@spec-graph/core';

export function register(program: Command): void {
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
}
