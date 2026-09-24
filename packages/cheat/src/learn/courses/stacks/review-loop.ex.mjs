export const reviewLoopExercises = [
  {
    kind: 'recall',
    id: 'mid-stack-fix',
    prompt:
      "A reviewer wants a change in layer two of your four-layer stack; you're at the top. The whole routine?",
    answer:
      'gh stack down to the branch, commit the fix, gh stack rebase --upstack, gh stack push',
    note: 'Fix it in the layer it belongs to and cascade up — never patch it at the top.',
  },
  {
    kind: 'choice',
    id: 'upstack-direction',
    prompt:
      "You've committed a fix mid-stack. Which flag rebases the layers above onto it?",
    options: ['--downstack', '--upstack', '--no-trunk'],
    correct: 1,
    note: '--downstack is trunk up to here; --no-trunk skips trunk entirely. Bare rebase does the whole chain.',
  },
  {
    kind: 'choice',
    id: 'everything-move',
    prompt:
      'Trunk moved and one of your PRs merged on GitHub; your clone is stale. One command to fetch, rebase, push and reconcile the PRs?',
    options: [
      'gh stack rebase',
      'gh stack sync',
      'gh stack push',
      'gh stack submit',
    ],
    correct: 1,
    note: 'rebase stays local, push only publishes, submit opens PRs — sync is the everything move.',
  },
  {
    kind: 'recall',
    id: 'conflict',
    prompt: 'gh stack rebase has stopped on a conflict. What now?',
    answer:
      'Fix the files, git add them, gh stack rebase --continue — or --abort to restore every branch',
    note: "sync rolls the whole run back on conflict; the pause-and-continue loop is rebase's alone.",
  },
  {
    kind: 'choice',
    id: 'signed-commits',
    prompt:
      'Your repo requires signed commits and a stack needs rebasing. Where must the rebase run?',
    options: [
      "GitHub's Rebase stack button",
      'Locally, with gh stack rebase',
      'Either — the result is identical',
    ],
    correct: 1,
    note: "Server-side rebases aren't signed, so a signed-commits rule forces the local route.",
  },
  {
    kind: 'recall',
    id: 'restructure',
    prompt:
      'Review verdict: layer three should be two PRs. Which command reshapes the stack, and what must follow it?',
    answer: 'gh stack modify — then gh stack submit so the PRs catch up',
    note: 'modify drops, folds, inserts, reorders and renames; Ctrl+S applies the lot.',
  },
  {
    kind: 'choice',
    id: 'approval-cost',
    prompt:
      'You rebase after a mid-stack fix. What happens to the already-approved PRs above it?',
    options: [
      "Their approvals stand — they didn't change",
      "They're rebased too and their checks re-run",
      "They're closed and reopened fresh",
    ],
    correct: 1,
    note: 'Changing a layer changes the foundations of everything above — re-review is the honest price.',
  },
];
