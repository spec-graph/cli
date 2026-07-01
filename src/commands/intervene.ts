import { Command } from 'commander';
import * as core from '@spec-graph/core';

export function register(program: Command): void {
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
}
