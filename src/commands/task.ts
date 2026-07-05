import { Command } from 'commander';
import chalk from 'chalk';
import * as core from '@spec-graph/core';

export function registerProgram(program: Command): void {
  const task = program
    .command('task')
    .description('Manage tasks within a session');

  task
    .command('review <task-id>')
    .description('Review a task before completion (runs quality checks)')
    .option('--session <id>', 'session ID (defaults to latest running session)')
    .option('--json', 'output as JSON')
    .action(async (taskId, opts) => {
      const root = process.cwd();
      const sessionId = opts.session || core.automator.getLatestRunningSession(root);
      if (!sessionId) {
        const msg = 'No session specified and no running sessions found';
        if (opts.json) console.log(JSON.stringify({ error: msg }));
        else console.log(chalk.red(msg));
        return;
      }
      if (!opts.session && !opts.json) {
        console.log(chalk.gray(`Auto-selected session: ${sessionId}`));
      }
      try {
        const result = core.automator.reviewTask(sessionId, taskId, root);
        if (opts.json) {
          console.log(JSON.stringify({ success: true, taskId, sessionId, ...result }));
        } else {
          console.log(chalk.bold(`\nReview for task: ${taskId}`));
          for (const check of result.checks) {
            console.log(`  ${check}`);
          }
          if (result.passed) {
            console.log(chalk.green(`\n✓ ${result.message}`));
            console.log(chalk.gray(`  Run: ${chalk.cyan(`spec-graph task complete ${taskId} --session ${sessionId}`)}`));
          } else {
            console.log(chalk.red(`\n✗ ${result.message}`));
            console.log(chalk.gray(`  Fix issues and re-run: ${chalk.cyan(`spec-graph task review ${taskId} --session ${sessionId}`)}`));
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (opts.json) console.log(JSON.stringify({ error: msg }));
        else console.log(chalk.red(msg));
      }
    });

  task
    .command('complete <task-id>')
    .description('Mark a task as completed (requires review to pass first)')
    .option('--session <id>', 'session ID (defaults to latest running session)')
    .option('--json', 'output as JSON')
    .action(async (taskId, opts) => {
      const root = process.cwd();
      const sessionId = opts.session || core.automator.getLatestRunningSession(root);
      if (!sessionId) {
        const msg = 'No session specified and no running sessions found';
        if (opts.json) console.log(JSON.stringify({ error: msg }));
        else console.log(chalk.red(msg));
        return;
      }
      if (!opts.session && !opts.json) {
        console.log(chalk.gray(`Auto-selected session: ${sessionId}`));
      }
      try {
        const result = core.automator.completeTask(sessionId, taskId, root);
        if (opts.json) {
          console.log(JSON.stringify({ success: true, taskId, nextTask: result.nextTask, sessionId }));
        } else {
          console.log(chalk.green(`✓ Task '${taskId}' completed (session: ${sessionId})`));
          if (result.nextTask) {
            console.log(chalk.cyan(`→ Next runnable task: ${result.nextTask}`));
            console.log(chalk.gray(`  Run: ${chalk.cyan(`spec-graph task start ${result.nextTask} --session ${sessionId}`)}`));
          } else {
            console.log(chalk.gray('No more runnable tasks (all dependencies pending)'));
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (opts.json) console.log(JSON.stringify({ error: msg }));
        else console.log(chalk.red(msg));
      }
    });

  task
    .command('start <task-id>')
    .description('Mark a task as running')
    .option('--session <id>', 'session ID (defaults to latest running session)')
    .option('--json', 'output as JSON')
    .action(async (taskId, opts) => {
      const root = process.cwd();
      const sessionId = opts.session || core.automator.getLatestRunningSession(root);
      if (!sessionId) {
        const msg = 'No session specified and no running sessions found';
        if (opts.json) console.log(JSON.stringify({ error: msg }));
        else console.log(chalk.red(msg));
        return;
      }
      if (!opts.session && !opts.json) {
        console.log(chalk.gray(`Auto-selected session: ${sessionId}`));
      }
      try {
        core.automator.startTask(sessionId, taskId, root);
        if (opts.json) {
          console.log(JSON.stringify({ success: true, taskId, status: 'running', sessionId }));
        } else {
          console.log(chalk.green(`✓ Task '${taskId}' marked as running (session: ${sessionId})`));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (opts.json) console.log(JSON.stringify({ error: msg }));
        else console.log(chalk.red(msg));
      }
    });

  task
    .command('list')
    .description('List tasks and their status')
    .option('--session <id>', 'session ID (defaults to latest running session)')
    .option('--json', 'output as JSON')
    .action(async (opts) => {
      const root = process.cwd();
      const sessionId = opts.session || core.automator.getLatestRunningSession(root);
      if (!sessionId) {
        const msg = 'No session specified and no running sessions found';
        if (opts.json) console.log(JSON.stringify({ error: msg }));
        else console.log(chalk.red(msg));
        return;
      }
      if (!opts.session && !opts.json) {
        console.log(chalk.gray(`Auto-selected session: ${sessionId}`));
      }
      const status = core.automator.status(sessionId, root);
      const row = core.sessionIndex.get(root, sessionId);
      // Load full session data to access taskReviews.
      const data = status.sessionId ? core.automator.getSessionData(sessionId, root) : null;
      if (!row) {
        const msg = `Session '${sessionId}' not found in CSV`;
        if (opts.json) console.log(JSON.stringify({ error: msg }));
        else console.log(chalk.red(msg));
        return;
      }
      if (opts.json) {
        console.log(JSON.stringify({
          sessionId,
          completed: row.completed_tasks,
          running: row.running_tasks,
          runnable: row.runnable_tasks,
          pending: row.pending_tasks,
          reviews: data?.taskReviews || {},
        }, null, 2));
      } else {
        console.log(chalk.bold(`Session: ${sessionId}`));
        console.log(chalk.gray(`Stage: ${status.stage} (${status.state})`));
        console.log('');
        if (row.completed_tasks.length > 0) {
          console.log(chalk.green(`✓ Completed (${row.completed_tasks.length}):`));
          for (const t of row.completed_tasks) {
            const review = data?.taskReviews?.[t];
            const reviewNote = review?.passed ? ' ✓ reviewed' : '';
            console.log(`  ${t}${reviewNote}`);
          }
        }
        if (row.running_tasks.length > 0) {
          console.log(chalk.cyan(`▶ Running/Reviewing (${row.running_tasks.length}):`));
          for (const t of row.running_tasks) {
            const taskStatus = data?.taskStatus?.[t];
            const statusNote = taskStatus === 'reviewing' ? ' (reviewing)' : '';
            console.log(`  ${t}${statusNote}`);
          }
        }
        if (row.runnable_tasks.length > 0) {
          console.log(chalk.yellow(`→ Runnable (${row.runnable_tasks.length}):`));
          for (const t of row.runnable_tasks) {
            const storyCheck = core.automator.checkStoryComplete(sessionId, t, root);
            const storyIcon = storyCheck.complete ? '📋' : '📝';
            console.log(`  ${storyIcon} ${t}${storyCheck.complete ? '' : chalk.gray(' (story needed)')}`);
          }
        }
        if (row.pending_tasks.length > 0) {
          console.log(chalk.gray(`○ Pending (${row.pending_tasks.length}):`));
          for (const t of row.pending_tasks) console.log(`  ${t}`);
        }
      }
    });

  task
    .command('story <task-id>')
    .description('Generate or view a story for a task')
    .option('--session <id>', 'session ID')
    .option('--json', 'output as JSON')
    .action(async (taskId, opts) => {
      const root = process.cwd();
      const sessionId = opts.session || core.automator.getLatestRunningSession(root);
      if (!sessionId) { console.log(chalk.red('No session found')); return; }

      const story = core.automator.generateSingleStory(sessionId, taskId, root);
      if (opts.json) {
        console.log(JSON.stringify({ sessionId, taskId, story }));
      } else {
        const storyPath = require('path').join('.spec-graph', 'sessions', sessionId, 'stories', `${taskId}.md`);
        console.log(chalk.green(`✓ Story generated: ${chalk.bold(taskId)}`));
        console.log(chalk.gray(`  File: ${storyPath}`));
        console.log(chalk.gray(`  Status: ${story.effort} effort, depends on [${story.dependsOn.join(', ') || 'none'}]`));
      }
    });

  task
    .command('stories')
    .description('Check all stories are complete (no placeholders)')
    .option('--session <id>', 'session ID')
    .option('--json', 'output as JSON')
    .action(async (opts) => {
      const root = process.cwd();
      const sessionId = opts.session || core.automator.getLatestRunningSession(root);
      if (!sessionId) { console.log(chalk.red('No session found')); return; }

      const check = core.automator.checkAllStoriesComplete(sessionId, root);
      if (opts.json) {
        console.log(JSON.stringify(check, null, 2));
        return;
      }
      if (check.allComplete) {
        console.log(chalk.green('✓ All stories complete — ready for implement.'));
      } else {
        console.log(chalk.yellow(`⚠ ${check.incomplete.length} incomplete stories:`));
        for (const inc of check.incomplete) {
          const count = inc.missingFields.length;
          console.log(`  ${chalk.red('✗')} ${inc.taskId} — ${count} placeholder(s) remaining`);
        }
        console.log('');
        console.log(chalk.gray('Run: spec-graph task story <id> to generate/fill each story'));
      }
    });
}
