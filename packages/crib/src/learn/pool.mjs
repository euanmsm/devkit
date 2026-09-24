// Which questions a run asks, and in what order.
//
// Two ways in, one shape out. Practice takes everything from the lessons you
// have read in one course; a drill takes what the scheduler says is due,
// across every course. Both hand `session.mjs` the same list of Questions, so
// the loop knows nothing about where its questions came from.

import { courses } from './registry.mjs';
import { due } from './scheduler.mjs';

/** Longest a single sitting gets. Past this it stops being a few minutes. */
export const SESSION_LIMIT = 10;

const key = (course, lesson, id) => `${course}/${lesson}/${id}`;

/** Every question a course could ask, whether or not its lesson is read. */
export function allQuestions(course) {
  return course.lessons.flatMap((lesson) =>
    (lesson.exercises ?? []).map((exercise) => ({
      exercise,
      key: key(course.name, lesson.name, exercise.id),
      origin: `${course.name} / ${lesson.name}`,
    })),
  );
}

/** How many exercises a course offers from the lessons already read. */
export function practiceCount(course, progress) {
  return course.lessons
    .filter((lesson) => progress.read[`${course.name}/${lesson.name}`])
    .reduce((total, lesson) => total + (lesson.exercises?.length ?? 0), 0);
}

/**
 * A practice run: questions from the lessons you have read, unpractised ones
 * first so a session opens on new material rather than re-asking what you
 * already know. Capped at SESSION_LIMIT.
 */
export function practicePool(course, progress) {
  const readable = course.lessons.filter(
    (lesson) => progress.read[`${course.name}/${lesson.name}`],
  );
  const questions = readable.flatMap((lesson) =>
    (lesson.exercises ?? []).map((exercise) => ({
      exercise,
      key: key(course.name, lesson.name, exercise.id),
      origin: `${course.name} / ${lesson.name}`,
    })),
  );
  const fresh = questions.filter((q) => !progress.cards[q.key]);
  const seen = questions.filter((q) => progress.cards[q.key]);
  return [...fresh, ...seen].slice(0, SESSION_LIMIT);
}

/**
 * A drill run: what the scheduler says is due, oldest first, across every
 * course — optionally narrowed to one. Cards whose exercise has since been
 * renamed or deleted are skipped rather than asked.
 */
export async function drillPool(progress, today, onlyCourse) {
  const known = new Map();
  for (const entry of courses) {
    if (onlyCourse && entry.name !== onlyCourse) continue;
    for (const question of allQuestions(await entry.load()))
      known.set(question.key, question);
  }
  return due(progress.cards, today)
    .map((cardKey) => known.get(cardKey))
    .filter((question) => question !== undefined)
    .slice(0, SESSION_LIMIT);
}

/** Every card key that still has an exercise behind it, for pruning. */
export async function liveKeys() {
  const keys = new Set();
  for (const entry of courses)
    for (const question of allQuestions(await entry.load()))
      keys.add(question.key);
  return keys;
}
