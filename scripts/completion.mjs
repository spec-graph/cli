#!/usr/bin/env node
/**
 * spec-graph-completion — simple bash/zsh completion script generator
 *
 * Usage:
 *   source <(node packages/cli/scripts/completion.mjs)
 *
 * For permanent installation, add this to ~/.bashrc or ~/.zshrc:
 *   source <(spec-graph completion)
 */

const commands = [
  'plan',
  'auto',
  'status',
  'next-prompt',
  'advance',
  'validate',
  'intervene',
  'diagnose',
  'help',
];

const interveneActions = ['force-advance', 'rollback', 'resume', 'modify-plan'];

const script = `# spec-graph completion — generated
_spec_graph_completion() {
  local cur prev words cword
  _init_completion || return

  if ((cword == 1)); then
    COMPREPLY=($(compgen -W "${commands.join(' ')}" -- "$cur"))
    return
  fi

  case "\${words[1]}" in
    plan)
      COMPREPLY=($(compgen -W "--confirm --json" -- "$cur"))
      ;;
    auto)
      COMPREPLY=($(compgen -W "--adapter --max-retries" -- "$cur"))
      ;;
    status)
      COMPREPLY=($(compgen -W "--json --session" -- "$cur"))
      ;;
    advance)
      COMPREPLY=($(compgen -W "--result --session" -- "$cur"))
      ;;
    validate)
      COMPREPLY=($(compgen -W "--session" -- "$cur"))
      ;;
    diagnose)
      COMPREPLY=($(compgen -W "--json --session" -- "$cur"))
      ;;
    intervene)
      COMPREPLY=($(compgen -W "${interveneActions.join(' ')}" -- "$cur"))
      ;;
    next-prompt)
      COMPREPLY=($(compgen -W "--session" -- "$cur"))
      ;;
  esac
}

complete -F _spec_graph_completion spec-graph
`;

if (process.argv.includes('--bash')) {
  process.stdout.write(script);
} else {
  // Default: output for zsh (compatible with bashcompinit)
  process.stdout.write('# spec-graph shell completion\n');
  process.stdout.write('# Add to ~/.zshrc: source <(spec-graph completion)\n\n');
  process.stdout.write(script);
}
