// Working out which topic someone meant. The same rules serve the learn side
// for courses and lessons, which is why the functions only ask for a name.

/**
 * @typedef {(
 *   | { status: "found"; name: string }
 *   | { status: "unknown" }
 *   | { status: "ambiguous"; matches: string[] }
 * )} Resolution
 */

/** Strips a leading `--` and lowercases, so `--PR`, `--pr` and `pr` all agree. */
export function normalise(input) {
  return input.replace(/^--/, '').toLowerCase();
}

/**
 * An exact name wins. Failing that, a prefix matching exactly one topic wins,
 * so `--br` finds `browse`. A prefix matching several is reported rather than
 * guessed at.
 */
export function resolveTopic(topics, input) {
  const want = normalise(input);
  if (topics.some((t) => t.name === want))
    return { status: 'found', name: want };

  const matches = topics
    .filter((t) => t.name.startsWith(want))
    .map((t) => t.name);
  if (matches.length === 1) return { status: 'found', name: matches[0] };
  if (matches.length > 1) return { status: 'ambiguous', matches };
  return { status: 'unknown' };
}

/** `--all` and `all` both mean the whole guide. */
export function isAll(input) {
  return normalise(input) === 'all';
}
