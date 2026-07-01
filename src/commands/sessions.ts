import { Command } from 'commander';
import chalk from 'chalk';
import * as core from '@spec-graph/core';

export function register(program: Command): void {
  program
    .command('sessions')
    .alias('session')
    .description('Manage active sessions (list, switch, delete)')
    .option('--action <action>', 'list | info <id> | delete <id>', 'list')
    .option('--session <id>', 'session id for info/delete')
    .option('--json', 'output as JSON')
    .action(async (opts) => {
      const action = opts.action || 'list';
      const sessions = core.automator.listSessions();

      switch (action) {
        case 'list': {
          if (sessions.length === 0) {
            console.log(chalk.yellow('No active sessions.'));
            console.log(`Run ${chalk.cyan('spec-graph plan "<intent>"')} to start.`);
            return;
          }
          if (opts.json) {
            const results = sessions.map((id) => ({
              id,
              ...core.automator.status(id),
            }));
            console.log(JSON.stringify(results, null, 2));
          } else {
            console.log(chalk.bold(`Active sessions (${sessions.length}):`));
            console.log('');
            for (const id of sessions) {
              const s = core.automator.status(id);
              const icon = s.state === 'completed' ? '✓' :
                           s.state === 'running' ? '▶' :
                           s.state === 'paused' ? '⏸' :
                           s.state === 'failed' ? '✗' : '·';
              console.log(
                `  ${chalk.cyan(icon)} ${chalk.bold(id)}  ${chalk.gray('·')}  ${s.stage ?? '(none)'}  ${chalk.gray('·')}  ${s.progress.currentStageIndex + 1}/${s.progress.totalStages}`
              );
            }
          }
          break;
        }

        case 'info': {
          const id = opts.session || (sessions.length > 0 ? sessions[0] : null);
          if (!id) {
            console.log(JSON.stringify({ error: 'No session specified' }));
            return;
          }
          const s = core.automator.status(id);
          if (opts.json) {
            console.log(JSON.stringify(s, null, 2));
          } else {
            console.log(chalk.bold(`\nSession: ${s.sessionId}`));
            console.log(`Intent:   ${s.intent}`);
            console.log(`Stage:    ${s.stage} (${s.state})`);
            console.log(`Progress: ${s.progress.currentStageIndex + 1}/${s.progress.totalStages}`);
            console.log(`Artifacts: ${s.progress.completedArtifacts}`);
            if (s.blockers.length > 0) {
              console.log(chalk.red(`Blockers: ${s.blockers.join(', ')}`));
            }
          }
          break;
        }

        case 'delete': {
          const id = opts.session;
          if (!id) {
            console.log(JSON.stringify({ error: 'No session specified. Use --session <id>' }));
            return;
          }
          if (!sessions.includes(id as string)) {
            console.log(JSON.stringify({ error: `Session '${id}' not found` }));
            return;
          }
          const fs = await import('node:fs');
          const path = await import('node:path');
          const dir = path.join('.spec-graph', 'sessions', id as string);
          fs.rmSync(dir, { recursive: true, force: true });
          console.log(chalk.green(`✓ Deleted session: ${id}`));
          break;
        }

        default:
          console.log(chalk.red(`Unknown action: ${action}. Use: list | info | delete`));
      }
    });
}
