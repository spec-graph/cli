import { Command } from 'commander';
import chalk from 'chalk';
import * as core from '@spec-graph/core';

export function register(program: Command): void {
  program
    .command('artifact-complete')
    .description('Mark an artifact as completed in machine-state')
    .argument('<artifact-id>', 'artifact id (e.g., specify/proposal.md)')
    .option('--status <status>', 'status: pending | in_progress | completed | failed', 'completed')
    .option('--path <path>', 'path to the artifact file')
    .option('--producer <producer>', 'who produced this artifact')
    .option('--json', 'output as JSON')
    .action(async (artifactId, opts) => {
      const status = opts.status as 'pending' | 'in_progress' | 'completed' | 'failed';
      const validStatuses = ['pending', 'in_progress', 'completed', 'failed'];
      if (!validStatuses.includes(status)) {
        console.error(chalk.red(`Invalid status: ${status}. Must be one of: ${validStatuses.join(', ')}`));
        process.exit(1);
      }

      const details: Record<string, any> = {};
      if (opts.path) details.path = opts.path;
      if (opts.producer) details.producer = opts.producer;

      core.machineState.trackArtifact(artifactId, status, details);

      if (opts.json) {
        const state = core.machineState.getMachineState();
        const record = state.artifacts[artifactId];
        console.log(JSON.stringify({ artifactId, ...record }, null, 2));
      } else {
        console.log(chalk.green(`Artifact tracked: ${artifactId} → ${status}`));
      }
    });
}
