// Whole practice sessions, scripted: what the transcript says, what gets
// recorded, and what happens when someone walks out halfway.

import { deepEqual, equal, match, ok } from 'node:assert/strict';
import { describe, it } from 'node:test';
import { scriptedAsk } from '../src/learn/ask.mjs';
import { runSession } from '../src/learn/session.mjs';
import { makePaint } from '../src/render/theme.mjs';

const plain = makePaint(false);

const questions = [
  {
    key: 'shell/line-editor/start-of-line',
    exercise: {
      kind: 'typed',
      id: 'start-of-line',
      prompt: 'Cursor to the start of the line — which keystroke?',
      accept: ['ctrl-a'],
      answer: 'Ctrl-A',
      note: 'Ctrl-E returns to the end.',
    },
  },
  {
    key: 'shell/line-editor/delete-word',
    exercise: {
      kind: 'choice',
      id: 'delete-word',
      prompt: 'Which deletes the whole word behind the cursor?',
      options: ['Ctrl-U', 'Ctrl-W', 'Ctrl-K'],
      correct: 1,
      note: 'Ctrl-U takes everything to the start of line, not one word.',
    },
  },
  {
    key: 'shell/history/substitute',
    exercise: {
      kind: 'recall',
      id: 'substitute',
      prompt: 'Rerun the previous command, substituting one word',
      answer: '^old^new',
      note: 'Only replaces the first occurrence.',
    },
  },
];

/** Run a session with scripted answers, returning transcript and records. */
async function play(answers, asked = questions) {
  const io = scriptedAsk(answers);
  const recorded = [];
  const result = await runSession(
    io,
    plain,
    80,
    'Practising shell',
    asked,
    (key, right) => recorded.push([key, right]),
  );
  return { result, recorded, text: io.output() };
}

describe('a session answered correctly', () => {
  it('records every question right', async () => {
    const { result, recorded } = await play(['ctrl-a', 'b', '', 'y']);
    deepEqual(result, { asked: 3, right: 3, cancelled: false });
    deepEqual(recorded, [
      ['shell/line-editor/start-of-line', true],
      ['shell/line-editor/delete-word', true],
      ['shell/history/substitute', true],
    ]);
  });

  it('numbers the questions and letters the options', async () => {
    const { text } = await play(['ctrl-a', 'b', '', 'y']);
    match(text, /1\/3\s+Cursor to the start/);
    match(text, /2\/3\s+Which deletes/);
    match(text, /a\) Ctrl-U/);
    match(text, /b\) Ctrl-W/);
  });

  it('ends by saying what happens next', async () => {
    const { text } = await play(['ctrl-a', 'b', '', 'y']);
    match(text, /All 3 right\. They come back further out\./);
  });
});

describe('a wrong answer', () => {
  it('shows the answer and the note immediately, and records the miss', async () => {
    const { result, recorded, text } = await play(['ctrl-e', 'a', '', 'n']);
    deepEqual(result, { asked: 3, right: 0, cancelled: false });
    equal(
      recorded.every(([, right]) => right === false),
      true,
    );
    match(text, /Ctrl-A/);
    match(text, /Ctrl-E returns to the end\./);
    match(text, /takes everything to the start of line/);
  });

  it('never gives a second attempt at the same question', async () => {
    // Four answers for three questions: a fourth is only consumed if the
    // session re-asks, which it must not.
    const { result } = await play(['ctrl-e', 'b', '', 'y']);
    equal(result.asked, 3);
    equal(result.right, 2);
  });

  it('counts the misses in the summary', async () => {
    const { text } = await play(['ctrl-e', 'b', '', 'y']);
    match(text, /2 of 3 — the one you missed comes back tomorrow\./);
  });
});

describe('recall cards', () => {
  it("reveals the answer, then takes the user's own grade", async () => {
    const { recorded, text } = await play(['ctrl-a', 'b', '', 'n']);
    match(text, /\(enter to reveal\)/);
    match(text, /\^old\^new/);
    match(text, /Did you have it\? \[y\/n\]/);
    deepEqual(recorded.at(-1), ['shell/history/substitute', false]);
  });

  it('takes anything starting with y as yes', async () => {
    const { recorded } = await play(['ctrl-a', 'b', '', 'Yes']);
    deepEqual(recorded.at(-1), ['shell/history/substitute', true]);
  });
});

describe('walking out', () => {
  it('keeps what was answered and says so', async () => {
    // Two answers, three questions: the third ask finds the script empty.
    const { result, recorded, text } = await play(['ctrl-a', 'b']);
    deepEqual(result, { asked: 2, right: 2, cancelled: true });
    equal(recorded.length, 2);
    match(text, /Stopped — what you answered is kept\./);
    ok(!text.includes('come back tomorrow'), 'no summary after cancelling');
  });
});

describe('fitting the terminal', () => {
  it('wraps a long prompt under its own number', async () => {
    const long = [
      {
        key: 'k/l/long',
        exercise: {
          kind: 'typed',
          id: 'long',
          prompt:
            'Your cursor sits at the very end of a long command line and the typo you need to fix is in the first word of it — which single keystroke takes you there?',
          accept: ['ctrl-a'],
          answer: 'Ctrl-A',
          note: 'n',
        },
      },
    ];
    const { text } = await play(['ctrl-a'], long);
    for (const line of text.split('\n'))
      ok([...line].length <= 80, `overflows: ${line}`);
  });
});
