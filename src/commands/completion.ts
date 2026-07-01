import { Command } from 'commander';

const commands = [
  'plan', 'auto', 'status', 'next-prompt', 'advance',
  'validate', 'intervene', 'diagnose', 'help',
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
    auto)       COMPREPLY=($(compgen -W "--adapter --max-retries" -- "$cur")) ;;
    status)     COMPREPLY=($(compgen -W "--json --session" -- "$cur")) ;;
    advance)    COMPREPLY=($(compgen -W "--result --session" -- "$cur")) ;;
    validate)   COMPREPLY=($(compgen -W "--session" -- "$cur")) ;;
    diagnose)   COMPREPLY=($(compgen -W "--json --session" -- "$cur")) ;;
    intervene)  COMPREPLY=($(compgen -W "${actions.join(' ')}" -- "$cur")) ;;
    next-prompt) COMPREPLY=($(compgen -W "--session" -- "$cur")) ;;
  esac
}
complete -F _spec_graph_completion spec-graph
`;
      console.log(script);
    });
}
