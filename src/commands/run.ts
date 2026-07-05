import { Command } from 'commander';
import chalk from 'chalk';
import * as core from '@spec-graph/core';

export function register(program: Command): void {
  program
    .command('run')
    .description('Run or continue a session (auto-selects latest running session if no ID given)')
    .option('--session <id>', 'session ID to run (defaults to latest running session)')
    .option('--auto-next', 'automatically start the next runnable task if no task is running')
    .option('--json', 'output as JSON')
    .action(async (opts) => {
      const root = process.cwd();
      let sessionId = opts.session;

      // If no session specified, find the latest running session.
      if (!sessionId) {
        sessionId = core.automator.getLatestRunningSession(root);
        if (!sessionId) {
          const msg = 'No session specified and no running sessions found. Use `spec-graph plan "<intent>"` to start a new session.';
          if (opts.json) console.log(JSON.stringify({ error: msg }));
          else console.log(chalk.red(msg));
          return;
        }
        if (!opts.json) {
          console.log(chalk.gray(`Auto-selected latest running session: ${sessionId}`));
        }
      }

      const status = core.automator.status(sessionId, root);
      if (!status.sessionId) {
        const msg = `Session '${sessionId}' not found`;
        if (opts.json) console.log(JSON.stringify({ error: msg }));
        else console.log(chalk.red(msg));
        return;
      }

      const row = core.sessionIndex.get(root, sessionId);

      // Determine what to resume.
      let resumeTask: string | null = null;
      let action = 'info'; // 'info' | 'resume' | 'start-next'
      if (row) {
        if (row.running_tasks.length > 0) {
          resumeTask = row.running_tasks[0];
          action = 'resume';
        } else if (row.runnable_tasks.length > 0) {
          resumeTask = row.runnable_tasks[0];
          action = 'start-next';
        }
      }

      // Auto-start the next task if --auto-next is set.
      if (opts.autoNext && action === 'start-next' && resumeTask) {
        try {
          core.automator.startTask(sessionId, resumeTask, root);
          action = 'resume';
          if (!opts.json) {
            console.log(chalk.cyan(`→ Auto-started task: ${resumeTask}`));
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (opts.json) console.log(JSON.stringify({ error: msg }));
          else console.log(chalk.red(`Failed to start task: ${msg}`));
          return;
        }
      }

      if (opts.json) {
        console.log(JSON.stringify({
          sessionId: status.sessionId,
          intent: status.intent,
          stage: status.stage,
          state: status.state,
          progress: status.progress,
          blockers: status.blockers,
          resumeTask,
          action,
          taskStatus: row ? {
            completed: row.completed_tasks,
            running: row.running_tasks,
            runnable: row.runnable_tasks,
            pending: row.pending_tasks,
          } : null,
        }, null, 2));
      } else {
        console.log(chalk.bold(`\nSession: ${status.sessionId}`));
        console.log(`Intent:   ${status.intent}`);
        console.log(`Stage:    ${status.stage} (${status.state})`);
        console.log(`Progress: ${status.progress.currentStageIndex + 1}/${status.progress.totalStages}`);

        if (status.blockers.length > 0) {
          console.log(chalk.red(`\nBlockers:`));
          for (const b of status.blockers) console.log(`  - ${b}`);
          return;
        }

        if (status.state === 'completed') {
          console.log(chalk.green('\n✓ Session already completed'));
          return;
        }

        // Show what to resume.
        if (resumeTask) {
          if (action === 'resume') {
            console.log(chalk.cyan(`\n▶ Resume task: ${chalk.bold(resumeTask)}`));
            console.log(chalk.gray('  Continue executing this task.'));
          } else if (action === 'start-next') {
            console.log(chalk.yellow(`\n→ Next task: ${chalk.bold(resumeTask)}`));
            console.log(chalk.gray(`  Run: ${chalk.cyan(`spec-graph task start ${resumeTask} --session ${sessionId}`)}`));
            console.log(chalk.gray(`  Or:  ${chalk.cyan(`spec-graph run --session ${sessionId} --auto-next`)}`));
          }
        } else if (row && row.pending_tasks.length > 0) {
          console.log(chalk.gray('\n○ No runnable tasks yet (dependencies pending)'));
        }

        // Show full task status.
        if (row && (row.completed_tasks.length > 0 || row.running_tasks.length > 0 || row.runnable_tasks.length > 0 || row.pending_tasks.length > 0)) {
          console.log(chalk.bold('\nTask status:'));
          if (row.completed_tasks.length > 0) {
            console.log(chalk.green(`  ✓ Completed (${row.completed_tasks.length}): ${row.completed_tasks.join(', ')}`));
          }
          if (row.running_tasks.length > 0) {
            console.log(chalk.cyan(`  ▶ Running (${row.running_tasks.length}): ${row.running_tasks.join(', ')}`));
          }
          if (row.runnable_tasks.length > 0) {
            console.log(chalk.yellow(`  → Runnable (${row.runnable_tasks.length}): ${row.runnable_tasks.join(', ')}`));
          }
          if (row.pending_tasks.length > 0) {
            console.log(chalk.gray(`  ○ Pending (${row.pending_tasks.length})`));
          }
        }

        // Show next steps.
        console.log(chalk.cyan('\nNext steps:'));
        if (status.stage === 'specify' && status.state === 'paused') {
          console.log(`  1. Review the plan: ${chalk.gray('spec-graph status --session ' + sessionId)}`);
          console.log(`  2. Confirm the plan: ${chalk.gray('spec-graph confirm --session ' + sessionId)}`);
        } else if (resumeTask && action === 'resume') {
          console.log(`  Dispatch sub-agent for task: ${chalk.gray('spec-graph dispatch --session ' + sessionId + ' --task ' + resumeTask + ' --json')}`);
          console.log(`  When task completes: ${chalk.gray('spec-graph task complete ' + resumeTask + ' --session ' + sessionId)}`);
        } else {
          console.log(`  Generate dispatch manifest: ${chalk.gray('spec-graph dispatch --session ' + sessionId + ' --json')}`);
        }
      }
    });
}
