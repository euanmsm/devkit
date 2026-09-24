// The interactive flows: which menu leads to which, and what enter prints.
//
// Nothing here draws — select.mjs owns the screen — and nothing here renders
// content: enter hands the same lines the printed paths produce to
// io.present, so paging, colour and layout behave identically in both modes.
// Esc walks up the tree (guide → root, lessons → courses → root); q or
// ctrl-c leaves from anywhere, always with exit code 0.

import { registry } from '../registry.mjs';
import { renderTopic, renderWholeGuide } from '../render/guide.mjs';
import { layoutFor, layoutFrom } from '../render/layout.mjs';

import { loadLessonBody } from '../learn/loader.mjs';
import { loadProgress, markRead } from '../learn/progress.mjs';
import { practiceCount } from '../learn/pool.mjs';
import { todayISO } from '../learn/practice.mjs';
import { due } from '../learn/scheduler.mjs';
import { courses } from '../learn/registry.mjs';
import { renderBrokenLesson, renderLesson } from '../learn/render.mjs';

import { resolveTopic } from '../resolve.mjs';
import { select } from './select.mjs';

/**
 * What cli.mjs must provide for browsing: a full Io with the interactive half.
 *
 * @typedef {Io & { interactive: NonNullable<Io["interactive"]> }} BrowseIo
 */

/**
 * Which menu to open first, from how cheat was invoked.
 *
 * @typedef {(
 *   | { at: "root" }
 *   | { at: "guide"; guide: Guide }
 *   | { at: "courses" }
 *   | { at: "lessons"; courseArg: string }
 * )} Start
 */

/**
 * Walked out of a menu (up a level) or out of the program.
 *
 * @typedef {"back" | "quit"} Flow
 */

/**
 * @typedef {object} Ctx
 * @property {BrowseIo} io
 * @property {Paint} paint
 * @property {SelectIo} sel
 * @property {"always" | false} pager How enter presents a screen: "always" pages every one, however short, so
 *   the pager view and q-to-return are the same for every pick; false (from
 *   --no-pager) prints instead. Never plain `true` — height-dependent paging
 *   is exactly the inconsistency the menus exist to avoid.
 */

/**
 * The entry point. Returns the process exit code, or null when the start
 * can't be browsed (an unknown or ambiguous course) — the caller falls back
 * to the printing path, which owns those error screens.
 */
export async function browse(io, paint, start, pager = true) {
  const ctx = {
    io,
    paint,
    sel: {
      write: io.interactive.write,
      keys: io.interactive.keys,
      width: io.width,
      rows: io.rows,
    },
    pager: pager ? 'always' : false,
  };

  let flow;
  switch (start.at) {
    case 'root':
      await root(ctx);
      return 0;
    case 'guide':
      flow = await guideMenu(ctx, start.guide);
      break;
    case 'courses':
      flow = await courseMenu(ctx);
      break;
    case 'lessons': {
      // Resolve the typed course; anything not cleanly found is the printing
      // path's problem, so its unknown/ambiguous screens stay the only ones.
      const found = resolveTopic(courses, start.courseArg);
      if (found.status !== 'found') return null;
      flow = await lessonMenu(
        ctx,
        courses.find((c) => c.name === found.name),
      );
      if (flow === 'back') flow = await courseMenu(ctx);
      break;
    }
  }
  // Backing out of a directly-opened menu lands on the root, so every entry
  // point behaves like one tree rather than a dead end.
  if (flow === 'back') await root(ctx);
  return 0;
}

/** Root: every guide, then learn. */
async function root(ctx) {
  for (;;) {
    // Learn sits in its own section under the guides — it teaches rather
    // than reminds, so it isn't one of the references.
    const items = [
      ...registry.map((e) => ({ name: e.name, desc: e.summary, entry: e })),
      {
        name: 'learn',
        desc: 'Courses to work through, with progress',
        entry: undefined,
        gapBefore: true,
      },
    ];
    const picked = await select(
      ctx.paint,
      ctx.sel,
      'cheat — pick a guide',
      items,
    );
    if (picked.kind === 'quit') return 'quit';
    if (picked.kind === 'back') return 'back';
    const flow = picked.item.entry
      ? await guideMenu(ctx, await picked.item.entry.load())
      : await courseMenu(ctx);
    if (flow === 'quit') return 'quit';
  }
}

/** One guide's topics, plus `all`. `menu: false` guides print whole. */
async function guideMenu(ctx, guide) {
  const layout = layoutFor(guide, ctx.io.width);
  if (guide.menu === false) {
    await ctx.io.present(renderWholeGuide(ctx.paint, layout, guide), ctx.pager);
    return 'back';
  }
  for (;;) {
    const items = [
      ...guide.topics.map((t) => ({ name: t.name, desc: t.description })),
      { name: 'all', desc: 'Show the whole guide' },
    ];
    const picked = await select(ctx.paint, ctx.sel, guide.title, items);
    if (picked.kind !== 'chosen') return picked.kind;
    if (picked.item.name === 'all') {
      await ctx.io.present(
        renderWholeGuide(ctx.paint, layout, guide),
        ctx.pager,
      );
      continue;
    }
    // The same lines `cheat gh --pr` prints, so both modes stay identical.
    const topic = guide.topics.find((t) => t.name === picked.item.name);
    await ctx.io.present(
      [...renderTopic(ctx.paint, layout, topic), ''],
      ctx.pager,
    );
  }
}

