// The Leitner boxes: where a card lands after an answer, and what's due.

import { deepEqual, equal } from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addDays, afterAnswer, due, isDue } from '../src/learn/scheduler.mjs';

const TODAY = '2026-08-14';

describe('addDays', () => {
  it('counts forward, across a month boundary', () => {
    equal(addDays(TODAY, 1), '2026-08-15');
    equal(addDays(TODAY, 21), '2026-09-04');
  });

  it('survives a leap day', () => {
    equal(addDays('2028-02-28', 1), '2028-02-29');
  });
});

describe('a right answer', () => {
  it('starts a new card in box 1, back tomorrow', () => {
    deepEqual(afterAnswer(undefined, true, TODAY), {
      box: 1,
      due: '2026-08-15',
      seen: 1,
      right: 1,
    });
  });

  // The whole ladder, so a changed interval fails here rather than silently.
  const ladder = [
    [2, '2026-08-17'],
    [3, '2026-08-21'],
    [4, '2026-09-04'],
    [5, '2026-10-09'],
  ];

  for (const [box, nextDue] of ladder)
    it(`moves a box ${box - 1} card up to box ${box}, due ${nextDue}`, () => {
      const card = { box: box - 1, due: TODAY, seen: 3, right: 3 };
      deepEqual(afterAnswer(card, true, TODAY), {
        box,
        due: nextDue,
        seen: 4,
        right: 4,
      });
    });

  it('holds a top-box card at eight weeks rather than climbing further', () => {
    const card = { box: 5, due: TODAY, seen: 9, right: 9 };
    deepEqual(afterAnswer(card, true, TODAY), {
      box: 5,
      due: '2026-10-09',
      seen: 10,
      right: 10,
    });
  });

  it('caps a sandbox card lower — they cost minutes, not seconds', () => {
    const card = { box: 4, due: TODAY, seen: 4, right: 4 };
    equal(afterAnswer(card, true, TODAY, true).box, 4);
    equal(afterAnswer(card, true, TODAY, false).box, 5);
  });
});

describe('a wrong answer', () => {
  it('drops any card to box 1, back tomorrow', () => {
    const card = { box: 5, due: TODAY, seen: 9, right: 9 };
    deepEqual(afterAnswer(card, false, TODAY), {
      box: 1,
      due: '2026-08-15',
      seen: 10,
      right: 9,
    });
  });
});

describe("what's due", () => {
  const cards = {
    overdue: { box: 2, due: '2026-08-01', seen: 1, right: 1 },
    today: { box: 1, due: TODAY, seen: 1, right: 1 },
    later: { box: 3, due: '2026-12-01', seen: 1, right: 1 },
  };

  it('counts a card due today as due', () => {
    equal(isDue(cards['today'], TODAY), true);
    equal(isDue(cards['later'], TODAY), false);
  });

  it('returns the due keys, most overdue first', () => {
    deepEqual(due(cards, TODAY), ['overdue', 'today']);
  });

  it('returns nothing when nothing is ready', () => {
    deepEqual(due(cards, '2026-01-01'), []);
  });
});
