import { Command } from 'commander';
import chalk from 'chalk';
import * as core from '@spec-graph/core';

export function register(program: Command): void {
  program
    .command('plan <intent>')
    .description('Transform user intent into a structured plan')
    .option('--json', 'output plan as JSON')
    .option('--confirm', 'auto-confirm the generated plan')
    .action(async (intent, opts) => {
      const plan = core.automator.startSession(intent);
      if (opts.confirm) {
        core.automator.confirmPlan(plan.sessionId, plan);
      }
      if (opts.json) {
        console.log(JSON.stringify({ confirmed: !!opts.confirm, ...plan }, null, 2));
      } else {
        console.log(chalk.bold(`\nPlan: "${plan.intent}"`));
        console.log(chalk.gray(`Session:    ${plan.sessionId}`));
        console.log(chalk.gray(`Complexity: ${plan.complexity}`));
        console.log('');
        console.log(chalk.bold('Capabilities:'));
        for (const cap of plan.capabilities) {
          const deps = cap.dependsOn.length > 0
            ? chalk.gray(` (depends on: ${cap.dependsOn.join(', ')})`)
            : '';
          console.log(`  - ${cap.id}${deps}`);
        }
        if (plan.risks.length > 0) {
          console.log('');
          console.log(chalk.bold('Risks:'));
          for (const r of plan.risks) console.log(`  - ${r}`);
        }
        console.log('');
        if (!opts.confirm) {
          console.log(chalk.yellow('⚠ Plan not yet confirmed.'));
          console.log(`Run ${chalk.cyan(`spec-graph plan "${intent}" --confirm`)} to confirm.`);
        } else {
          console.log(chalk.green('✓ Plan confirmed. Ready!'));
          console.log(`Run: ${chalk.cyan('spec-graph dispatch --session ' + plan.sessionId + ' --json')}`);
        }
      }
    });
}
