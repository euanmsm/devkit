export const theIdeaExercises = [
  {
    kind: 'choice',
    id: 'layer-diff',
    prompt:
      "You open the third PR of a four-PR stack to review it. What's in its diff?",
    options: [
      'Every change since trunk',
      "Only that layer's own changes",
      'That layer plus the two below it',
    ],
    correct: 1,
    note: 'One layer per PR is the whole point — the layers below have their own PRs.',
  },
  {
    kind: 'recall',
    id: 'pr-bases',
    prompt:
      'A stack is auth, api, ui, bottom to top. Which base does each PR target?',
    answer: 'auth → main (the trunk), api → auth, ui → api',
    note: 'Only the bottom sits on trunk; everything else targets the branch below it.',
  },
  {
    kind: 'choice',
    id: 'cross-fork',
    prompt:
      'A contributor offers a branch from their fork as the next layer. Will GitHub stack it?',
    options: [
      'Yes, forks work like any branch',
      'Only if the fork is in the same organisation',
      'No — every branch in a stack must live in the same repository',
    ],
    correct: 2,
    note: "Cross-fork stacks aren't supported, full stop.",
  },
  {
    kind: 'choice',
    id: 'protection-scope',
    prompt:
      'main requires a review and green CI. In a five-PR stack, which PRs do those rules bind?',
    options: [
      "Only the bottom one, since it's the one on main",
      'Every PR in the stack',
      'Only whichever PR you merge',
    ],
    correct: 1,
    note: 'A stack is smaller reviews, not fewer rules — protection and checks run on every layer.',
  },
  {
    kind: 'choice',
    id: 'cascade',
    prompt:
      'You push new commits to the bottom branch of a stack. What happens to the branches above?',
    options: [
      'Nothing until you merge',
      'Each is rebased onto the one below, and their checks re-run',
      'Their PRs close and must be reopened',
    ],
    correct: 1,
    note: 'The cascading rebase is the machinery everything else rests on.',
  },
  {
    kind: 'recall',
    id: 'install',
    prompt:
      'On a fresh machine, gh says `stack` is an unknown command. What gets it?',
    answer: 'gh extension install github/gh-stack',
    note: "It's an extension, not built in — gh extension upgrade gh-stack updates it.",
  },
];
