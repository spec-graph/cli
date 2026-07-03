import { Command } from 'commander';

const commands = [
  'plan', 'status', 'dispatch', 'submit',
  'validate', 'intervene', 'diagnose', 'help',
  'init', 'compose', 'sessions', 'config', 'machine',
  'gate', 'check', 'install', 'completion', 'analyze',
  'artifact-complete', 'check-run',
];

export function register(program: Command): void {
  program
    .command('completion')
    .description('Generate shell completion script')
    .option('--bash', 'output bash completion')
    .action((opts) => {
      const actions = ['force-advance', 'rollback', 'resume', 'modify-plan'];
      const script = `# spec-graph completion
_spec_graph_completion() {
  local cur prev words cword
  _init_completion || return
  if ((cword == 1)); then
    COMPREPLY=($(compgen -W "${commands.join(' ')}" -- "$cur"))
    return
  fi
  case "\${words[1]}" in
    plan)       COMPREPLY=($(compgen -W "--confirm --json" -- "$cur")) ;;
    status)     COMPREPLY=($(compgen -W "--json --session" -- "$cur")) ;;
    dispatch)   COMPREPLY=($(compgen -W "--json --session" -- "$cur")) ;;
    submit)    COMPREPLY=($(compgen -W "--result --session" -- "$cur")) ;;
    validate)   COMPREPLY=($(compgen -W "--session" -- "$cur")) ;;
    diagnose)   COMPREPLY=($(compgen -W "--json --session" -- "$cur")) ;;
    intervene)  COMPREPLY=($(compgen -W "${actions.join(' ')}" -- "$cur")) ;;
    init)       COMPREPLY=($(compgen -W "--force --skip-hook" -- "$cur")) ;;
  esac
}
complete -F _spec_graph_completion spec-graph
`;
      console.log(script);
    });
}
