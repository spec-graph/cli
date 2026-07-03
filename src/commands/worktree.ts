import { Command } from 'commander';
import chalk from 'chalk';
import * as core from '@spec-graph/core';
import { checkScopeLock } from '@spec-graph/core/dist/isolation/scope-lock.js';
import type { IsolationUnit } from '@spec-graph/core/dist/types/index.js';

function resolveProjectRoot(): string {
  return process.cwd();
}

function printUnit(u: IsolationUnit, compact = false): void {
  const color =
    u.status === 'merged' ? chalk.green
    : u.status === 'abandoned' ? chalk.red
    : u.status === 'prepared' ? chalk.gray
    : u.status === 'self_verified' ? chalk.yellow
    : u.status === 'submitted' ? chalk.cyan
    : u.status === 'accepted' ? chalk.blue
    : u.status === 'rejected' ? chalk.red
    : chalk.white;

  if (compact) {
    console.log(`  ${u.id}  ${color(u.status)}  branch: ${u.branch}  track: ${u.track}`);
  } else {
    console.log(chalk.bold(`  Unit: ${u.id}`));
    console.log(`    Status: ${color(u.status)}`);
    console.log(`    Branch: ${u.branch}`);
    console.log(`    Track:  ${u.track}`);
    console.log(`    Path:   ${u.path}`);
    if (u.base_commit) console.log(`    Base:   ${u.base_commit.slice(0, 8)}`);
    if (u.prepared_at) console.log(`    Prepared: ${u.prepared_at}`);
    if (u.self_verified_at) console.log(`    Verified: ${u.self_verified_at}`);
    if (u.merged_at) console.log(`    Merged: ${u.merged_at}`);
    if (u.rejected_reason) console.log(`    Rejected: ${u.rejected_reason}`);
  }
}

