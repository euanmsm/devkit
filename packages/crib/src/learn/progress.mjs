// What you've read, remembered between runs.
//
// One JSON file, read whole and rewritten whole — it will never hold more
// than a few hundred keys. It is a convenience, not a database: a missing or
// corrupt file means starting fresh, an unwritable path means the markers
// silently don't persist, and nothing in here is allowed to crash a screen.
//
// Phase 4 adds nothing here: a sandbox card is a card.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAnswer } from './scheduler.mjs';

/**
 * One practised exercise, and when it comes back.
 *
 * @typedef {object} Card
 * @property {number} box Leitner box, 1-5. Higher means seen less often.
 * @property {Day} due The day it is next due, YYYY-MM-DD.
 * @property {number} seen
 * @property {number} right
 */

/**
 * Everything the state file remembers.
 *
 * @typedef {object} Progress
 * @property {1} version
 * @property {Record<string, string>} read `course/lesson` → the date it was first read, as YYYY-MM-DD.
 * @property {Record<string, Card>} cards `course/lesson/exercise-id` → its schedule.
 */

/**
 * ~/.local/state/crib/progress.json, honouring XDG_STATE_HOME. CRIB_STATE
 * overrides the whole path, which is how the tests stay out of a real home.
 */
export function statePath(env) {
  const override = env['CRIB_STATE'];
  if (override) return override;
  const base = env['XDG_STATE_HOME'] || join(homedir(), '.local', 'state');
  return join(base, 'crib', 'progress.json');
}

/** A map of the right shape, or an empty one — never a crash. */
const mapOf = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? { ...value }
    : {};

/**
 * The saved progress, or a fresh start when there isn't any to be had. Each
 * half is validated on its own, so a file written before cards existed still
 * gives up its read markers.
 */
export function loadProgress(env) {
  try {
    const raw = JSON.parse(readFileSync(statePath(env), 'utf8'));
    if (raw !== null && typeof raw === 'object')
      return {
        version: 1,
        read: mapOf(raw.read),
        cards: mapOf(raw.cards),
      };
  } catch {
    // Missing, unreadable or not JSON — all mean the same thing: no progress.
  }
  return { version: 1, read: {}, cards: {} };
}

/** Writes the whole file, swallowing every failure. */
function save(env, progress) {
  try {
    const path = statePath(env);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(progress, null, 2) + '\n');
  } catch {
    // An unwritable state file loses the record, never the screen.
  }
}

/**
 * Records that a lesson was printed, keyed `course/lesson`, keeping the date
 * of the first read. All we can know is that it went to the screen — the
 * README says "read" and means exactly that much.
 */
export function markRead(env, key, date) {
  const progress = loadProgress(env);
  if (progress.read[key]) return;
  progress.read[key] = date;
  save(env, progress);
}

/**
 * Records how an exercise went and schedules its return. Keyed
 * `course/lesson/exercise-id`, so renaming an id orphans its history — which
 * is why `prune` exists.
 */
export function recordAnswer(env, key, right, today, isSandbox = false) {
  const progress = loadProgress(env);
  progress.cards[key] = afterAnswer(
    progress.cards[key],
    right,
    today,
    isSandbox,
  );
  save(env, progress);
}

/**
 * Drops cards whose exercise no longer exists, so a renamed or deleted
 * exercise doesn't sit in the deck forever with nothing to ask.
 */
export function prune(env, live) {
  const progress = loadProgress(env);
  const dead = Object.keys(progress.cards).filter((key) => !live.has(key));
  if (dead.length === 0) return;
  for (const key of dead) delete progress.cards[key];
  save(env, progress);
}
