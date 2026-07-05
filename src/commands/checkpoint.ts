import { Command } from 'commander';
import * as core from '@spec-graph/core';

export function register(program: Command): void {
  program
    .command('checkpoint')
    .description('Generate checkpoint summary for context compression (~200 tokens)')
    .option('--session <id>', 'session id')
    .option('--json', 'output as JSON')
    .action(async (opts) => {
      const sessions = core.automator.listSessions();
      const sessionId = opts.session || (sessions.length > 0 ? sessions[0] : undefined);

      if (!sessionId) {
        console.log('No active session.');
        return;
      }

      const data = core.automator.getSessionData(sessionId, process.cwd());
      if (!data) {
        console.log(`Session ${sessionId} not found.`);
        return;
      }

      // Get task lists from CSV
      const csvRow = core.sessionIndex.get(process.cwd(), sessionId);
      const completed = csvRow?.completed_tasks?.split(',').filter(Boolean) || [];
      const running = csvRow?.running_tasks?.split(',').filter(Boolean) || [];
      const reviewing = csvRow?.reviewing_tasks?.split(',').filter(Boolean) || [];
      const pending = csvRow?.pending_tasks?.split(',').filter(Boolean) || [];
      const runnable = csvRow?.runnable_tasks?.split(',').filter(Boolean) || [];

      const totalTasks = data.plan?.order?.length || 0;

      if (opts.json) {
        // JSON output for programmatic consumption
        const checkpoint = {
          session_id: sessionId,
          stage: data.stage,
          progress: {
            completed: completed.length,
            total: totalTasks,
            percentage: Math.round((completed.length / totalTasks) * 100),
          },
          tasks: {
            completed: completed.map((id) => ({
              id,
              checks: data.taskReviews?.[id]?.checks.length || 0,
              passed: data.taskReviews?.[id]?.passed || false,
            })),
            running: running,
            reviewing: reviewing,
            next: runnable[0] || pending[0] || null,
          },
          blockers: [],
          timestamp: new Date().toISOString(),
        };

        console.log(JSON.stringify(checkpoint, null, 2));
        return;
      }

      // Human-readable compressed output
      let output = `Checkpoint: ${sessionId}\n`;
      output += `${data.stage} stage: ${completed.length}/${totalTasks} tasks (${Math.round((completed.length / totalTasks) * 100)}%)\n\n`;

      // Task summary
      if (completed.length > 0) {
        output += `✓ Completed (${completed.length}): `;
        output += completed.join(', ');
        output += '\n';
      }

      if (running.length > 0) {
        output += `▶ Running: ${running.join(', ')}\n`;
      }

      if (reviewing.length > 0) {
        output += `◎ Reviewing: ${reviewing.join(', ')}\n`;
      }

      const nextTask = runnable[0] || pending[0];
      if (nextTask) {
        output += `→ Next: ${nextTask}\n`;
      }

      // Key decisions (from task reviews)
      const failedTasks = completed.filter(
        (id) => data.taskReviews?.[id] && !data.taskReviews[id].passed
      );
      if (failedTasks.length > 0) {
        output += `\n⚠ Failed tasks (recovered): ${failedTasks.join(', ')}\n`;
      }

      // Gate status
      if (data.stage !== 'implement') {
        output += `\nGate: ${data.stage} stage\n`;
      }

      console.log(output.trim());
    });
}
