// When a card comes back.
//
// Leitner boxes: five of them, each with a longer interval than the last. Get
// a card right and it moves up a box, so you see it less often; get it wrong
// and it drops to box one and comes back tomorrow. That is the whole
// algorithm. SM-2 and its descendants tune an ease factor per card, and that
// sophistication is not worth its complexity for a deck this size.
//
// Everything here is a pure function of (cards, today) — today is passed in,
// never read from the clock — so the whole thing is table-testable and
// `crib drill` never has to think.

/** Days until a card in each box comes back. Index 0 is unused; boxes are 1-5. */
const INTERVALS = [0, 1, 3, 7, 21, 56];

export const TOP_BOX = 5;

/**
 * Sandboxes cost minutes rather than seconds, so they stop climbing sooner —
 * seeing one every three weeks is plenty. Phase 4 builds the format; the rule
 * lives here now so adding it changes no scheduling code.
 */
const SANDBOX_TOP_BOX = 4;

/**
 * A date-only string, YYYY-MM-DD, the form the progress file stores.
 *
 * @typedef {string} Day
 */

/** `days` after `from`, as another YYYY-MM-DD. */
export function addDays(from, days) {
  const date = new Date(`${from}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * The card after an answer. Right moves up a box (to that format's ceiling),
 * wrong goes back to box 1 — no half-steps, because a card you missed is a
 * card you don't know.
 */
export function afterAnswer(card, right, today, isSandbox = false) {
  const seen = (card?.seen ?? 0) + 1;
  const correct = (card?.right ?? 0) + (right ? 1 : 0);
  const ceiling = isSandbox ? SANDBOX_TOP_BOX : TOP_BOX;
  const box = right ? Math.min((card?.box ?? 0) + 1, ceiling) : 1;
  return { box, due: addDays(today, INTERVALS[box]), seen, right: correct };
}

/** Whether a card is ready to be asked again. */
export const isDue = (card, today) => card.due <= today;

/**
 * The keys due on `today`, oldest first so the most overdue comes back
 * soonest. Ties keep their map order, which is stable across runs.
 */
export function due(cards, today) {
  return Object.entries(cards)
    .filter(([, card]) => isDue(card, today))
    .sort(([, a], [, b]) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0))
    .map(([key]) => key);
}
