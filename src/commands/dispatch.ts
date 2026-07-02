import { Command } from 'commander';
import * as core from '@spec-graph/core';

export function register(program: Command): void {
  program
    .command('dispatch')
    .description('Generate agent dispatch manifest')
    .option('--session <id>', 'session id')
    .option('--json', 'output as JSON')
    .action(async (opts) => {
      const sessionId = opts.session || core.automator.listSessions()[0];
      if (!sessionId) {
        console.log(JSON.stringify({ error: 'No active session. Run spec-graph plan first.' }));
        return;
      }
      const prompt = core.automator.nextPrompt(sessionId);
      if (opts.json) {
        console.log(JSON.stringify(prompt, null, 2));
      } else {
        console.log(`Stage: ${prompt.stage}`);
        console.log(`Session: ${prompt.sessionId}`);
        console.log(prompt.xml.slice(0, 500) + (prompt.xml.length > 500 ? '...' : ''));
      }
    });
}
