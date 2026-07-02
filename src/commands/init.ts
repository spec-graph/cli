import { Command } from 'commander';
import * as core from '@spec-graph/core';

export function register(program: Command): void {
  program
    .command('init')
    .description('Initialize a new spec-graph project')
    .option('--force', 'overwrite existing .spec-graph directory')
    .option('--stack <stack>', 'tech stack (e.g., typescript, python)')
    .option('--json', 'output as JSON')
    .action(async (opts) => {
      const profile = core.sense.sense(process.cwd());
      const kb = core.knowledgeBase.loadKnowledgeBase();
      if (opts.json) {
        console.log(JSON.stringify({ profile, stages: kb.stages }, null, 2));
      } else {
        console.log('spec-graph initialized');
        console.log(`Stages: ${kb.stages.join(', ')}`);
        console.log(`Skills loaded: ${kb.skills.size}`);
        console.log(`Profile: ${profile.language || 'unknown'} / ${profile.framework || 'no framework'}`);
      }
    });
}
