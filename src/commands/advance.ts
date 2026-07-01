import { Command } from 'commander';
import * as core from '@spec-graph/core';

export function register(program: Command): void {
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
}
