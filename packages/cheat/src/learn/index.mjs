// The learn side's entry point: arguments in, one screen out.
//
//   cheat learn                       the courses, with progress
//   cheat learn shell                 one course's lesson menu
//   cheat learn shell --line-editor   read a lesson (the -- is optional,
//                                     prefixes resolve, several at once work)
//
// Returns a screen rather than printing it, so cli.mjs keeps the single
// present-once path — and with it the pager, colour rules and exit codes —
// for both halves of the tool. Errors are returned separately and go to
// stderr, mirroring how run() treats them.
//
// Phase 2 hangs a --practice branch here; phase 3 adds a drill sibling.

import { layoutFrom } from '../render/layout.mjs';
import { normalise, resolveTopic } from '../resolve.mjs';
import { loadLessonBody } from './loader.mjs';
import { loadProgress, markRead } from './progress.mjs';
import { courses, findCourse } from './registry.mjs';
import {
  renderAmbiguousLesson,
  renderBrokenLesson,
  renderCourseList,
  renderCourseMenu,
  renderLesson,
  renderUnknownCourse,
  renderUnknownLesson,
} from './render.mjs';

/**
 * What a learn run produces; cli.mjs does the printing and the exiting.
 *
 * @typedef {object} LearnResult
 * @property {string[]} lines The screen, presented (and possibly paged) by cli.mjs.
 * @property {string[]} errors Straight to stderr, never paged.
 * @property {number} code
 */

// A result that shows something, and one that only explains a failure.
const screen = (lines, code = 0) => ({
  lines,
  errors: [],
  code,
});
const complaint = (errors) => ({
  lines: [],
  errors,
  code: 1,
});

// How a lesson is keyed in the progress file.
const readKey = (course, lesson) => `${course.name}/${lesson.name}`;

/**
 * The whole learn side: everything after `cheat learn` in, one screen out.
 * Rendering a lesson is what marks it read — all we can know is that it was
 * printed.
 */
export async function learnScreen(args, paint, io) {
  // Lessons are prose with no name column, so the layout only needs a width.
  const layout = layoutFrom(0, io.width);
  const progress = loadProgress(io.env);

  // No arguments: the course list, with read-counts against each course.
  if (args.length === 0) {
    const entries = await Promise.all(
      courses.map(async (entry) => {
        const course = await entry.load();
        return {
          entry,
          total: course.lessons.length,
          done: course.lessons.filter((l) => progress.read[readKey(course, l)])
            .length,
        };
      }),
    );
    return screen(renderCourseList(paint, layout, entries));
  }

  const [courseArg, ...lessonArgs] = args;
  const resolved = resolveTopic(courses, courseArg);
  if (resolved.status === 'ambiguous')
    return complaint([
      `${paint('Ambiguous course:', 'bold')} ${normalise(courseArg)}`,
      `Matches: ${resolved.matches.join(' ')}`,
    ]);
  if (resolved.status === 'unknown')
    return complaint(
      renderUnknownCourse(
        paint,
        normalise(courseArg),
        courses.map((c) => c.name),
      ),
    );

  const course = await findCourse(resolved.name).load();
  const menu = () =>
    renderCourseMenu(paint, layout, course, (l) =>
      Boolean(progress.read[readKey(course, l)]),
    );

  // A course on its own: the lesson menu.
  if (lessonArgs.length === 0) return screen(menu());

  // Lesson names, one screen each, in the order they were asked for.
  const lines = [];
  for (const arg of lessonArgs) {
    const found = resolveTopic(course.lessons, arg);
    if (found.status === 'ambiguous')
      return complaint(
        renderAmbiguousLesson(paint, normalise(arg), found.matches),
      );
    if (found.status === 'unknown')
      return screen(
        [...renderUnknownLesson(paint, normalise(arg)), ...menu()],
        1,
      );

    const index = course.lessons.findIndex((l) => l.name === found.name);
    const lesson = course.lessons[index];
    try {
      const blocks = await loadLessonBody(course.name, lesson);
      lines.push(
        ...renderLesson(
          paint,
          layout,
          course,
          lesson,
          blocks,
          course.lessons[index + 1],
        ),
      );
    } catch (error) {
      return screen(
        renderBrokenLesson(
          paint,
          course.name,
          lesson.name,
          error instanceof Error ? error.message : String(error),
        ),
        1,
      );
    }
    markRead(
      io.env,
      readKey(course, lesson),
      new Date().toISOString().slice(0, 10),
    );
  }
  return screen(lines);
}
