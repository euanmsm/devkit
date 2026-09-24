// Running a practice or drill session, from either way in.
//
// The CLI (`--practice`, `crib drill`) and the menus both land here, so the
// two routes cannot drift. This module owns the two things a session itself
// should not: where the questions came from, and writing the answers down.

import { loadProgress, prune, recordAnswer } from './progress.mjs';
import { drillPool, liveKeys, practicePool } from './pool.mjs';
import { runSession } from './session.mjs';

/**
 * Everything a run needs that isn't the questions.
 *
 * @typedef {object} RunContext
 * @property {AskIo} io
 * @property {Paint} paint
 * @property {NodeJS.ProcessEnv} env
 * @property {number} width
 * @property {Day} today
 */

/**
 * Nothing to ask, and the one line explaining why.
 *
 * @typedef {object} NothingToDo
 * @property {false} ran
 * @property {string} because
 */

/**
 * @typedef {(SessionResult & {ran: true }) | NothingToDo} RunOutcome
 */

/** Today, as the progress file spells dates. */
export const todayISO = () => new Date().toISOString().slice(0, 10);

/** Practise one course: what you've read, unpractised questions first. */
export async function runPractice(ctx, course) {
  const progress = loadProgress(ctx.env);
  const questions = practicePool(course, progress);
  if (questions.length === 0)
    return {
      ran: false,
      because: course.lessons.some(
        (l) => progress.read[`${course.name}/${l.name}`],
      )
        ? `No exercises yet for the ${course.name} lessons you've read.`
        : `Read a ${course.name} lesson first — practice revises what a lesson taught.`,
    };

  return {
    ran: true,
    ...(await runSession(
      ctx.io,
      ctx.paint,
      ctx.width,
      `Practising ${course.name}`,
      questions,
      (key, right) => recordAnswer(ctx.env, key, right, ctx.today),
    )),
  };
}

/** Drill what's due, across every course or just one. */
export async function runDrill(ctx, onlyCourse) {
  // A renamed exercise leaves a card with nothing behind it; clear those out
  // before counting, so "3 due" always means three real questions.
  prune(ctx.env, await liveKeys());
  const progress = loadProgress(ctx.env);
  const questions = await drillPool(progress, ctx.today, onlyCourse);
  if (questions.length === 0)
    return {
      ran: false,
      because:
        Object.keys(progress.cards).length === 0
          ? 'Nothing to drill yet — practise a lesson and it starts here.'
          : 'Nothing due today.',
    };

  return {
    ran: true,
    ...(await runSession(
      ctx.io,
      ctx.paint,
      ctx.width,
      onlyCourse ? `Drilling ${onlyCourse}` : "Drilling what's due",
      questions,
      (key, right) => recordAnswer(ctx.env, key, right, ctx.today),
    )),
  };
}
