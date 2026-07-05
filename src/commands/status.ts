import { Command } from 'commander';
import chalk from 'chalk';
import * as core from '@spec-graph/core';

export function register(program: Command): void {
  program
    .command('status')
    .description('Show current workflow state')
    .option('--json', 'output as JSON')
    .option('--compact', 'output compressed view (~300 tokens)')
    .option('--session <id>', 'session id')
    .action(async (opts) => {
      const sessions = core.automator.listSessions();
      const sessionId = opts.session || (sessions.length > 0 ? sessions[0] : undefined);
      const s = core.automator.status(sessionId);

      if (opts.compact) {
        // Compressed view for context management
        if (!s.sessionId || !s.state) {
          console.log('No active session.');
          return;
        }

        const data = core.automator.getSessionData(s.sessionId, process.cwd());
        if (!data) {
          console.log('No active session.');
          return;
        }

        // Get task lists from CSV
        const csvRow = core.sessionIndex.get(process.cwd(), s.sessionId);
        const completed = csvRow?.completed_tasks?.split(',').filter(Boolean) || [];
        const running = csvRow?.running_tasks?.split(',').filter(Boolean) || [];
        const reviewing = csvRow?.reviewing_tasks?.split(',').filter(Boolean) || [];
        const pending = csvRow?.pending_tasks?.split(',').filter(Boolean) || [];
        const runnable = csvRow?.runnable_tasks?.split(',').filter(Boolean) || [];

        const totalTasks = data.plan?.order?.length || 0;

        let output = `Session: ${s.sessionId}\n`;
        output += `Stage: ${s.stage} (${completed.length}/${totalTasks} tasks done)\n\n`;

        // Completed tasks (compressed)
        if (completed.length > 0) {
          output += `Completed:\n`;
          for (const taskId of completed) {
            const review = data.taskReviews?.[taskId];
            const checks = review?.checks.length || 0;
            const passed = review?.passed ? '✓' : '✗';
            output += `  ${passed} ${taskId} (${checks} checks)\n`;
          }
          output += `\n`;
        }

        // Current task
        if (running.length > 0) {
          output += `Current: ${running[0]} (running)\n`;
        } else if (reviewing.length > 0) {
          output += `Current: ${reviewing[0]} (reviewing)\n`;
        }

        // Next task
        if (runnable.length > 0) {
          output += `Next: ${runnable[0]} (pending)\n`;
        } else if (pending.length > 0 && running.length === 0 && reviewing.length === 0) {
          output += `Next: ${pending[0]} (pending)\n`;
        }

        // Blockers
        if (s.blockers.length > 0) {
          output += `\nBlockers:\n`;
          for (const b of s.blockers) {
            output += `  ⚠ ${b}\n`;
          }
        }

        console.log(output.trim());
        return;
      }

      // Full output (existing behavior)
      if (opts.json) {
        console.log(JSON.stringify(s, null, 2));
      } else {
        if (!s.sessionId || !s.state) {
          console.log(chalk.yellow('No active session.'));
          console.log(`Run ${chalk.cyan('spec-graph start "<intent>"')} to create one.`);
          return;
        }
        console.log(chalk.bold(`Session:  ${s.sessionId}`));
        console.log(`Intent:   ${s.intent}`);
        console.log(`Stage:    ${s.stage} (${s.state})`);
        console.log(`Progress: ${s.progress.currentStageIndex + 1}/${s.progress.totalStages} stages`);
        console.log(`Artifacts: ${s.progress.completedArtifacts}`);
        if (s.blockers.length > 0) {
          console.log(chalk.red(`Blockers: ${s.blockers.join(', ')}`));
        }
        if (s.recentDiagnosis) {
          console.log(chalk.yellow('\nRecent diagnosis:'));
          for (const fc of s.recentDiagnosis.failedCriteria) {
            console.log(`  ✗ ${fc.id}: ${fc.reason}`);
          }
        }
        // Tell agent what to do next
        console.log('');
        if (s.state === 'paused') {
          console.log(chalk.cyan(`Next: spec-graph confirm ${s.sessionId}`));
        } else if (s.state === 'running') {
          console.log(chalk.cyan(`Next: spec-graph dispatch --json`));
          console.log(chalk.gray(`  Or: spec-graph submit --session ${s.sessionId} --stage`));
        } else if (s.state === 'completed') {
          console.log(chalk.green('Done. readyForArchive = true'));
        }
      }
    });
}
