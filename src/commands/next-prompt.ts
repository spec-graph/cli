import { Command } from 'commander';
import * as core from '@spec-graph/core';

export function register(program: Command): void {
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
}
