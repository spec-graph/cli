import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import * as core from '@spec-graph/core';

export function register(program: Command): void {
  program
    .command('sessions')
    .alias('session')
    .description('Manage active sessions (list, switch, delete)')
    .option('--action <action>', 'list | info <id> | delete <id> | migrate | doctor | archive [<id>]', 'list')
    .option('--session <id>', 'session id for info/delete')
    .option('--fix', 'for doctor: apply repairs')
    .option('--json', 'output as JSON')
    .action(async (opts) => {
      const action = opts.action || 'list';
      const root = process.cwd();

      switch (action) {
        case 'list': {
          const rows = core.sessionIndex.list(root);
          if (rows.length === 0) {
            if (opts.json) {
              console.log(JSON.stringify([]));
            } else {
              console.log(chalk.yellow('No active sessions.'));
              console.log(`Run ${chalk.cyan('spec-graph plan "<intent>"')} to start.`);
            }
            return;
          }
          if (opts.json) {
            console.log(JSON.stringify(rows, null, 2));
            return;
          }
          console.log(chalk.bold(`Active sessions (${rows.length}):`));
          console.log('');
          for (const r of rows) {
            const icon = r.state === 'completed' ? '✓' :
                         r.state === 'running' ? '▶' :
                         r.state === 'paused' ? '⏸' :
                         r.state === 'failed' ? '✗' : '·';
            const total =
              r.completed_tasks.length +
              r.pending_tasks.length +
              r.running_tasks.length +
              r.runnable_tasks.length;
            const taskProgress = total > 0
              ? `${r.completed_tasks.length}/${total}`
              : '—';
            const running = r.running_tasks.length > 0
              ? ` running:${r.running_tasks.join(',')}`
              : '';
            console.log(
              `  ${chalk.cyan(icon)} ${chalk.bold(r.id)}  ${chalk.gray('·')}  ${r.stage}  ${chalk.gray('·')}  tasks ${taskProgress}${running}`
            );
            if (r.description) {
              const shortDesc = r.description.length > 80
                ? r.description.slice(0, 77) + '...'
                : r.description;
              console.log(`      ${chalk.gray(shortDesc)}`);
            }
          }
          break;
        }

        case 'info': {
          const sessions = core.automator.listSessions(root);
          const id = opts.session || (sessions.length > 0 ? sessions[0] : null);
          if (!id) {
            if (opts.json) console.log(JSON.stringify({ error: 'No session specified' }));
            else console.log('No session specified and no active sessions.');
            return;
          }
          const row = core.sessionIndex.get(root, id);
          const s = core.automator.status(id, root);
          if (opts.json) {
            console.log(JSON.stringify({ row, status: s }, null, 2));
            return;
          }
          console.log(chalk.bold(`\nSession: ${s.sessionId}`));
          console.log(`Intent:   ${row?.description || s.intent}`);
          console.log(`Stage:    ${s.stage} (${s.state})`);
          console.log(`Progress: ${s.progress.currentStageIndex + 1}/${s.progress.totalStages}`);
          console.log(`Artifacts: ${s.progress.completedArtifacts}`);
          if (row) {
            console.log(`Tasks:`);
            console.log(`  completed (${row.completed_tasks.length}): ${row.completed_tasks.join(', ') || '—'}`);
            console.log(`  running   (${row.running_tasks.length}): ${row.running_tasks.join(', ') || '—'}`);
            console.log(`  runnable  (${row.runnable_tasks.length}): ${row.runnable_tasks.join(', ') || '—'}`);
            console.log(`  pending   (${row.pending_tasks.length}): ${row.pending_tasks.join(', ') || '—'}`);
          }
          if (s.blockers.length > 0) {
            console.log(chalk.red(`Blockers: ${s.blockers.join(', ')}`));
          }
          break;
        }

        case 'delete': {
          const id = opts.session;
          if (!id) {
            const msg = 'No session specified. Use --session <id>';
            if (opts.json) console.log(JSON.stringify({ error: msg }));
            else console.log(chalk.red(msg));
            return;
          }
          const sessions = core.automator.listSessions(root);
          if (!sessions.includes(id as string)) {
            const msg = `Session '${id}' not found`;
            if (opts.json) console.log(JSON.stringify({ error: msg }));
            else console.log(chalk.red(msg));
            return;
          }
          core.automator.deleteSession(id as string, root);
          if (opts.json) {
            console.log(JSON.stringify({ deleted: id }));
          } else {
            console.log(chalk.green(`✓ Deleted session: ${id}`));
          }
          break;
        }

        case 'migrate': {
          const mappings = core.sessionIndex.migrateAll(root);
          if (opts.json) {
            console.log(JSON.stringify({ migrated: mappings }, null, 2));
            return;
          }
          if (mappings.length === 0) {
            console.log(chalk.green('No legacy sessions to migrate.'));
            return;
          }
          console.log(chalk.bold(`Migrated ${mappings.length} session(s):`));
          for (const m of mappings) {
            console.log(`  ${chalk.gray(m.legacyId)} → ${chalk.cyan(m.newId)}`);
          }
          break;
        }

        case 'doctor': {
          const report = core.sessionIndex.reconcile(root, { fix: !!opts.fix });
          if (opts.json) {
            console.log(JSON.stringify(report, null, 2));
            return;
          }
          if (report.orphanRows.length === 0 && report.orphanDirs.length === 0) {
            console.log(chalk.green('✓ sessions.csv and session directories are consistent.'));
            return;
          }
          if (report.orphanRows.length > 0) {
            console.log(chalk.yellow(`CSV rows without matching directory (${report.orphanRows.length}):`));
            for (const id of report.orphanRows) console.log(`  - ${id}`);
          }
          if (report.orphanDirs.length > 0) {
            console.log(chalk.yellow(`Directories without matching CSV row (${report.orphanDirs.length}):`));
            for (const d of report.orphanDirs) console.log(`  - ${d}`);
          }
          if (opts.fix && report.repairs.length > 0) {
            console.log(chalk.green('\nRepairs applied:'));
            for (const r of report.repairs) console.log(`  ✓ ${r}`);
          } else if (!opts.fix) {
            console.log(chalk.gray('\nRun with --fix to apply repairs.'));
          }
          break;
        }

        case 'archive': {
          const sessions = core.automator.listSessions(root);
          const id = opts.session || (sessions.length > 0 ? sessions[0] : null);
          if (!id) {
            console.log(chalk.red('No session to archive.'));
            return;
          }
          const status = core.automator.status(id, root);
          if (status.state !== 'completed') {
            console.log(chalk.yellow(`Session '${id}' is not completed (state: ${status.state}). Only completed sessions can be archived.`));
            return;
          }
          // Move session to archive directory, update CSV, log the event.
          const archiveDir = path.join(core.sessionIndex.sessionsDir(root), 'archive');
          fs.mkdirSync(archiveDir, { recursive: true });
          const oldDir = path.join(core.sessionIndex.sessionsDir(root), id);
          const newDir = path.join(archiveDir, id);
          if (fs.existsSync(oldDir)) {
            fs.renameSync(oldDir, newDir);
          }
          // Rename CSV to archived state.
          try {
            core.sessionIndex.update(root, id, { state: 'completed' as const, updated_at: new Date().toISOString() });
          } catch {}
          // Log the archive event.
          const logPath = core.sessionIndex.migrationLogPath(root);
          try {
            fs.appendFileSync(logPath, `${new Date().toISOString()} archived ${id}\n`);
          } catch {}
          if (opts.json) {
            console.log(JSON.stringify({ archived: id, path: newDir }));
          } else {
            console.log(chalk.green(`✓ Session archived: ${id}`));
            console.log(chalk.gray(`  Moved to: ${newDir}`));
          }
          break;
        }

        default:
          console.log(chalk.red(`Unknown action: ${action}. Use: list | info | delete | migrate | doctor | archive`));
      }
    });
}
