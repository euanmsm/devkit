// Answer judging: the normalisation table, choice by letter, and recall
// never being judged automatically.

import { equal } from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  judge,
  modelAnswer,
  normalise,
  optionLetter,
} from '../src/learn/exercise.mjs';

const recall = {
  kind: 'recall',
  id: 'r',
  prompt: 'p',
  answer: '^old^new',
  note: 'n',
};

const choice = {
  kind: 'choice',
  id: 'c',
  prompt: 'p',
  options: ['Ctrl-U', 'Ctrl-W', 'Ctrl-K'],
  correct: 1,
  note: 'n',
};

const typed = {
  kind: 'typed',
  id: 't',
  prompt: 'p',
  accept: ['ctrl-a'],
  answer: 'Ctrl-A',
  note: 'n',
};

describe('normalise', () => {
  // Every one of these is the same keystroke written the way someone might.
  const sameAsCtrlA = [
    'ctrl-a',
    'Ctrl-A',
    '  CTRL-A  ',
    'ctrl a',
    'ctrl_a',
    'ctrl+a',
    '^a',
    'C-a',
    'control-a',
  ];

  for (const written of sameAsCtrlA)
    it(`reads ${JSON.stringify(written)} as ctrl a`, () => {
      equal(normalise(written), 'ctrl a');
    });

  it('spells the alt forms one way too', () => {
    equal(normalise('M-b'), 'alt b');
    equal(normalise('Meta-B'), 'alt b');
  });

  it("leaves things that aren't keystrokes alone", () => {
    equal(normalise('  git   reflog '), 'git reflog');
  });
});

describe('judging a typed answer', () => {
  it('accepts every spelling of what it wants', () => {
    for (const written of ['ctrl-a', 'Ctrl-A', '^a', 'C-a'])
      equal(judge(typed, written), true, written);
  });

  it('rejects a different key', () => {
    equal(judge(typed, 'ctrl-e'), false);
  });

  it('rejects an empty answer rather than counting it right', () => {
    equal(judge(typed, ''), false);
    equal(judge(typed, '   '), false);
  });
});

describe('judging a choice', () => {
  it('takes the letter, in either case', () => {
    equal(judge(choice, 'b'), true);
    equal(judge(choice, 'B'), true);
    equal(judge(choice, ' b '), true);
  });

  it('takes the number too, counting from one', () => {
    equal(judge(choice, '2'), true);
    equal(judge(choice, '1'), false);
  });

  it('rejects a wrong letter and anything unreadable', () => {
    equal(judge(choice, 'a'), false);
    equal(judge(choice, 'banana'), false);
    equal(judge(choice, ''), false);
  });
});

describe('recall', () => {
  it('is never judged automatically — the user grades themselves', () => {
    equal(judge(recall, '^old^new'), null);
    equal(judge(recall, 'nonsense'), null);
  });
});

describe('showing the answer', () => {
  it('gives the model answer for each format', () => {
    equal(modelAnswer(recall), '^old^new');
    equal(modelAnswer(typed), 'Ctrl-A');
    equal(modelAnswer(choice), 'Ctrl-W');
  });

  it('letters the options from a', () => {
    equal(optionLetter(0), 'a');
    equal(optionLetter(2), 'c');
  });
});