/**
 * Runs a practice session from inside a menu, and hands the keyboard back.
 *
 * The delicate bit of the whole feature: menus hold stdin in raw mode a
 * character at a time, sessions want it cooked and line-buffered. select()
 * has already closed its KeySource by the time we get here — restoring cooked
 * mode and pausing stdin — so readline finds the terminal as it expects, and
 * closing it before we return leaves the next menu free to take stdin again.
 */
async function practiseFromMenu(ctx, course) {
  const { openAsk, SessionCancelled } = await import('../learn/ask.mjs');
  const { runPractice, todayISO } = await import('../learn/practice.mjs');
  const { io, close } = openAsk(process.stdin, process.stdout);
  try {
    const outcome = await runPractice(
      {
        io,
        paint: ctx.paint,
        env: ctx.io.env,
        width: ctx.io.width,
        today: todayISO(),
      },
      course,
    );
    if (!outcome.ran) io.write(`\n  ${outcome.because}\n\n`);
    // Ctrl-C out of a session means out of cheat, the same as it does in a
    // menu — asking "enter to go back" now would be asking on a closed
    // readline, and would contradict what ctrl-c means everywhere else.
    if (outcome.ran && outcome.cancelled) return 'quit';
    // Otherwise a beat to read the summary before the menu paints over it.
    await io.ask('  enter to go back ');
    return undefined;
  } catch (error) {
    if (error instanceof SessionCancelled) return 'quit';
    throw error;
  } finally {
    close();
  }
}

/** The courses, with read-counts, leading into their lessons. */
async function courseMenu(ctx) {
  for (;;) {
    const progress = loadProgress(ctx.io.env);
    const items = await Promise.all(
      courses.map(async (entry) => {
        const course = await entry.load();
        const done = course.lessons.filter(
          (l) => progress.read[`${course.name}/${l.name}`],
        ).length;
        const total = course.lessons.length;
        return {
          name: entry.name,
          desc:
            entry.summary +
            (done > 0 && done < total ? ` — ${done}/${total} read` : ''),
          mark: total > 0 && done === total,
          entry,
        };
      }),
    );
    // The due count belongs on the title: it is the reason to come back
    // daily, and it must not look like another course you could open.
    const dueNow = due(progress.cards, todayISO()).length;
    const title =
      dueNow > 0
        ? `learn — pick a course  ·  ${dueNow} due, run cheat drill`
        : 'learn — pick a course';
    const picked = await select(ctx.paint, ctx.sel, title, items);
    if (picked.kind !== 'chosen') return picked.kind;
    const flow = await lessonMenu(ctx, picked.item.entry);
    if (flow === 'quit') return 'quit';
  }
}

/** One course's lessons, ✓-marked, re-read after every lesson shown. */
async function lessonMenu(ctx, entry) {
  const course = await entry.load();
  const layout = layoutFrom(0, ctx.io.width);
  for (;;) {
    const progress = loadProgress(ctx.io.env);
    const lessons = course.lessons.map((lesson, index) => ({
      name: lesson.name,
      desc: lesson.description,
      mark: Boolean(progress.read[`${course.name}/${lesson.name}`]),
      lesson: lesson,
      index,
    }));
    // Practice sits in its own section under the lessons — it revises them
    // rather than being one of them. Only what you've read is in the pool.
    const ready = practiceCount(course, progress);
    const read = course.lessons.filter(
      (l) => progress.read[`${course.name}/${l.name}`],
    ).length;
    const items = [
      ...lessons,
      {
        name: 'practise',
        desc:
          ready > 0
            ? `${ready} exercises from ${read} ${read === 1 ? 'lesson' : 'lessons'}`
            : 'read a lesson first',
        mark: false,
        lesson: undefined,
        index: -1,
        gapBefore: true,
      },
    ];
    const picked = await select(ctx.paint, ctx.sel, course.title, items);
    if (picked.kind !== 'chosen') return picked.kind;

    if (!picked.item.lesson) {
      const flow = await practiseFromMenu(ctx, course);
      if (flow) return flow;
      continue;
    }

    const { lesson, index } = picked.item;
    try {
      const blocks = await loadLessonBody(course.name, lesson);
      await ctx.io.present(
        renderLesson(
          ctx.paint,
          layout,
          course,
          lesson,
          blocks,
          course.lessons[index + 1],
        ),
        ctx.pager,
      );
      markRead(
        ctx.io.env,
        `${course.name}/${lesson.name}`,
        new Date().toISOString().slice(0, 10),
      );
    } catch (error) {
      await ctx.io.present(
        renderBrokenLesson(
          ctx.paint,
          course.name,
          lesson.name,
          error instanceof Error ? error.message : String(error),
        ),
        ctx.pager,
      );
    }
  }
}
