import { Command } from 'commander';
import chalk from 'chalk';
import * as core from '@spec-graph/core';

/**
 * spec-graph start — one-shot command to go from intent to dispatch-ready session.
 *
 * Flow:
 *   1. Generate capabilities from intent (keyword matching fallback)
 *   2. Create session with plan
 *   3. Confirm plan
 *   4. Return session_id ready for dispatch
 *
 * This avoids the 3-step plan → manifest → confirm flow.
 * Use `spec-graph plan` only when you want to inspect/modify the plan before creating a session.
 */
export function register(program: Command): void {
  program
    .command('start <intent>')
    .description('One-shot: create session + plan + confirm, ready for dispatch')
    .option('--json', 'output as JSON')
    .option('--session <id>', 'custom session id (auto-generated from intent if omitted)')
    .action(async (intent, opts) => {
      try {
        // 1. Generate capabilities (fallback keyword matching)
        const planOutput = core.planning.generatePlan({ intent, profile: {} });

        const sessionId = opts.session ||
          intent.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64);

        const plan = {
          sessionId,
          intent,
          capabilities: planOutput.capabilities,
          order: planOutput.order,
          complexity: planOutput.complexity,
          risks: planOutput.risks,
          openQuestions: planOutput.openQuestions,
        };

        // 2. Check if session already exists
        const sessions = core.automator.listSessions();
        if (sessions.includes(sessionId)) {
          const msg = `Session already exists: ${sessionId}. Use sessions delete first or --session to specify a different id.`;
          if (opts.json) {
            console.log(JSON.stringify({ error: msg }));
          } else {
            console.error(chalk.red(msg));
          }
          process.exit(1);
        }

        // 3. Create session
        core.automator.startSession(intent);

        // 4. Override with structured plan (via intervene modify-plan)
        try {
          core.automator.intervene(sessionId, 'modify-plan', plan);
        } catch {
          // startSession already created a draft, plan may be the same
        }

        // 5. Confirm
        core.automator.confirmPlan(sessionId, plan);

        // 6. Return session info
        const status = core.automator.status(sessionId);

        if (opts.json) {
          console.log(JSON.stringify({
            sessionId,
            intent,
            state: status.state,
            stage: status.stage,
            capabilities: plan.capabilities.length,
            order: plan.order,
            complexity: plan.complexity,
            risks: plan.risks,
          }, null, 2));
        } else {
          console.log(chalk.green('✓ Session ready for dispatch'));
          console.log(chalk.gray(`  Session: ${sessionId}`));
          console.log(chalk.gray(`  Stage:   ${status.stage}`));
          console.log(chalk.gray(`  State:   ${status.state}`));
          console.log(chalk.gray(`  Caps:    ${plan.capabilities.length}`));
          for (const cap of plan.capabilities) {
            const deps = cap.dependsOn.length > 0 ? ` (depends on: ${cap.dependsOn.join(', ')})` : '';
            console.log(chalk.gray(`    - ${cap.id}${deps}`));
          }
          console.log('');
          console.log(chalk.cyan('Next: spec-graph dispatch --session ' + sessionId + ' --json'));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (opts.json) {
          console.log(JSON.stringify({ error: msg }));
        } else {
          console.error(chalk.red(`Failed to start session: ${msg}`));
        }
        process.exit(1);
      }
    });
}
