import { Command } from 'commander';
import * as core from '@spec-graph/core';
import * as fs from 'node:fs';
import * as path from 'node:path';

export function register(program: Command): void {
  program
    .command('validate')
    .description('Validate current state / artifacts')
    .option('--session <id>', 'session id')
    .option('--knowledge', 'validate knowledge base (stage dirs vs FSM STAGES)')
    .action(async (opts) => {
      if (opts.knowledge) {
        validateKnowledge();
        return;
      }

      const sessions = core.automator.listSessions();
      const sessionId = opts.session || (sessions.length > 0 ? sessions[0] : null);
      if (!sessionId) {
        console.log(JSON.stringify({ error: 'No session found' }));
        return;
      }
      const s = core.automator.status(sessionId);
      console.log(JSON.stringify(s, null, 2));
    });
}

function validateKnowledge(): void {
  const kbPath = path.join(process.cwd(), 'packages', 'core', 'knowledge', 'stages');
  if (!fs.existsSync(kbPath)) {
    console.log(JSON.stringify({ error: 'Knowledge base not found at ' + kbPath }));
    return;
  }

  const stageDirs = fs.readdirSync(kbPath, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  const fsmStages = core.automator.STAGES as string[];

  // Check each stage dir has gate.yaml
  const issues: string[] = [];
  for (const stage of stageDirs) {
    const gatePath = path.join(kbPath, stage, 'gate.yaml');
    if (!fs.existsSync(gatePath)) {
      issues.push(`${stage}/gate.yaml missing`);
    }
  }

  // Check FSM stages all have knowledge dirs
  for (const stage of fsmStages) {
    if (!stageDirs.includes(stage)) {
      issues.push(`Knowledge dir missing for FSM stage: ${stage}`);
    }
  }

  // Check for zombie knowledge dirs (not in FSM)
  const archived = fs.existsSync(path.join(kbPath, '..', 'archived'))
    ? fs.readdirSync(path.join(kbPath, '..', 'archived'), { withFileTypes: true })
        .filter(d => d.isDirectory()).map(d => d.name)
    : [];

  for (const dir of stageDirs) {
    if (!fsmStages.includes(dir) && !archived.includes(dir)) {
      issues.push(`Zombie knowledge dir: ${dir} (not in FSM and not archived)`);
    }
  }

  console.log(JSON.stringify({
    fsmStages,
    knowledgeDirs: stageDirs,
    archived,
    issues: issues.length > 0 ? issues : [],
    valid: issues.length === 0,
  }, null, 2));
}
