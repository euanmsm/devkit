export const firstStackExercises = [
  {
    kind: 'recall',
    id: 'start',
    prompt:
      "You're on main with a three-layer feature in mind. First command, to start the stack and its first branch?",
    answer: 'gh stack init <branch>',
    note: 'Several names build several layers at once; --base picks a trunk other than main.',
  },
  {
    kind: 'recall',
    id: 'add-all',
    prompt:
      'A layer is finished but nothing is staged, untracked files included. One command to commit it all and start the next branch on top?',
    answer: 'gh stack add -Am "message"',
    note: '-A stages untracked files too; with no branch name it invents one from the message.',
  },
  {
    kind: 'choice',
    id: 'who-opens-prs',
    prompt:
      'The branches exist locally but GitHub has no PRs yet. Which command opens them?',
    options: ['gh stack push', 'gh stack submit', 'gh stack sync'],
    correct: 1,
    note: 'push publishes branches, sync reconciles — only submit creates PRs.',
  },
  {
    kind: 'choice',
    id: 'draft-default',
    prompt:
      'You ran gh stack submit --auto and every new PR came out a draft. Which flag was missing?',
    options: ['--open', '--ready', 'None — drafts are what --auto means'],
    correct: 0,
    note: 'New PRs are drafts unless --open comes along; --auto only skips the editor.',
  },
  {
    kind: 'typed',
    id: 'go-down',
    prompt:
      "You're at the top of the stack and need the branch one layer nearer trunk. Which command?",
    accept: ['gh stack down', 'down'],
    answer: 'gh stack down',
    note: 'up moves away from trunk — and every move skips branches whose PR has merged.',
  },
  {
    kind: 'recall',
    id: 'view-glyphs',
    prompt: 'In gh stack view, what do ✓ ◎ ○ and ⚠ each mean?',
    answer: '✓ merged, ◎ queued, ○ open, ⚠ needs rebase',
    note: '⚠ is the nudge to run gh stack rebase or sync before it bites.',
  },
];
