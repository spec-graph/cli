import { Command } from 'commander';
import chalk from 'chalk';
import * as core from '@spec-graph/core';

export function register(program: Command): void {
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
}
