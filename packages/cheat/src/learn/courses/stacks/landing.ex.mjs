export const landingExercises = [
  {
    kind: 'choice',
    id: 'mid-stack-merge',
    prompt:
      "PR two of your stack is approved and green; PR one below it isn't ready. Can you merge PR two alone?",
    options: [
      "Yes — any PR can merge once it's green",
      'No — everything below merges with it, all or nothing',
      'Yes, but it retargets trunk first',
    ],
    correct: 1,
    note: "Stacks land bottom-up in contiguous groups; if any PR in the group can't merge, none do.",
  },
  {
    kind: 'recall',
    id: 'merge-cmd',
    prompt:
      'Land the whole stack from the terminal, squashed, with no wizard and no confirmation?',
    answer: 'gh stack merge -y --squash',
    note: 'Given a bare number, merge reads it as a stack number first, then as a PR.',
  },
  {
    kind: 'choice',
    id: 'after-bottom-merges',
    prompt:
      'The bottom PR of the stack merges. What happens to the PR above it?',
    options: [
      'It waits for you to rebase it manually',
      'GitHub retargets it onto trunk — it becomes the new bottom',
      'It closes and must be reopened',
    ],
    correct: 1,
    note: 'The remote side shuffles down by itself; your clone still needs gh stack sync.',
  },
  {
    kind: 'recall',
    id: 'cleanup',
    prompt:
      "Two PRs merged on GitHub. One command to fast-forward trunk, rebase what's left, push, and delete the merged local branches?",
    answer: 'gh stack sync --prune',
    note: '--prune is the part that removes the local branches of merged PRs.',
  },
  {
    kind: 'choice',
    id: 'merge-queue',
    prompt:
      'The base branch has a merge queue. What happens when you merge a stack into it?',
    options: [
      'The stack bypasses the queue',
      "The queue takes the stack's PRs in order",
      "Stacks can't merge into a queued branch",
    ],
    correct: 1,
    note: "And if one PR is ejected, everything above it leaves the queue too. Auto-merge, though, isn't supported for stacks.",
  },
  {
    kind: 'choice',
    id: 'unstack-effect',
    prompt:
      'You unstack a five-PR stack. What happens to the PRs and branches?',
    options: [
      "They're deleted along with the stack",
      'They stay — they just stop being linked as a stack',
      'Open PRs close; merged ones stay',
    ],
    correct: 1,
    note: 'Nothing is deleted. --local only forgets the stack on your machine and leaves GitHub alone.',
  },
];
