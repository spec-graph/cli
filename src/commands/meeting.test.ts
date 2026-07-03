import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Command } from 'commander';
import { register } from './meeting';
import { MeetingManager } from '@spec-graph/core/dist/meeting/index.js';
import type { MeetingDecl } from '@spec-graph/core/dist/types/index.js';

function captureOutput<T>(fn: () => T): { result: T; logs: string[] } {
  const logs: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => logs.push(args.join(' '));
  console.error = (...args: unknown[]) => logs.push(args.join(' '));
  try {
    const result = fn();
    return { result, logs };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

const testDeclaration: MeetingDecl = {
  id: 'test-meeting',
  description: 'Test meeting',
  purpose: 'Test the meeting CLI',
  participants: [
    { agent_id: 'pm', role: 'core', perspective: 'user needs' },
    { agent_id: 'architect', role: 'core', perspective: 'feasibility' },
  ],
  rounds: [
    { number: 1, phase: 'diverge', objective: 'Share', prompt: 'Share.', speakers: [] },
    { number: 2, phase: 'challenge', objective: 'Challenge', prompt: 'Challenge.', speakers: [] },
    { number: 3, phase: 'converge', objective: 'Converge', prompt: 'Converge.', speakers: [] },
  ],
  output_artifacts: [],
  on_actions: ['specify'],
  min_rounds: 2,
  max_rounds: 5,
};

describe('meeting CLI', () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-graph-meeting-test-'));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
    fs.mkdirSync(path.join(tmpDir, '.spec-graph'), { recursive: true });
  });

  afterEach(() => {
    process.chdir(originalCwd);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('registers as a command with subcommands', () => {
    const program = new Command();
    register(program);
    const commands = program.commands.map(c => c.name());
    expect(commands).toContain('meeting');
    const meetingCmd = program.commands.find(c => c.name() === 'meeting')!;
    const subcmds = meetingCmd.commands.map(c => c.name());
    expect(subcmds).toContain('list');
    expect(subcmds).toContain('init');
    expect(subcmds).toContain('record');
    expect(subcmds).toContain('advance');
    expect(subcmds).toContain('complete');
    expect(subcmds).toContain('abandon');
    expect(subcmds).toContain('show');
  });

  it('list returns empty when no meetings', async () => {
    const program = new Command();
    register(program);
    const { logs } = captureOutput(() => {
      program.parse(['node', 'spec-graph', 'meeting', 'list']);
    });
    expect(logs.join('\n')).toContain('No meetings found');
  });

  it('init creates a meeting from ad-hoc options', async () => {
    const program = new Command();
    register(program);
    const { logs } = captureOutput(() => {
      program.parse([
        'node', 'spec-graph', 'meeting', 'init', 'adhoc-1',
        '--purpose', 'Test ad-hoc meeting',
        '--participants', 'pm:user needs,architect:feasibility',
      ]);
    });
    const output = logs.join('\n');
    expect(output).toContain('initialized');

    const manager = new MeetingManager(tmpDir);
    const meetings = manager.list();
    expect(meetings.length).toBe(1);
    expect(meetings[0].meeting_id).toBe('adhoc-1');
    expect(meetings[0].participants.length).toBe(2);
  });

  it('init creates a meeting from graph declaration', async () => {
    // Write graph.yaml with a meeting declaration
    const graph = { meetings: [testDeclaration] };
    fs.writeFileSync(
      path.join(tmpDir, '.spec-graph', 'graph.yaml'),
      require('js-yaml').dump(graph),
    );

    const program = new Command();
    register(program);
    const { logs } = captureOutput(() => {
      program.parse(['node', 'spec-graph', 'meeting', 'init', 'test-meeting']);
    });
    expect(logs.join('\n')).toContain('initialized');

    const manager = new MeetingManager(tmpDir);
    const meetings = manager.list();
    expect(meetings.length).toBe(1);
    expect(meetings[0].participants.length).toBe(2);
  });

  it('record adds a contribution to current round', async () => {
    const manager = new MeetingManager(tmpDir);
    manager.create({
      meetingId: 'm1',
      declaration: testDeclaration,
      projectRoot: tmpDir,
    });

    const program = new Command();
    register(program);
    const { logs } = captureOutput(() => {
      program.parse([
        'node', 'spec-graph', 'meeting', 'record', 'm1',
        '--participant', 'pm',
        '--type', 'statement',
        '--content', 'We need user auth',
      ]);
    });
    expect(logs.join('\n')).toContain('Recorded');

    const runtime = manager.transcript('m1')!;
    expect(runtime.current_round_contributions.length).toBe(1);
    expect(runtime.current_round_contributions[0].participant).toBe('pm');
    expect(runtime.current_round_contributions[0].type).toBe('statement');
  });

  it('advance moves contributions to completed round', async () => {
    const manager = new MeetingManager(tmpDir);
    manager.create({
      meetingId: 'm1',
      declaration: testDeclaration,
      projectRoot: tmpDir,
    });
    manager.record('m1', 'pm', 'statement', 'Hello');

    const program = new Command();
    register(program);
    const { logs } = captureOutput(() => {
      program.parse(['node', 'spec-graph', 'meeting', 'advance', 'm1']);
    });
    expect(logs.join('\n')).toContain('round 2');

    const runtime = manager.transcript('m1')!;
    expect(runtime.current_round).toBe(2);
    expect(runtime.rounds.length).toBe(1);
    expect(runtime.current_round_contributions.length).toBe(0);
  });

  it('complete marks meeting as completed', async () => {
    const manager = new MeetingManager(tmpDir);
    manager.create({
      meetingId: 'm1',
      declaration: testDeclaration,
      projectRoot: tmpDir,
    });

    const program = new Command();
    register(program);
    const { logs } = captureOutput(() => {
      program.parse([
        'node', 'spec-graph', 'meeting', 'complete', 'm1',
        '--summary', 'Agreed on user auth approach',
      ]);
    });
    expect(logs.join('\n')).toContain('completed');

    const runtime = manager.transcript('m1')!;
    expect(runtime.status).toBe('completed');
    expect(runtime.convergence_summary).toBe('Agreed on user auth approach');
  });

  it('abandon marks meeting as abandoned', async () => {
    const manager = new MeetingManager(tmpDir);
    manager.create({
      meetingId: 'm1',
      declaration: testDeclaration,
      projectRoot: tmpDir,
    });

    const program = new Command();
    register(program);
    const { logs } = captureOutput(() => {
      program.parse([
        'node', 'spec-graph', 'meeting', 'abandon', 'm1',
        '--reason', 'Escalated to user',
      ]);
    });
    expect(logs.join('\n')).toContain('abandoned');

    const runtime = manager.transcript('m1')!;
    expect(runtime.status).toBe('abandoned');
  });

  it('show displays meeting transcript', async () => {
    const manager = new MeetingManager(tmpDir);
    manager.create({
      meetingId: 'm1',
      declaration: testDeclaration,
      projectRoot: tmpDir,
    });
    manager.record('m1', 'pm', 'statement', 'Need user auth');
    manager.advance('m1');

    const program = new Command();
    register(program);
    const { logs } = captureOutput(() => {
      program.parse(['node', 'spec-graph', 'meeting', 'show', 'm1']);
    });
    const output = logs.join('\n');
    expect(output).toContain('Meeting: m1');
    expect(output).toContain('Round 1');
    expect(output).toContain('pm');
    expect(output).toContain('statement');
  });

  it('init with --json outputs JSON', async () => {
    const program = new Command();
    register(program);
    const { logs } = captureOutput(() => {
      program.parse([
        'node', 'spec-graph', 'meeting', 'init', 'json-test',
        '--purpose', 'JSON output test',
        '--participants', 'pm:user',
        '--json',
      ]);
    });
    const output = logs.join('\n');
    const parsed = JSON.parse(output);
    expect(parsed.meeting_id).toBe('json-test');
    expect(parsed.status).toBe('in_progress');
  });
});
