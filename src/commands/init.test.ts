import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Command } from 'commander';
import { register } from './init';

describe('init command', () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-graph-init-test-'));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('registers as a command', () => {
    const program = new Command();
    register(program);
    const commands = program.commands.map(c => c.name());
    expect(commands).toContain('init');
  });

  it('creates .spec-graph/ directory with config.yaml and sessions/', async () => {
    const program = new Command();
    register(program);
    await program.parseAsync(['node', 'spec-graph', 'init', '--skip-hook', '--skip-compose']);

    expect(fs.existsSync(path.join(tmpDir, '.spec-graph'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.spec-graph', 'sessions'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.spec-graph', 'config.yaml'))).toBe(true);
  });

  it('config.yaml contains expected template fields', async () => {
    const program = new Command();
    register(program);
    await program.parseAsync(['node', 'spec-graph', 'init', '--skip-hook', '--skip-compose']);

    const config = fs.readFileSync(path.join(tmpDir, '.spec-graph', 'config.yaml'), 'utf-8');
    expect(config).toContain('version:');
    expect(config).toContain('context:');
    expect(config).toContain('rules:');
    expect(config).toContain('references:');
  });

  it('fails when .spec-graph/ already exists without --force', async () => {
    fs.mkdirSync(path.join(tmpDir, '.spec-graph'));

    const program = new Command();
    program.exitOverride();
    register(program);

    await expect(
      program.parseAsync(['node', 'spec-graph', 'init', '--skip-hook', '--skip-compose'])
    ).rejects.toThrow();
  });

  it('overwrites with --force', async () => {
    fs.mkdirSync(path.join(tmpDir, '.spec-graph'));
    fs.writeFileSync(path.join(tmpDir, '.spec-graph', 'old-file'), 'old');

    const program = new Command();
    register(program);
    await program.parseAsync(['node', 'spec-graph', 'init', '--force', '--skip-hook', '--skip-compose']);

    expect(fs.existsSync(path.join(tmpDir, '.spec-graph', 'config.yaml'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.spec-graph', 'old-file'))).toBe(false);
  });

  it('registers hook in .claude/settings.json', async () => {
    const program = new Command();
    register(program);
    await program.parseAsync(['node', 'spec-graph', 'init', '--skip-compose']);

    const settingsPath = path.join(tmpDir, '.claude', 'settings.json');
    expect(fs.existsSync(settingsPath)).toBe(true);

    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    expect(settings.hooks).toBeDefined();
    expect(settings.hooks.PostToolUse).toBeDefined();
    expect(settings.hooks.PostToolUse.length).toBeGreaterThan(0);
    expect(settings.hooks.PostToolUse[0].matcher).toBe('Bash');
    expect(settings.hooks.PostToolUse[0].command).toBe('spec-graph hook dispatch');
  });

  it('skips hook registration with --skip-hook', async () => {
    const program = new Command();
    register(program);
    await program.parseAsync(['node', 'spec-graph', 'init', '--skip-hook', '--skip-compose']);

    const settingsPath = path.join(tmpDir, '.claude', 'settings.json');
    expect(fs.existsSync(settingsPath)).toBe(false);
  });

  it('outputs JSON with --json flag', async () => {
    const program = new Command();
    register(program);

    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => logs.push(msg);

    try {
      await program.parseAsync(['node', 'spec-graph', 'init', '--json', '--skip-hook', '--skip-compose']);
    } finally {
      console.log = originalLog;
    }

    const output = logs.join('\n');
    const parsed = JSON.parse(output);
    expect(parsed.created).toBeDefined();
    expect(Array.isArray(parsed.created)).toBe(true);
    expect(parsed.created).toContain('.spec-graph/');
  });
});
