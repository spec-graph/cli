import { Command } from 'commander';
import chalk from 'chalk';
import * as path from 'node:path';
import * as core from '@spec-graph/core';

export function register(program: Command): void {
  program
    .command('dispatch')
    .description('Generate agent dispatch manifest (consumed by dispatch-watcher hook)')
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
        undefined,  // packsDir — fallback, graph.yaml is primary
        graphPath   // graphPath — uses composed graph
      );

      if (opts.json) {
        console.log(JSON.stringify(manifest, null, 2));
      } else {
        // Human-readable summary
        console.log(chalk.bold(`Dispatch Manifest: ${manifest.session_id}`));
        console.log(`  Stage: ${manifest.current_stage}`);
        console.log(`  Gate: ${manifest.gate_passed ? chalk.green('passed') : chalk.red('blocked')}`);
        console.log(`  Done: ${manifest.done}`);
        console.log(`  Actions: ${manifest.actions.length}`);

        if (manifest.actions.length > 0) {
          // Group by parallel_group
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
              const agent = action.agent_id || 'self';
              const tier = action.model_tier || 'default';
              console.log(`    - ${action.id} (${action.type}) → agent: ${agent}, tier: ${tier}`);
            }
          }
        }

        if (manifest.missing_artifacts.length > 0) {
          console.log(chalk.yellow(`  Missing artifacts: ${manifest.missing_artifacts.join(', ')}`));
        }
        if (manifest.failed_checks.length > 0) {
          console.log(chalk.red(`  Failed checks: ${manifest.failed_checks.join(', ')}`));
        }
      }
    });
}
