import { Command } from 'commander';
import * as core from '@spec-graph/core';

export function register(program: Command): void {
  program
    .command('gate')
    .description('Evaluate workflow gate for a stage')
    .option('--stage <stage>', 'stage to evaluate')
    .option('--type <type>', 'entry or exit', 'entry')
    .option('--session <id>', 'session id')
    .option('--json', 'output as JSON')
    .action(async (opts) => {
      const sessionId = opts.session || core.automator.listSessions()[0];
      if (!sessionId) {
        console.log(JSON.stringify({ error: 'No active session' }));
        return;
      }
      const s = core.automator.status(sessionId);
      const stage = opts.stage || s.stage || 'specify';
      const result = core.gateEnforcement.evaluateGate(stage, opts.type, {
        projectRoot: process.cwd(),
        stage,
        artifactFiles: {},
        artifactContents: {},
        traceEdges: {},
      });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Gate ${opts.type} for ${stage}: ${result.passed ? 'PASSED' : 'FAILED'}`);
        for (const c of result.evaluatedCriteria) {
          const id = c.criterion.id;
          const status = c.passed ? '✓' : '✗';
          console.log(`  ${status} ${id}${c.reason ? ': ' + c.reason : ''}`);
        }
      }
    });
}
