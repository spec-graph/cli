import { Command } from 'commander';
import * as fs from 'node:fs';
import * as core from '@spec-graph/core';

export function register(program: Command): void {
  program
    .command('submit')
    .description('Submit agent result for gate evaluation')
    .option('--result <json>', 'agent result as JSON inline')
    .option('--result-file <path>', 'read agent result from file (avoids shell escaping)')
    .option('--session <id>', 'session id')
    .action(async (opts) => {
      const sessions = core.automator.listSessions();
      const sessionId = opts.session || (sessions.length > 0 ? sessions[0] : null);
      if (!sessionId) {
        console.log(JSON.stringify({ error: 'No session found' }));
        return;
      }

      let result: core.AgentResult;
      const source = opts.resultFile
        ? fs.readFileSync(opts.resultFile, 'utf-8')
        : opts.result;

      try {
        result = source
          ? JSON.parse(source)
          : { artifacts: [], selfCheck: { acceptanceCriteriaMet: true } };
      } catch {
        result = { artifacts: [] };
      }

      const submitResult = core.automator.submitResult(sessionId, result);
      console.log(JSON.stringify(submitResult, null, 2));
    });
}
