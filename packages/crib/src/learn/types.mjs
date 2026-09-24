// The shape of a course. Everything under src/learn/courses/ is data in these
// types; nothing there knows how it will be printed — the same rule the
// guides live by.

/**
 * One readable unit, reached by `crib learn <course> --<name>`.
 *
 * @typedef {object} Lesson
 * @property {string} name Lowercase, no spaces — this is what the user types.
 * @property {string} description One line, shown on the course's lesson menu.
 * @property {string} body The prose, as a filename next to the course's index.mjs — never a path.
 *   The registry knows where a course's directory is; the course doesn't.
 * @property {string[]} [reference] Where the reference half takes over once the course is forgotten, as
 *   `<tool> --<topic>` pointers into the guides. Printed under the lesson,
 *   and checked against the guide registry by the tests.
 * @property {Exercise[]} [exercises] Questions on what this lesson taught, from the `.ex.mjs` file beside its
 *   prose. They only enter the practice pool once the lesson has been read —
 *   practice is revision, not a shortcut past the writing.
 */

/**
 * One course: a taught path through a subject, in reading order.
 *
 * @typedef {object} Course
 * @property {string} name Lowercase, no spaces — this is what the user types.
 * @property {string} title Printed in the banner, e.g. "shell — Your shell, properly".
 * @property {string} summary One line, shown on the course list.
 * @property {Lesson[]} lessons
 */
