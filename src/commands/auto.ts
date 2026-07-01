import { Command } from 'commander';
import chalk from 'chalk';
import * as core from '@spec-graph/core';

export function register(program: Command): void {
  program
    .command('auto <intent>')
    .description('Run the full automatic workflow')
    .option('--adapter <id>', 'agent adapter to use', 'claude-code')
    .option('--max-retries <n>', 'max retries per stage', '3')
    .action(async (intent, opts) => {
      const plan = core.automator.startSession(intent);
      core.automator.confirmPlan(plan.sessionId, plan);

      console.log(chalk.green(`\n✓ Session: ${plan.sessionId}`));
      console.log(chalk.gray(`  Stage: specify (1/${core.automator.STAGES.length})`));
      console.log(chalk.gray(`  Adapter: ${opts.adapter}`));
      console.log('');

      const maxRetries = parseInt(opts.maxRetries, 10) || 3;
      console.log(chalk.dim('Starting auto loop...'));

      try {
        const finalStatus = await core.automator.autoRun(plan.sessionId, {
          adapterId: opts.adapter,
          maxRetriesPerStage: maxRetries,
          onProgress: (event) => {
            switch (event.type) {
              case 'stage-start':
                console.log(`\n${chalk.bold.cyan('▶ Stage ' + event.stage)}`);
                break;
              case 'agent-called':
                console.log(chalk.dim(`  ↳ ${event.message}`));
                break;
              case 'gate-result':
                if (event.message.includes('passed')) {
                  console.log(chalk.green(`  ✓ ${event.message}`));
                } else {
                  console.log(chalk.yellow(`  ✗ ${event.message}`));
                }
                break;
              case 'retry':
                console.log(chalk.yellow(`  ↻ ${event.message}`));
                break;
              case 'stage-advanced':
                console.log(chalk.green(`  → ${event.message}`));
                break;
              case 'done':
                console.log(chalk.green.bold(`\n🎉 ${event.message}`));
                break;
              case 'error':
                console.log(chalk.red(`\n⚠ ${event.message}`));
                if (event.data) {
                  const diag = event.data as core.automator.Diagnosis;
                  for (const c of diag.failedCriteria) {
                    console.log(chalk.red(`    ✗ ${c.id}: ${c.reason}`));
                    if (c.suggestedFix) console.log(chalk.dim(`      Fix: ${c.suggestedFix}`));
                  }
                }
                break;
            }
          },
        });

        console.log('');
        console.log(chalk.bold('Final:'));
        console.log(`  Stage: ${finalStatus.stage}`);
        console.log(`  State: ${finalStatus.state}`);
        console.log(`  Progress: ${finalStatus.progress.currentStageIndex + 1}/${finalStatus.progress.totalStages}`);
      } catch (err) {
        console.error(chalk.red('Auto loop failed:'), err instanceof Error ? err.message : err);
      }
    });
}
