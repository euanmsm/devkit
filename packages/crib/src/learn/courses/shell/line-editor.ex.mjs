export const lineEditorExercises = [
  {
    kind: 'typed',
    id: 'start-of-line',
    prompt:
      'Your cursor is at the end of a long command and the typo is in the first word. One keystroke to get there?',
    accept: ['ctrl-a'],
    answer: 'Ctrl-A',
    note: 'Ctrl-E goes back to the end.',
  },
  {
    kind: 'choice',
    id: 'delete-word',
    prompt: 'Which one deletes only the word behind the cursor?',
    options: ['Ctrl-U', 'Ctrl-W', 'Ctrl-K', 'Ctrl-Y'],
    correct: 1,
    note: 'Ctrl-U takes everything back to the start of the line, not one word.',
  },
  {
    kind: 'choice',
    id: 'kill-direction',
    prompt:
      "You want to throw away the rest of the line ahead of the cursor and keep what's behind it. Which way round?",
    options: ['Ctrl-U', 'Ctrl-K'],
    correct: 1,
    note: 'K for the end, U for the start — the pair people mix up most.',
  },
  {
    kind: 'recall',
    id: 'paste-back',
    prompt:
      'You wiped the line with Ctrl-U to run something else. How do you get what you were typing back?',
    answer: 'Ctrl-Y',
    note: 'Deletes go to a buffer, not the void — Ctrl-U then Ctrl-Y is how you set a half-typed command aside.',
  },
  {
    kind: 'typed',
    id: 'word-back',
    prompt: 'Move the cursor back one whole word — which keystroke?',
    accept: ['alt-b'],
    answer: 'Alt-B',
    note: 'Alt-F goes forward. Two of these beat fifteen taps of the left arrow.',
  },
  {
    kind: 'recall',
    id: 'edit-in-editor',
    prompt:
      'A twelve-line command is mangled beyond fixing at the prompt. How do you open it in $EDITOR?',
    answer: 'Ctrl-X Ctrl-E',
    note: 'Save and quit, and the shell runs whatever you left behind.',
  },
  {
    kind: 'choice',
    id: 'clear-keeps-line',
    prompt:
      "You're halfway through typing a command and the screen is full of noise. Which clears it without losing what you've typed?",
    options: ['Ctrl-C then clear', 'Ctrl-L', 'Ctrl-U then clear'],
    correct: 1,
    note: 'The other two throw the line away first — Ctrl-L keeps it.',
  },
];
