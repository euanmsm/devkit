// What an exercise is, and how an answer is judged.
//
// Three formats, chosen so that strict answer-matching — the thing that ruins
// practice tools — is needed almost nowhere. `recall` does no matching at all,
// `choice` matches a letter, and `typed` is reserved for answers with
// essentially one form. The rule that keeps typed honest: if an exercise needs
// a third accept pattern, it wanted to be a recall card.
//
// Phase 4 adds a fourth member to this union for sandboxes. Nothing here
// changes shape for it.

/**
 * One question, in one of three formats.
 *
 * @typedef {(
 *   // Prompt, think, reveal, grade yourself. No matching.
 *   | { kind: "recall"; id: string; prompt: string; answer: string; note: string }
 *   // For two things that are genuinely confusable.
 *   | {
 *       kind: "choice";
 *       id: string;
 *       prompt: string;
 *       options: string[];
 *       // Index into `options`.
 *       correct: number;
 *       note: string;
 *     }
 *   // Only where the answer is one short string.
 *   | {
 *       kind: "typed";
 *       id: string;
 *       prompt: string;
 *       // Normalised forms that count as right.
 *       accept: string[];
 *       // How the answer is shown back, spelled properly.
 *       answer: string;
 *       note: string;
 *     }
 * )} Exercise
 */

/** The answer as it should be displayed once revealed. */
export function modelAnswer(exercise) {
  return exercise.kind === 'choice'
    ? exercise.options[exercise.correct]
    : exercise.answer;
}

/**
 * One spelling for the many ways a keystroke gets written: `Ctrl-A`, `ctrl a`,
 * `^A` and `C-a` are the same answer, and nobody should lose a card to a
 * hyphen. Everything is lowercased, punctuation between words is flattened to
 * a single space, and the ctrl/alt prefixes are spelled out.
 */
export function normalise(input) {
  return input
    .trim()
    .toLowerCase()
    .replace(/^\^/, 'ctrl ')
    .replace(/\bc-/g, 'ctrl ')
    .replace(/\bm-/g, 'alt ')
    .replace(/\bmeta\b/g, 'alt')
    .replace(/\bcontrol\b/g, 'ctrl')
    .replace(/[-_+]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Whether a typed or chosen answer is right. `recall` is never judged here —
 * the user grades themselves, which is the whole point of the format — so it
 * returns null and the session asks.
 */
export function judge(exercise, answer) {
  switch (exercise.kind) {
    case 'recall':
      return null;
    case 'choice': {
      // "b", "B" or "2" all pick the second option.
      const trimmed = answer.trim().toLowerCase();
      const byLetter = trimmed.charCodeAt(0) - 'a'.charCodeAt(0);
      const byNumber = Number(trimmed) - 1;
      const picked = /^[a-z]$/.test(trimmed)
        ? byLetter
        : /^\d+$/.test(trimmed)
          ? byNumber
          : -1;
      return picked === exercise.correct;
    }
    case 'typed': {
      const given = normalise(answer);
      return (
        given.length > 0 &&
        exercise.accept.some((accepted) => normalise(accepted) === given)
      );
    }
  }
}

/** The letters shown against a choice question: a, b, c… */
export const optionLetter = (index) =>
  String.fromCharCode('a'.charCodeAt(0) + index);
