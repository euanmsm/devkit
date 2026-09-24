// The `--practice` and `cheat drill` entry points.
//
// Sessions are conversations, so they need a terminal on both ends: piped or
// redirected, they refuse with one line rather than printing questions next
// to their answers, which would defeat the retrieval that makes practice
// work. Everything past that check is shared with the menus via practice.mjs.

import { openAsk } from './ask.mjs';
import { findCourse, courses } from './registry.mjs';
import { resolveTopic, normalise } from '../resolve.mjs';

import { runDrill, runPractice, todayISO } from './practice.mjs';
import { renderUnknownCourse } from './render.mjs';

/**
 * What cli.mjs needs back: what to print, and the exit code.
 *
 * @typedef {object} RunResult
 * @property {string[]} errors
 * @property {number} code
 */

const refusal = (what) => ({
  errors: [`cheat: ${what} needs a terminal`],
  code: 1,
});

/** Builds the context a run needs from the process, once a TTY is confirmed. */
function context(paint, env, width) {
  const { io, close } = openAsk(process.stdin, process.stdout);
  return { ctx: { io, paint, env, width, today: todayISO() }, close };
}

/** `cheat learn <course> --practice`. */
export async function practiceRun(courseArg, paint, env, width, isTTY) {
  const resolved = resolveTopic(courses, courseArg);
  if (resolved.status !== 'found')
    return {
      errors: renderUnknownCourse(
        paint,
        normalise(courseArg),
        courses.map((c) => c.name),
      ),
      code: 1,
    };
  if (!isTTY) return refusal('practice');

  const course = await findCourse(resolved.name).load();
  const { ctx, close } = context(paint, env, width);
  try {
    const outcome = await runPractice(ctx, course);
    if (!outcome.ran) ctx.io.write(`\n  ${outcome.because}\n\n`);
  } finally {
    close();
  }
  return { errors: [], code: 0 };
}

/** `cheat drill [course]`. */
export async function drillRun(args, paint, env, width, isTTY) {
  let only;
  if (args.length > 0) {
    const resolved = resolveTopic(courses, args[0]);
    if (resolved.status !== 'found')
      return {
        errors: renderUnknownCourse(
          paint,
          normalise(args[0]),
          courses.map((c) => c.name),
        ),
        code: 1,
      };
    only = resolved.name;
  }
  if (!isTTY) return refusal('drill');

  const { ctx, close } = context(paint, env, width);
  try {
    const outcome = await runDrill(ctx, only);
    if (!outcome.ran) ctx.io.write(`\n  ${outcome.because}\n\n`);
  } finally {
    close();
  }
  return { errors: [], code: 0 };
}
