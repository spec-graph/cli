import { Command } from 'commander';
import chalk from 'chalk';
import * as core from '@spec-graph/core';

export function register(program: Command): void {
  program
    .command('plan <intent>')
    .description('Generate planning manifest for LLM-based planning, or fallback to keyword matching')
    .option('--json', 'output as JSON')
    .option('--confirm', 'auto-confirm the plan (only with --fallback)')
    .option('--fallback', 'use local keyword matching instead of LLM dispatch')
    .action(async (intent, opts) => {
      if (opts.fallback) {
        // Fallback mode: keyword matching (offline-capable)
        const plan = core.planning.generatePlanFallback({ intent });
        if (opts.confirm) {
          core.automator.startSession(intent);
          core.automator.confirmPlan(plan.sessionId, plan);
        }
        if (opts.json) {
          console.log(JSON.stringify({ mode: 'fallback', confirmed: !!opts.confirm, ...plan }, null, 2));
        } else {
          printPlanHumanReadable(plan, intent, !!opts.confirm);
        }
      } else {
        // LLM mode: generate planning manifest
        const manifest = core.planning.generatePlanningManifest({ intent });
        if (opts.json) {
          console.log(JSON.stringify(manifest, null, 2));
        } else {
          console.log(chalk.bold('\nPlanning Manifest'));
          console.log(chalk.gray(`Intent:   ${manifest.intent}`));
          console.log(chalk.gray(`Agent:    ${manifest.agent_config.agent_id}`));
          console.log(chalk.gray(`Model:    ${manifest.agent_config.model_tier}`));
          console.log('');
          console.log(chalk.bold('Next steps:'));
          console.log(`  1. Dispatch planning agent with the prompt above`);
          console.log(`  2. Agent returns JSON conforming to the schema`);
          console.log(`  3. Validate with: ${chalk.cyan('spec-graph validate-plan < json')}`);
          console.log(`  4. Confirm: ${chalk.cyan(manifest.next_step)}`);
          console.log('');
          console.log(chalk.yellow('⚠ Use --fallback for offline keyword matching (no LLM needed)'));
        }
      }
    });
}

function printPlanHumanReadable(
  plan: { sessionId: string; intent: string; complexity: string; capabilities: any[]; risks: string[] },
  intent: string,
  confirmed: boolean
): void {
  console.log(chalk.bold(`\nPlan: "${plan.intent}"`));
  console.log(chalk.gray(`Session:    ${plan.sessionId}`));
  console.log(chalk.gray(`Complexity: ${plan.complexity}`));
  console.log(chalk.gray(`Mode:       fallback (keyword matching)`));
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
  if (!confirmed) {
    console.log(chalk.yellow('⚠ Plan not yet confirmed.'));
    console.log(`Run ${chalk.cyan(`spec-graph plan "${intent}" --fallback --confirm`)} to confirm.`);
  } else {
    console.log(chalk.green('✓ Plan confirmed. Ready!'));
    console.log(`Run: ${chalk.cyan('spec-graph dispatch --session ' + plan.sessionId + ' --json')}`);
  }
}
