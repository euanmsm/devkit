export const historyExercises = [
  {
    kind: 'typed',
    id: 'search-history',
    prompt:
      'You ran a long docker command an hour ago and want it again. Which keystroke searches your history for it?',
    accept: ['ctrl-r'],
    answer: 'Ctrl-R',
    note: "With fzf's shell integration loaded this becomes a fuzzy picker over everything you've run.",
  },
  {
    kind: 'recall',
    id: 'last-argument',
    prompt:
      'You just ran `mkdir -p src/learn/courses`. How do you cd into it without retyping the path?',
    answer: 'cd !$',
    note: "!$ is the previous command's last argument — the one that pays for itself the same day.",
  },
  {
    kind: 'recall',
    id: 'substitute',
    prompt:
      'Your last command was right except for one word. How do you rerun it with that word swapped?',
    answer: '^old^new',
    note: 'Only the first occurrence is replaced.',
  },
  {
    kind: 'choice',
    id: 'bang-bang',
    prompt: 'You forgot sudo. What runs the previous command again with it?',
    options: ['sudo !$', 'sudo !!', 'sudo ^^'],
    correct: 1,
    note: '!! is the whole previous command; !$ is only its last argument.',
  },
  {
    kind: 'typed',
    id: 'share-history',
    prompt:
      'Which zsh option makes a command typed in one terminal reachable by Ctrl-R in another?',
    accept: ['share_history', 'setopt share_history'],
    answer: 'setopt SHARE_HISTORY',
    note: 'The sleeper setting — without it each tab keeps its own history until it exits.',
  },
  {
    kind: 'recall',
    id: 'last-rg',
    prompt:
      'Rerun the most recent command that started with `rg`, without searching for it.',
    answer: '!rg',
    note: '!<prefix> reruns the last match, so !npm and !git work the same way.',
  },
];
