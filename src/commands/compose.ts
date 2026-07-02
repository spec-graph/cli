import { Command } from 'commander';
import chalk from 'chalk';
import * as core from '@spec-graph/core';
import * as path from 'node:path';
import * as fs from 'node:fs';

export function register(program: Command): void {
  program
    .command('compose')
    .description('Compose workflow graph from profile and packs')
    .option('--packs-dir <dir>', 'directory containing *.pack subdirectories')
    .option('--output <path>', 'output path for graph.yaml (default: .spec-graph/graph.yaml)')
    .option('--json', 'output as JSON')
    .action(async (opts) => {
      const projectRoot = process.cwd();
      const packsDir = opts.packsDir || findPacksDir();
      const outputPath = opts.output || path.join(projectRoot, '.spec-graph', 'graph.yaml');

      // Get profile facts from sense module
      const profile = core.sense.sense(projectRoot);
      const profileFacts = profileToFactMap(profile);

      // Compose
      const graph = core.composer.composeToFile(
        { packsDir, profileFacts },
        outputPath
      );

      if (opts.json) {
        console.log(JSON.stringify(graph, null, 2));
      } else {
        console.log(chalk.bold('Graph Composed'));
        console.log(`  Packs used: ${graph.meta.packs_used.length}`);
        for (const p of graph.meta.packs_used) {
          console.log(`    - ${p.name} (priority: ${p.priority})`);
        }
        console.log(`  Agents: ${graph.agents.length}`);
        console.log(`  Bindings: ${graph.agent_bindings.length}`);
        console.log(`  Gates: ${graph.gates.length}`);
        console.log(`  Checks: ${graph.checks.length}`);
        console.log(`  Artifacts: ${graph.artifacts.length}`);
        console.log(`  Meetings: ${graph.meetings.length}`);
        console.log(`  Pipeline stages: ${graph.pipeline_skeleton.stages.join(' → ')}`);
        console.log(`  Written to: ${outputPath}`);
      }
    });
}

function findPacksDir(): string {
  const candidates = [
    path.join(__dirname, '..', '..', '..', '..', 'packages', 'core', 'packs'),
    path.join(process.cwd(), 'packages', 'core', 'packs'),
    path.join(process.cwd(), 'node_modules', '@spec-graph', 'core', 'packs'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return candidates[0];
}

function profileToFactMap(profile: ReturnType<typeof core.sense.sense>): Record<string, { value: string }> {
  const facts: Record<string, { value: string }> = {};
  if (profile.language) facts.language = { value: profile.language };
  if (profile.framework) facts.framework = { value: profile.framework };
  if (profile.runtime) facts.runtime = { value: profile.runtime };
  if (profile.testFramework) facts.test_framework = { value: profile.testFramework };
  if (profile.buildTool) facts.build_tool = { value: profile.buildTool };
  // Detect UI framework as has_ui fact
  if (profile.framework && /react|vue|angular|svelte/i.test(profile.framework)) {
    facts.has_ui = { value: profile.framework };
  }
  return facts;
}
