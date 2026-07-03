import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import * as core from '@spec-graph/core';
import type { MeetingDecl } from '@spec-graph/core/dist/types/index.js';

function resolveProjectRoot(): string {
  return process.cwd();
}

function loadGraphMeetings(projectRoot: string): MeetingDecl[] {
  const graphPath = path.join(projectRoot, '.spec-graph', 'graph.yaml');
  if (!fs.existsSync(graphPath)) return [];
  try {
    const raw = fs.readFileSync(graphPath, 'utf-8');
    const graph = yaml.load(raw) as { meetings?: MeetingDecl[] };
    return graph?.meetings || [];
  } catch {
    return [];
  }
}

export function register(program: Command): void {
  const meeting = new Command('meeting')
    .description('Meeting runtime commands — multi-agent collaborative discussions');

  // meeting list
  meeting
    .command('list')
    .description('List all active and completed meetings')
    .option('--json', 'output as JSON')
    .action((opts) => {
      const root = resolveProjectRoot();
      const manager = new core.meeting.MeetingManager(root);
      const meetings = manager.list();

      if (opts.json) {
        console.log(JSON.stringify({ meetings }, null, 2));
        return;
      }

      if (meetings.length === 0) {
        console.log(chalk.gray('No meetings found.'));
        return;
      }

      console.log(chalk.bold('Meetings'));
      for (const m of meetings) {
        const color = m.status === 'in_progress' ? chalk.yellow : m.status === 'completed' ? chalk.green : chalk.red;
        console.log(`  ${m.meeting_id}  ${color(m.status)}  round ${m.current_round}  participants: ${m.participants.length}`);
      }
    });

  // meeting init
  meeting
    .command('init <meeting-id>')
    .description('Initialize a meeting runtime state')
    .option('--session <id>', 'session id (for context)')
    .option('--purpose <text>', 'meeting purpose (ad-hoc meetings)')
    .option('--participants <list>', 'comma-separated participants: agent1:perspective,agent2:perspective')
    .option('--min-rounds <n>', 'minimum rounds before convergence', '1')
    .option('--max-rounds <n>', 'maximum rounds before forced synthesis', '5')
    .option('--phase <phase>', 'initial phase (diverge|challenge|converge)', 'diverge')
    .option('--json', 'output as JSON')
    .action((meetingId, opts) => {
      const root = resolveProjectRoot();
      const manager = new core.meeting.MeetingManager(root);

      // Try to find declaration in graph
      const declaredMeetings = loadGraphMeetings(root);
      let declaration: MeetingDecl | undefined = declaredMeetings.find(m => m.id === meetingId);

      if (!declaration) {
        // Ad-hoc meeting — build declaration from CLI options
        if (!opts.purpose) {
          console.error(chalk.red('Error: meeting not declared in graph.yaml. Use --purpose to create ad-hoc meeting.'));
          process.exit(1);
        }
        const participantsRaw = opts.participants || 'coordinator:coordinator';
        const participants = participantsRaw.split(',').map((p: string) => {
          const [agentId, perspective] = p.split(':');
          return {
            agent_id: agentId,
            role: 'core' as const,
            perspective: perspective || 'contributing to discussion',
          };
        });

        const rounds: MeetingDecl['rounds'] = [];
        const minR = parseInt(opts.minRounds || '1');
        const maxR = parseInt(opts.maxRounds || '5');

        if (minR >= 1) rounds.push({ number: 1, phase: opts.phase || 'diverge', objective: 'Share perspectives', prompt: 'Share your perspective.', speakers: [] });
        if (maxR > 1) rounds.push({ number: 2, phase: 'challenge', objective: 'Challenge assumptions', prompt: 'Review all contributions. Challenge any assumptions.', speakers: [] });
        if (maxR > 2) rounds.push({ number: 3, phase: 'converge', objective: 'Align on shared understanding', prompt: 'Refine your position based on the discussion.', speakers: [] });

        declaration = {
          id: meetingId,
          description: `Ad-hoc meeting: ${opts.purpose}`,
          purpose: opts.purpose,
          participants,
          rounds,
          output_artifacts: [],
          on_actions: [],
          min_rounds: minR,
          max_rounds: maxR,
        };
      }

      try {
        const runtime = manager.create({
          meetingId,
          declaration,
          projectRoot: root,
          triggeredByAction: declaration.on_actions?.[0],
          triggeredByStage: undefined,
        });

        if (opts.json) {
          console.log(JSON.stringify(runtime, null, 2));
        } else {
          console.log(chalk.green(`✓ Meeting '${meetingId}' initialized`));
          console.log(`  Purpose: ${declaration.purpose}`);
          console.log(`  Participants: ${declaration.participants.length}`);
          console.log(`  Rounds: ${declaration.rounds.length} (min: ${declaration.min_rounds}, max: ${declaration.max_rounds})`);
        }
      } catch (err) {
        console.error(chalk.red(`Error: ${(err as Error).message}`));
        process.exit(1);
      }
    });

  // meeting record
  meeting
    .command('record <meeting-id>')
    .description('Record a contribution for the current round')
    .requiredOption('--participant <id>', 'participant agent_id or expert')
    .requiredOption('--type <type>', 'contribution type: statement|question|challenge|refinement|synthesis')
    .requiredOption('--content <text>', 'the contribution text')
    .option('--targets <list>', 'comma-separated participant ids this targets (for questions/challenges)')
    .option('--json', 'output as JSON')
    .action((meetingId, opts) => {
      const root = resolveProjectRoot();
      const manager = new core.meeting.MeetingManager(root);

      const targets = opts.targets ? opts.targets.split(',') : undefined;
      const contribution = manager.record(
        meetingId,
        opts.participant,
        opts.type as any,
        opts.content,
        targets,
      );

      if (opts.json) {
        console.log(JSON.stringify(contribution, null, 2));
      } else {
        console.log(chalk.green(`✓ Recorded: [${opts.participant}] ${opts.type}`));
        console.log(`  Round: ${contribution.round}`);
      }
    });

  // meeting advance
  meeting
    .command('advance <meeting-id>')
    .description('Advance to the next round (moves current contributions to completed round)')
    .option('--json', 'output as JSON')
    .action((meetingId, opts) => {
      const root = resolveProjectRoot();
      const manager = new core.meeting.MeetingManager(root);

      try {
        const runtime = manager.advance(meetingId);
        if (opts.json) {
          console.log(JSON.stringify(runtime, null, 2));
        } else {
          console.log(chalk.green(`✓ Advanced to round ${runtime.current_round} (${runtime.current_phase})`));
        }
      } catch (err) {
        console.error(chalk.red(`Error: ${(err as Error).message}`));
        process.exit(1);
      }
    });

  // meeting complete
  meeting
    .command('complete <meeting-id>')
    .description('Complete the meeting with a synthesis summary')
    .requiredOption('--summary <text>', 'facilitator synthesis of agreements')
    .option('--json', 'output as JSON')
    .action((meetingId, opts) => {
      const root = resolveProjectRoot();
      const manager = new core.meeting.MeetingManager(root);

      const runtime = manager.complete(meetingId, opts.summary);

      if (opts.json) {
        console.log(JSON.stringify(runtime, null, 2));
      } else {
        console.log(chalk.green(`✓ Meeting '${meetingId}' completed`));
        console.log(`  Summary: ${opts.summary.slice(0, 100)}${opts.summary.length > 100 ? '...' : ''}`);
      }
    });

  // meeting abandon
  meeting
    .command('abandon <meeting-id>')
    .description('Abandon the meeting (e.g. escalated to user)')
    .option('--reason <text>', 'reason for abandonment')
    .option('--json', 'output as JSON')
    .action((meetingId, opts) => {
      const root = resolveProjectRoot();
      const manager = new core.meeting.MeetingManager(root);

      const runtime = manager.abandon(meetingId, opts.reason);

      if (opts.json) {
        console.log(JSON.stringify(runtime, null, 2));
      } else {
        console.log(chalk.yellow(`✗ Meeting '${meetingId}' abandoned`));
        if (opts.reason) console.log(`  Reason: ${opts.reason}`);
      }
    });

  // meeting show
  meeting
    .command('show <meeting-id>')
    .description('Show meeting transcript and runtime state')
    .option('--json', 'output as JSON')
    .action((meetingId, opts) => {
      const root = resolveProjectRoot();
      const manager = new core.meeting.MeetingManager(root);

      const runtime = manager.transcript(meetingId);
      if (!runtime) {
        console.log(chalk.red(`Meeting not found: ${meetingId}`));
        process.exit(1);
      }

      if (opts.json) {
        console.log(JSON.stringify(runtime, null, 2));
      } else {
        console.log(chalk.bold(`Meeting: ${runtime.meeting_id}`));
        console.log(`  Status: ${runtime.status}`);
        console.log(`  Current round: ${runtime.current_round}`);
        console.log(`  Participants: ${runtime.participants.join(', ')}`);
        console.log(`  Completed rounds: ${runtime.rounds.length}`);

        for (const round of runtime.rounds) {
          console.log('');
          console.log(chalk.cyan(`  Round ${round.round} (${round.phase})`));
          for (const c of round.contributions) {
            console.log(`    [${c.participant}] ${c.type}: ${c.content.slice(0, 80)}${c.content.length > 80 ? '...' : ''}`);
          }
        }

        if (runtime.current_round_contributions.length > 0) {
          console.log('');
          console.log(chalk.yellow(`  Current round ${runtime.current_round} contributions:`));
          for (const c of runtime.current_round_contributions) {
            console.log(`    [${c.participant}] ${c.type}: ${c.content.slice(0, 80)}${c.content.length > 80 ? '...' : ''}`);
          }
        }

        if (runtime.convergence_summary) {
          console.log('');
          console.log(chalk.bold('  Convergence:'));
          console.log(`  ${runtime.convergence_summary}`);
        }
      }
    });

  program.addCommand(meeting);
}
