import { Command } from 'commander';
import chalk from 'chalk';
import * as core from '@spec-graph/core';

export function register(program: Command): void {
  program
    .command('config')
    .description('Manage project-level config')
    .option('--json', 'output as JSON')
    .action(async (opts) => {
      const profile = core.sense.sense(process.cwd());
      if (opts.json) {
        console.log(JSON.stringify(profile, null, 2));
      } else {
        console.log(chalk.bold('Project Configuration'));
        console.log(`  language: ${profile.language || 'unknown'}`);
        console.log(`  framework: ${profile.framework || 'none'}`);
        console.log(`  buildTool: ${profile.buildTool || 'unknown'}`);
        console.log(`  testFramework: ${profile.testFramework || 'none'}`);
        console.log(`  brownfield: ${profile.brownfield}`);
      }
    });
}
