import { Command } from 'commander';
import * as core from '@spec-graph/core';

export function register(program: Command): void {
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
}
