import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import { Command } from 'commander';
import { register } from './worktree';
import { WorktreeManager } from '@spec-graph/core/dist/isolation/index.js';

function captureOutput<T>(fn: () => T): { result: T; logs: string[]; errors: string[] } {
  const logs: string[] = [];
  const errors: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => logs.push(args.join(' '));
  console.error = (...args: unknown[]) => errors.push(args.join(' '));
  try {
    const result = fn();
    return { result, logs, errors };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

function initGitRepo(dir: string): void {
  // Silently init or skip if git not available
  try {
    execSync('git init && git config user.email test@test.com && git config user.name test && git commit --allow-empty -m "init"', {
      cwd: dir, stdio: 'pipe',
    });
  } catch {}
}

describe('worktree CLI', () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-graph-wt-test-'));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
    fs.mkdirSync(path.join(tmpDir, '.spec-graph'), { recursive: true });
    initGitRepo(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('registers as a command with subcommands', () => {
    const program = new Command();
    register(program);
    const commands = program.commands.map(c => c.name());
    expect(commands).toContain('worktree');
    const wtCmd = program.commands.find(c => c.name() === 'worktree')!;
    const subcmds = wtCmd.commands.map(c => c.name());
    expect(subcmds).toContain('list');
    expect(subcmds).toContain('status');
    expect(subcmds).toContain('create');
    expect(subcmds).toContain('verify');
    expect(subcmds).toContain('merge');
    expect(subcmds).toContain('abandon');
    expect(subcmds).toContain('scope-check');
  });

  it('list returns empty when no units', () => {
    const program = new Command();
    register(program);
    const { logs } = captureOutput(() => {
      program.parse(['node', 'spec-graph', 'worktree', 'list']);
    });
    expect(logs.join('\n')).toContain('No worktree units');
  });

  it('create creates a worktree unit', () => {
    // Create an initial commit so there's a valid HEAD
    fs.writeFileSync(path.join(tmpDir, 'test.txt'), 'hello');
    execSync('git add . && git commit -m "initial"', { cwd: tmpDir, stdio: 'pipe' });

    const program = new Command();
    register(program);
    const { logs } = captureOutput(() => {
      program.parse([
        'node', 'spec-graph', 'worktree', 'create',
        '--session', 'session-1',
        '--action', 'impl-cap-1',
      ]);
    });
    const output = logs.join('\n');
    expect(output).toContain('created');
  });

  it('status shows unit details', () => {
    const mgr = new WorktreeManager(tmpDir);
    // Mock a unit directly in state
    const statePath = path.join(tmpDir, '.spec-graph', 'isolation', 'worktrees.yaml');
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, require('js-yaml').dump({
      units: {
        'session-1-impl-cap-1': {
          id: 'session-1-impl-cap-1',
          track: 'feature',
          branch: 'spec-graph/session-1-impl-cap-1',
          path: '/tmp/mock',
          status: 'prepared',
          created_at: new Date().toISOString(),
          prepared_at: new Date().toISOString(),
        },
      },
    }));

    const program = new Command();
    register(program);
    const { logs, errors } = captureOutput(() => {
      program.parse(['node', 'spec-graph', 'worktree', 'status', 'session-1-impl-cap-1']);
    });
    const output = logs.join('\n');
    // Output goes to stdout when found
    expect(output).toContain('session-1-impl-cap-1');
  });

  it('status errors when unit not found', () => {
    const program = new Command();
    program.exitOverride();
    register(program);

    const { errors } = captureOutput(() => {
      try {
        program.parse(['node', 'spec-graph', 'worktree', 'status', 'nonexistent']);
      } catch {}
    });
    expect(errors.join('\n')).toContain('not found');
  });

  it('verify marks unit as self-verified', () => {
    const statePath = path.join(tmpDir, '.spec-graph', 'isolation', 'worktrees.yaml');
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, require('js-yaml').dump({
      units: {
        'session-1-impl-cap-1': {
          id: 'session-1-impl-cap-1',
          track: 'feature',
          branch: 'spec-graph/session-1-impl-cap-1',
          path: tmpDir,
          status: 'prepared',
          created_at: new Date().toISOString(),
          prepared_at: new Date().toISOString(),
        },
      },
    }));

    const program = new Command();
    register(program);
    const { logs } = captureOutput(() => {
      program.parse(['node', 'spec-graph', 'worktree', 'verify', 'session-1-impl-cap-1']);
    });
    const output = logs.join('\n');
    expect(output).toContain('verified');

    // Verify the state was updated
    const mgr = new WorktreeManager(tmpDir);
    const unit = mgr.get('session-1-impl-cap-1');
    expect(unit?.status).toBe('self_verified');
  });

  it('verify fails when unit not found', () => {
    const program = new Command();
    program.exitOverride();
    register(program);

    const { errors } = captureOutput(() => {
      try {
        program.parse(['node', 'spec-graph', 'worktree', 'verify', 'nonexistent']);
      } catch {}
    });
    expect(errors.join('\n')).toContain('failed');
  });

  it('scope-check detects violations', () => {
    // Create a mock unit
    const statePath = path.join(tmpDir, '.spec-graph', 'isolation', 'worktrees.yaml');
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, require('js-yaml').dump({
      units: {
        'mock-unit': {
          id: 'mock-unit',
          track: 'feature',
          branch: 'spec-graph/mock-unit',
          path: tmpDir,
          status: 'prepared',
          created_at: new Date().toISOString(),
        },
      },
    }));

    // Create a file that violates scope
    fs.writeFileSync(path.join(tmpDir, 'secret.env'), 'PASSWORD=123');

    const program = new Command();
    register(program);
    const { errors } = captureOutput(() => {
      try {
        program.parse([
          'node', 'spec-graph', 'worktree', 'scope-check', 'mock-unit',
          '--files', 'src/app.ts,secret.env',
          '--scope-forbidden', '*.env',
        ]);
      } catch {}
    });
    const errorOutput = errors.join('\n');
    expect(errorOutput).toContain('violations');
    expect(errorOutput).toContain('secret.env');
  });
});
