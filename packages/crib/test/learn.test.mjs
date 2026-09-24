// Checks that hold for every course, so one can't be added half-wired —
// guides.test.mjs for the learning half.

import { equal, ok } from 'node:assert/strict';
import { describe, it } from 'node:test';
import { registry } from '../src/registry.mjs';
import { layoutFrom } from '../src/render/layout.mjs';
import { makePaint } from '../src/render/theme.mjs';
import { resolveTopic } from '../src/resolve.mjs';
import { loadLessonBody } from '../src/learn/loader.mjs';
import { courses } from '../src/learn/registry.mjs';
import { renderCourseMenu, renderLesson } from '../src/learn/render.mjs';

const plain = makePaint(false);
const WIDTH = 80;
const layout = layoutFrom(0, WIDTH);
const loaded = await Promise.all(
  courses.map(async (entry) => ({ entry, course: await entry.load() })),
);

describe('course registry', () => {
  it('lists courses in alphabetical order', () => {
    const names = courses.map((c) => c.name);
    ok(
      names.every((n, i) => i === 0 || names[i - 1] < n),
      `out of order: ${names.join(', ')}`,
    );
  });

  it('agrees with each course about its own name', () => {
    for (const { entry, course } of loaded) equal(course.name, entry.name);
  });
});

for (const { course } of loaded) {
  describe(`${course.name} course`, () => {
    it('has lessons', () => {
      ok(course.lessons.length > 0);
    });

    it('uses lesson names you can type', () => {
      for (const lesson of course.lessons)
        ok(
          /^[a-z][a-z0-9-]*$/.test(lesson.name),
          `${course.name}: "${lesson.name}" is not a typeable lesson name`,
        );
    });

    it('has no duplicate lesson names', () => {
      const names = course.lessons.map((l) => l.name);
      equal(
        new Set(names).size,
        names.length,
        `${course.name} repeats a lesson name`,
      );
    });

    it('describes every lesson for the menu', () => {
      for (const lesson of course.lessons)
        ok(lesson.description.trim().length > 0);
    });

    // Ids key the card in the progress file, so a clash would merge two
    // exercises' histories into one.
    it('gives every exercise a unique id within its lesson', () => {
      for (const lesson of course.lessons) {
        const ids = (lesson.exercises ?? []).map((e) => e.id);
        equal(
          new Set(ids).size,
          ids.length,
          `${course.name}/${lesson.name} repeats an exercise id`,
        );
      }
    });

    it('gives every exercise a prompt and a note that earn their lines', () => {
      for (const lesson of course.lessons)
        for (const exercise of lesson.exercises ?? []) {
          const where = `${course.name}/${lesson.name}/${exercise.id}`;
          ok(exercise.prompt.trim().length > 0, `${where} has no prompt`);
          ok(exercise.note.trim().length > 0, `${where} has no note`);
          if (exercise.kind === 'choice')
            ok(
              exercise.options[exercise.correct] !== undefined,
              `${where} points at an option that isn't there`,
            );
        }
    });

    it('can look up every one of its own lessons by name', () => {
      for (const lesson of course.lessons) {
        equal(
          resolveTopic(course.lessons, lesson.name).status,
          'found',
          `${course.name} cannot resolve --${lesson.name}`,
        );
      }
    });

    it('renders its menu', () => {
      ok(renderCourseMenu(plain, layout, course, () => false).length > 0);
    });

    // The pointers into the reference half must land on real guide topics —
    // the cross-check that keeps the two halves agreeing with each other.
    it('points its references at guides that exist', async () => {
      for (const lesson of course.lessons)
        for (const ref of lesson.reference ?? []) {
          const [tool, topic] = ref.split(/\s+/);
          const entry = registry.find((e) => e.name === tool);
          ok(entry, `${course.name}/${lesson.name}: no "${tool}" guide`);
          const guide = await entry.load();
          equal(
            resolveTopic(guide.topics, topic ?? '').status,
            'found',
            `${course.name}/${lesson.name}: ${ref} is not a guide topic`,
          );
        }
    });

    // Loading every body catches missing files and subset violations at test
    // time, which is the enforcement the markdown parser promises authors.
    for (const [index, lesson] of course.lessons.entries()) {
      describe(`--${lesson.name}`, () => {
        it('parses and renders to a real screen', async () => {
          const blocks = await loadLessonBody(course.name, lesson);
          const lines = renderLesson(
            plain,
            layout,
            course,
            lesson,
            blocks,
            course.lessons[index + 1],
          );
          ok(
            lines.filter((l) => l.trim()).length > 5,
            `${course.name} --${lesson.name} rendered almost nothing`,
          );
        });

        it('draws nothing past the width it was given', async () => {
          const blocks = await loadLessonBody(course.name, lesson);
          for (const line of renderLesson(
            plain,
            layout,
            course,
            lesson,
            blocks,
            course.lessons[index + 1],
          ))
            ok(
              [...line].length <= layout.width,
              `${course.name} --${lesson.name} overflows: ${line}`,
            );
        });
      });
    }
  });
}
