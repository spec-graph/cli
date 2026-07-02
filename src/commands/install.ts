import { Command } from 'commander';

export function register(program: Command): void {
  program
    .command('install')
    .description('Install spec-graph skills into IDE project')
    .option('--ide <ide>', 'target IDE (claude-code, cursor, opencode)')
    .option('--force', 'overwrite existing skills')
    .option('--local', 'install to project .claude/skills/ instead of global')
    .action(async (opts) => {
      // Skills are installed from packages/skills/ via the install-skills.mjs script
      // This CLI command is the user-facing trigger
      console.log(`Skills would be installed for IDE: ${opts.ide || 'claude-code'} (${opts.local ? 'local' : 'global'})`);
      console.log('Run: node packages/skills/scripts/install-skills.mjs' + (opts.local ? ' --local' : ''));
    });
}
