import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as core from '@spec-graph/core';

// Stage output convention — mirrors automator's convention
const STAGE_OUTPUT_FILE: Record<string, string> = {
  specify: 'proposal.md',
  specs: 'specs.md',
  design: 'design.md',
  tasks: 'tasks.md',
  implement: 'code',
  review: 'review.md',
  test: 'test.md',
  accept: 'verification.md',
  integrate: 'pr.md',
};

export function register(program: Command): void {
  program
    .command('submit')
    .description('Submit agent result for gate evaluation')
    .option('--result <json>', 'agent result JSON')
    .option('--result-file <path>', 'read result JSON from file')
    .option('--session <id>', 'session id')
    .option('--stage', 'auto-submit: read current stage artifact from session dir')
    .action(async (opts) => {
      const sessions = core.automator.listSessions();
      const sessionId = opts.session || (sessions.length > 0 ? sessions[0] : null);
      if (!sessionId) {
        console.log(JSON.stringify({ error: 'No session found' }));
        return;
      }

      if (opts.stage) {
        const status = core.automator.status(sessionId);
        if (!status.stage) {
          console.log(JSON.stringify({ error: 'No current stage' }));
          return;
        }
        const artifactFile = STAGE_OUTPUT_FILE[status.stage] || `${status.stage}.md`;
        const artifactPath = path.join(
          '.spec-graph', 'sessions', sessionId, status.stage, artifactFile
        );
        if (!fs.existsSync(artifactPath)) {
          console.log(JSON.stringify({ error: `Artifact not found: ${artifactPath}` }));
          return;
        }
        const content = fs.readFileSync(artifactPath, 'utf-8');
        const result: core.AgentResult = {
          artifacts: [{ path: path.join(status.stage, artifactFile), content }],
        };
        const submitResult = core.automator.submitResult(sessionId, result);
        console.log(JSON.stringify(submitResult, null, 2));
        return;
      }

      let source = opts.resultFile ? fs.readFileSync(opts.resultFile, 'utf-8') : opts.result;
      if (!source) {
        console.log(JSON.stringify({ error: 'Use --stage, --result, or --result-file' }));
        return;
      }

      let parsed: { artifacts?: Array<string | { path: string; content?: string }> };
      try { parsed = JSON.parse(source); } catch {
        console.log(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }

      const artifacts: Array<{ path: string; content: string }> = [];
      for (const art of (parsed.artifacts || [])) {
        if (typeof art === 'string') {
          const content = fs.existsSync(art) ? fs.readFileSync(art, 'utf-8') : '';
          artifacts.push({ path: art, content });
        } else {
          const artContent = art.content || (fs.existsSync(art.path) ? fs.readFileSync(art.path, 'utf-8') : '');
          artifacts.push({ path: art.path, content: artContent });
        }
      }

      const result: core.AgentResult = { artifacts };
      const submitResult = core.automator.submitResult(sessionId, result);
      console.log(JSON.stringify(submitResult, null, 2));
    });
}
