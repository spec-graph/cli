import { Command } from 'commander';
import * as core from '@spec-graph/core';

export function register(program: Command): void {
  program
    .command('check')
    .description('Execute validation checks on artifacts')
    .option('--session <id>', 'session id')
    .option('--json', 'output as JSON')
    .action(async (opts) => {
      const sessionId = opts.session || core.automator.listSessions()[0];
      if (!sessionId) {
        console.log(JSON.stringify({ error: 'No active session' }));
        return;
      }
      const s = core.automator.status(sessionId);
      const stage = s.stage || 'specify';
      const result = core.gateEnforcement.evaluateGate(stage, 'exit', {
        projectRoot: process.cwd(),
        stage,
        artifactFiles: {},
        artifactContents: {},
        traceEdges: {},
      });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        const passed = result.evaluatedCriteria.filter((c) => c.passed).length;
        const total = result.evaluatedCriteria.length;
        console.log(`Checks: ${passed}/${total} passed`);
        for (const c of result.evaluatedCriteria) {
          console.log(`  ${c.passed ? '✓' : '✗'} ${c.criterion.id}`);
        }
      }
    });
}
