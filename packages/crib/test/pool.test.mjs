// Which questions a run gets: read lessons only, fresh ones first, and what
// the scheduler says is due.

import { deepEqual, equal, ok } from 'node:assert/strict';
import { describe, it } from 'node:test';
import { shell } from '../src/learn/courses/shell/index.mjs';
import {
  drillPool,
  liveKeys,
  practiceCount,
  practicePool,
  SESSION_LIMIT,
} from '../src/learn/pool.mjs';

const TODAY = '2026-08-14';
const empty = { version: 1, read: {}, cards: {} };
const card = (due) => ({ box: 1, due, seen: 1, right: 1 });

const readOnly = (...lessons) => ({
  version: 1,
  read: Object.fromEntries(lessons.map((l) => [`shell/${l}`, TODAY])),
  cards: {},
});

describe("practice draws on what you've read", () => {
  it('offers nothing before a lesson is read', () => {
    equal(practiceCount(shell, empty), 0);
    deepEqual(practicePool(shell, empty), []);
  });

  it("counts only the read lessons' exercises", () => {
    const one = practiceCount(shell, readOnly('line-editor'));
    const both = practiceCount(shell, readOnly('line-editor', 'history'));
    ok(one > 0, 'a read lesson should offer exercises');
    ok(both > one, 'reading the second lesson should add its exercises');
  });

  it('asks only about the lesson that was read', () => {
    const pool = practicePool(shell, readOnly('history'));
    ok(pool.length > 0);
    ok(
      pool.every((q) => q.key.startsWith('shell/history/')),
      'an unread lesson leaked into the pool',
    );
  });
});

describe('ordering and length', () => {
  it('puts unpractised questions before ones already seen', () => {
    const progress = readOnly('line-editor');
    const [first] = practicePool(shell, progress);
    // Practise that first question, then it should fall behind the rest.
    progress.cards[first.key] = card('2026-12-01');
    const after = practicePool(shell, progress);
    equal(after.at(-1).key, first.key);
  });

  it('keeps a session short enough to finish', () => {
    const progress = readOnly('line-editor', 'history');
    ok(
      practiceCount(shell, progress) > SESSION_LIMIT,
      'need a big enough pool',
    );
    equal(practicePool(shell, progress).length, SESSION_LIMIT);
  });
});

describe('drills take what is due', () => {
  it('returns nothing when nothing has been practised', async () => {
    deepEqual(await drillPool(empty, TODAY), []);
  });

  it('returns due cards and skips ones not yet ripe', async () => {
    const keys = [...(await liveKeys())];
    const progress = {
      version: 1,
      read: {},
      cards: { [keys[0]]: card(TODAY), [keys[1]]: card('2026-12-01') },
    };
    const pool = await drillPool(progress, TODAY);
    deepEqual(
      pool.map((q) => q.key),
      [keys[0]],
    );
  });

  it('ignores a card whose exercise has been renamed away', async () => {
    const progress = {
      version: 1,
      read: {},
      cards: { 'shell/history/gone-away': card(TODAY) },
    };
    deepEqual(await drillPool(progress, TODAY), []);
  });

  it('narrows to one course when asked', async () => {
    const keys = [...(await liveKeys())];
    const progress = {
      version: 1,
      read: {},
      cards: { [keys[0]]: card(TODAY) },
    };
    deepEqual(await drillPool(progress, TODAY, 'nosuch'), []);
    equal((await drillPool(progress, TODAY, 'shell')).length, 1);
  });
});

describe('live keys', () => {
  it('names every exercise in every course, course/lesson/id', async () => {
    const keys = await liveKeys();
    ok(keys.size > 0);
    for (const key of keys)
      ok(key.split('/').length === 3, `${key} is not a course/lesson/id key`);
  });
});
