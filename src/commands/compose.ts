import { Command } from 'commander';
import * as core from '@spec-graph/core';

export function register(program: Command): void {
  program
    .command('compose')
    .description('Compose workflow graph from profile and packs')
    .option('--change-type <type>', 'type of change (feature, bugfix, refactor)')
    .option('--json', 'output as JSON')
    .action(async (opts) => {
      const kb = core.knowledgeBase.loadKnowledgeBase();
      if (opts.json) {
        console.log(JSON.stringify({ stages: kb.stages, skills: kb.skills.size }, null, 2));
      } else {
        console.log(`Graph composed: ${kb.stages.length} stages`);
        for (const stageId of kb.stages) {
          const skills = core.knowledgeBase.getSkillsForStage(kb, stageId);
          console.log(`  ${stageId}: ${skills.length} skills`);
        }
      }
    });
}