export function register(program: Command): void {
  const wt = new Command('worktree')
    .description('Worktree isolation for parallel sub-agent execution');

  // worktree list
  wt
    .command('list')
    .description('List all worktree isolation units')
    .option('--json', 'output as JSON')
    .option('--status <status>', 'filter by status')
    .action((opts) => {
      const root = resolveProjectRoot();
      const mgr = new core.isolation.WorktreeManager(root);
      const units = mgr.list();

      const filtered = opts.status
        ? units.filter(u => u.status === opts.status)
        : units;

      if (opts.json) {
        console.log(JSON.stringify({ units: filtered }, null, 2));
        return;
      }

      if (filtered.length === 0) {
        console.log(chalk.gray('No worktree units found.'));
        return;
      }

      console.log(chalk.bold(`Worktree units (${filtered.length}):`));
      for (const u of filtered) {
        printUnit(u, true);
      }
    });

  // worktree status
  wt
    .command('status <unit-id>')
    .description('Show detailed status of a worktree unit')
    .option('--json', 'output as JSON')
    .action((unitId, opts) => {
      const root = resolveProjectRoot();
      const mgr = new core.isolation.WorktreeManager(root);
      const unit = mgr.get(unitId);

      if (!unit) {
        console.error(chalk.red(`Unit not found: ${unitId}`));
        process.exit(1);
      }

      if (opts.json) {
        console.log(JSON.stringify(unit, null, 2));
      } else {
        printUnit(unit, false);
      }
    });

  // worktree create
  wt
    .command('create')
    .description('Create a worktree for a parallel action')
    .requiredOption('--session <id>', 'session id')
    .requiredOption('--action <id>', 'action id (capability id)')
    .option('--base-branch <branch>', 'base branch (default: current HEAD)')
    .option('--scope-allowed <globs>', 'comma-separated allowed globs')
    .option('--scope-protected <globs>', 'comma-separated protected globs')
    .option('--scope-forbidden <globs>', 'comma-separated forbidden globs')
    .option('--json', 'output as JSON')
    .action((opts) => {
      const root = resolveProjectRoot();
      const mgr = new core.isolation.WorktreeManager(root);

      const scopeLock = opts.scopeAllowed
        ? {
            allowed_paths: opts.scopeAllowed.split(','),
            protected_paths: opts.scopeProtected?.split(',') || [],
            forbidden_paths: opts.scopeForbidden?.split(',') || [],
            enforcement_mode: 'strict' as const,
          }
        : undefined;

      try {
        const unit = mgr.create({
          sessionId: opts.session,
          actionId: opts.action,
          projectRoot: root,
          baseBranch: opts.baseBranch,
          scopeLock,
        });

        if (opts.json) {
          console.log(JSON.stringify(unit, null, 2));
        } else {
          console.log(chalk.green(`✓ Worktree created`));
          printUnit(unit, false);
          console.log('');
          console.log(`Next: sub-agent works in ${unit.path}`);
          console.log(`Then: spec-graph worktree verify ${unit.id}`);
        }
      } catch (err) {
        console.error(chalk.red(`Error: ${(err as Error).message}`));
        process.exit(1);
      }
    });

  // worktree verify
  wt
    .command('verify <unit-id>')
    .description('Verify a worktree unit (mark as self-verified)')
    .option('--json', 'output as JSON')
    .action((unitId, opts) => {
      const root = resolveProjectRoot();
      const mgr = new core.isolation.WorktreeManager(root);

      const result = mgr.verify(unitId);

      if (opts.json) {
        console.log(JSON.stringify({ unitId, ...result }, null, 2));
      } else if (result.success) {
        console.log(chalk.green(`✓ Unit ${unitId} verified`));
        if (result.output) console.log(`  ${result.output}`);
      } else {
        console.error(chalk.red(`✗ Verification failed for ${unitId}`));
        for (const e of result.errors) console.error(`  - ${e}`);
        process.exit(1);
      }
    });

  // worktree merge
  wt
    .command('merge <unit-id>')
    .description('Merge a verified worktree into the main branch')
    .option('--json', 'output as JSON')
    .action((unitId, opts) => {
      const root = resolveProjectRoot();
      const mgr = new core.isolation.WorktreeManager(root);

      const result = mgr.merge(unitId);

      if (opts.json) {
        console.log(JSON.stringify({ unitId, ...result }, null, 2));
      } else if (result.success) {
        console.log(chalk.green(`✓ Merged ${unitId}`));
        if (result.output) console.log(`  ${result.output}`);
      } else {
        console.error(chalk.red(`✗ Merge failed for ${unitId}`));
        if (result.conflicts.length > 0) {
          console.error(chalk.yellow('  Conflicts:'));
          for (const c of result.conflicts) console.error(`    - ${c}`);
        }
        process.exit(1);
      }
    });

  // worktree abandon
  wt
    .command('abandon <unit-id>')
    .description('Abandon a worktree unit and cleanup')
    .option('--reason <text>', 'reason for abandonment')
    .option('--json', 'output as JSON')
    .action((unitId, opts) => {
      const root = resolveProjectRoot();
      const mgr = new core.isolation.WorktreeManager(root);

      mgr.abandon(unitId, opts.reason);

      if (opts.json) {
        console.log(JSON.stringify({ unitId, status: 'abandoned' }));
      } else {
        console.log(chalk.yellow(`✗ Unit ${unitId} abandoned`));
      }
    });

  // worktree scope-check
  wt
    .command('scope-check <unit-id>')
    .description('Check scope lock violations for changed files in a unit')
    .requiredOption('--files <list>', 'comma-separated changed file paths (relative to worktree)')
    .option('--scope-allowed <globs>', 'comma-separated allowed globs')
    .option('--scope-protected <globs>', 'comma-separated protected globs')
    .option('--scope-forbidden <globs>', 'comma-separated forbidden globs')
    .option('--json', 'output as JSON')
    .action((unitId, opts) => {
      const root = resolveProjectRoot();
      const mgr = new core.isolation.WorktreeManager(root);
      const unit = mgr.get(unitId);

      if (!unit) {
        console.error(chalk.red(`Unit not found: ${unitId}`));
        process.exit(1);
      }

      const changedFiles = opts.files.split(',');
      const lock = {
        allowedPaths: opts.scopeAllowed?.split(',') || [],
        protectedPaths: opts.scopeProtected?.split(',') || [],
        forbiddenPaths: opts.scopeForbidden?.split(',') || [],
      };

      const result = checkScopeLock(unit.path, lock, changedFiles);

      if (opts.json) {
        console.log(JSON.stringify({ unitId, ...result }, null, 2));
      } else if (result.clean) {
        console.log(chalk.green(`✓ Scope clean: no violations in ${changedFiles.length} file(s)`));
      } else {
        console.error(chalk.red(`✗ Scope violations (${result.violations.length}):`));
        for (const v of result.violations) {
          console.error(`  - ${v.type}: ${v.path} (rule: ${v.rule})`);
        }
        process.exit(1);
      }
    });

  program.addCommand(wt);
}
