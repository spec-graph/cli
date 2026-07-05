import { Command } from 'commander';
import chalk from 'chalk';
import * as path from 'node:path';
import * as core from '@spec-graph/core';

export function register(program: Command): void {
  program
    .command('dispatch')
    .description('Generate routing dispatch manifest for sub-agent execution')
    .option('--session <id>', 'session id')
    .option('--json', 'output as JSON')
    .action(async (opts) => {
      const sessionId = opts.session || core.automator.listSessions()[0];
      if (!sessionId) {
        console.log(JSON.stringify({ error: 'No active session. Run spec-graph plan first.' }));
        return;
      }

      const graphPath = path.join(process.cwd(), '.spec-graph', 'graph.yaml');
      const manifest = core.dispatch.generateDispatchManifest(
        sessionId,
        process.cwd(),
        undefined,
        graphPath
      );

      if (opts.json) {
        console.log(JSON.stringify(manifest, null, 2));
      } else {
        console.log(chalk.bold(`Dispatch Manifest: ${manifest.session_id}`));
        console.log(`  Stage: ${manifest.stage}`);
        console.log(`  Intent: ${manifest.intent}`);
        console.log(`  Done: ${manifest.done}`);
        console.log(`  Actions: ${manifest.actions.length}`);

        if (manifest.actions.length > 0) {
          const groups = new Map<number, typeof manifest.actions>();
          for (const action of manifest.actions) {
            const g = action.parallel_group ?? -1;
            if (!groups.has(g)) groups.set(g, []);
            groups.get(g)!.push(action);
          }

          for (const [group, actions] of groups) {
            const label = group >= 0 ? `Wave ${group}` : 'Action';
            console.log(chalk.cyan(`  ${label}: ${actions.length} action(s)`));
            for (const action of actions) {
              const agent = action.agent.split('/').pop()?.replace('-agent.md', '') || 'unknown';
              console.log(`    - ${action.id} → agent: ${agent}`);
            }
          }
        }
      }
    });
}
