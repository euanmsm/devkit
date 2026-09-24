// The progress file: round-trips, and fails soft in every direction.

import { deepEqual, doesNotThrow, equal, match } from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  loadProgress,
  markRead,
  prune,
  recordAnswer,
  statePath,
} from '../src/learn/progress.mjs';

const scratch = () => ({
  CRIB_STATE: join(mkdtempSync(join(tmpdir(), 'crib-test-')), 'progress.json'),
});

describe('statePath', () => {
  it('prefers CRIB_STATE, then XDG_STATE_HOME, then the home directory', () => {
    equal(statePath({ CRIB_STATE: '/x/p.json' }), '/x/p.json');
    equal(
      statePath({ XDG_STATE_HOME: '/x/state' }),
      '/x/state/crib/progress.json',
    );
    match(statePath({}), /\.local\/state\/crib\/progress\.json$/);
  });
});

describe('marking a lesson read', () => {
  it('round-trips through the file, creating directories on the way', () => {
    const env = scratch();
    markRead(env, 'shell/history', '2026-08-14');
    deepEqual(loadProgress(env), {
      version: 1,
      read: { 'shell/history': '2026-08-14' },
      cards: {},
    });
  });

  it('keeps the date of the first read', () => {
    const env = scratch();
    markRead(env, 'shell/history', '2026-08-14');
    markRead(env, 'shell/history', '2026-09-01');
    equal(loadProgress(env).read['shell/history'], '2026-08-14');
  });

  it('writes JSON a person can open', () => {
    const env = scratch();
    markRead(env, 'shell/history', '2026-08-14');
    match(readFileSync(env.CRIB_STATE, 'utf8'), /"shell\/history"/);
  });
});

describe('recording an answer', () => {
  it('schedules a new card and keeps it beside the read markers', () => {
    const env = scratch();
    markRead(env, 'shell/history', '2026-08-14');
    recordAnswer(env, 'shell/history/hist-bang-dollar', true, '2026-08-14');
    const progress = loadProgress(env);
    deepEqual(progress.read, { 'shell/history': '2026-08-14' });
    deepEqual(progress.cards['shell/history/hist-bang-dollar'], {
      box: 1,
      due: '2026-08-15',
      seen: 1,
      right: 1,
    });
  });

  it('moves an existing card along rather than starting it over', () => {
    const env = scratch();
    const key = 'shell/history/hist-bang-dollar';
    recordAnswer(env, key, true, '2026-08-14');
    recordAnswer(env, key, true, '2026-08-15');
    deepEqual(loadProgress(env).cards[key], {
      box: 2,
      due: '2026-08-18',
      seen: 2,
      right: 2,
    });
  });

  it('drops cards whose exercise has gone', () => {
    const env = scratch();
    recordAnswer(env, 'shell/history/still-here', true, '2026-08-14');
    recordAnswer(env, 'shell/history/renamed-away', true, '2026-08-14');
    prune(env, new Set(['shell/history/still-here']));
    deepEqual(Object.keys(loadProgress(env).cards), [
      'shell/history/still-here',
    ]);
  });
});

describe('failing soft', () => {
  const empty = { version: 1, read: {}, cards: {} };

  it('starts fresh from a corrupt file', () => {
    const env = scratch();
    writeFileSync(env.CRIB_STATE, '{ not json');
    deepEqual(loadProgress(env), empty);
  });

  it('starts fresh from a file of the wrong shape', () => {
    const env = scratch();
    writeFileSync(env.CRIB_STATE, JSON.stringify({ read: null }));
    deepEqual(loadProgress(env), empty);
  });

  // A file written before cards existed must still give up its ✓ marks.
  it('reads an older file that has no cards at all', () => {
    const env = scratch();
    writeFileSync(
      env.CRIB_STATE,
      JSON.stringify({ version: 1, read: { 'shell/history': '2026-08-01' } }),
    );
    deepEqual(loadProgress(env), {
      version: 1,
      read: { 'shell/history': '2026-08-01' },
      cards: {},
    });
  });

  it('never throws for an unwritable path', () => {
    const env = { CRIB_STATE: '/dev/null/nope/progress.json' };
    doesNotThrow(() => markRead(env, 'shell/history', '2026-08-14'));
    doesNotThrow(() => recordAnswer(env, 'a/b/c', true, '2026-08-14'));
    deepEqual(loadProgress(env), empty);
  });
});
