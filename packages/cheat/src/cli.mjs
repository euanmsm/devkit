// Arguments in, screens out.
//
//   cheat                    the list of tools
//   cheat gh                 gh's topic menu
//   cheat gh --pr            one topic (the -- is optional)
//   cheat gh --pr --issue    several topics
//   cheat gh --all           the whole guide
//   cheat learn ...          the learning half — see learn/index.mjs
//
// A screen is built in full before any of it is written, because whether it
// goes to a pager depends on how many lines it turned out to be.

import { findEntry, registry } from './registry.mjs';
import { page, shouldPage } from './pager.mjs';
import { isAll, normalise, resolveTopic } from './resolve.mjs';
import { renderIntro, renderTopic, renderWholeGuide } from './render/guide.mjs';
import { layoutFor, layoutForNames } from './render/layout.mjs';
import {
  renderAmbiguousTopic,
  renderMenu,
  renderOverview,
  renderUnknownTool,
  renderUnknownTopic,
} from './render/menu.mjs';
import { colourEnabled, makePaint } from './render/theme.mjs';
import { terminalKeys } from './interact/keys.mjs';

/**
 * The menus' way in and out — present only when keyboard and screen are both terminals.
 *
 * @typedef {object} InteractiveIo
 * @property {() => KeySource} keys
 * @property {(text: string) => void} write
 */

/**
 * @typedef {object} Io
 * @property {(lines: string[], pager?: boolean | "always") => void | Promise<void>} present Called once, with the whole screen. `true` pages when the screen is
 *   taller than the window, `"always"` pages regardless of height — the
 *   menus use it so enter behaves the same for every screen — and `false`
 *   never pages. NO_PAGER and a non-terminal still print in every mode.
 * @property {(line: string) => void} err
 * @property {NodeJS.ProcessEnv} env
 * @property {boolean} isTTY
 * @property {number} width Columns to draw within. 80 when the output is not a terminal.
 * @property {number} rows Rows the terminal has, for deciding whether to page.
 * @property {InteractiveIo} [interactive] Absent when stdin or stdout isn't a terminal — then every screen prints.
 */

/** Redirected output has no width of its own, and must not vary with the window. */
const FILE_WIDTH = 80;

/** Writing to a closed pipe — `cheat gh | head` — is not an error worth a stack trace. */
function writeLine(stream, line) {
  try {
    stream.write(line + '\n');
  } catch (error) {
    if (error.code !== 'EPIPE') throw error;
  }
}

const FILE_ROWS = 24;

// Both of these are `||` rather than `??` on purpose: a pty that has not been
// sized reports 0 rather than undefined, and a zero here would mean a column of
// nothing and a pager for every screen.
const terminalWidth = () =>
  // CHEAT_WIDTH is an override for looking at a layout you are not sitting at.
  // COLUMNS is deliberately ignored — shells export it inconsistently, and it
  // would make redirected output vary from one machine to the next.
  Number(process.env['CHEAT_WIDTH']) || process.stdout.columns || FILE_WIDTH;

const terminalRows = () => process.stdout.rows || FILE_ROWS;

const defaultIo = {
  present: async (lines, pager = true) => {
    const context = {
      env: process.env,
      isTTY: process.stdout.isTTY ?? false,
      rows: terminalRows(),
    };
    if (
      pager &&
      shouldPage(context, lines.length, pager === 'always') &&
      (await page(lines, process.env))
    )
      return;
    for (const line of lines) writeLine(process.stdout, line);
  },
  err: (line) => writeLine(process.stderr, line),
  env: process.env,
  isTTY: process.stdout.isTTY ?? false,
  width: terminalWidth(),
  rows: terminalRows(),
  ...(process.stdin.isTTY && process.stdout.isTTY
    ? {
        interactive: {
          keys: () => terminalKeys(process.stdin),
          write: (text) => process.stdout.write(text),
        },
      }
    : {}),
};

/** Returns the process exit code: 0 for anything printed as asked, 1 otherwise. */
export async function run(allArgv, io = defaultIo) {
  const paint = makePaint(colourEnabled(io.env, io.isTTY));
  const argv = allArgv.filter((a) => a !== '--no-pager' && a !== '--print');
  const pager = !allArgv.includes('--no-pager');
  // Menus need a terminal on both ends; --print forces today's screens there.
  const interactive = allArgv.includes('--print') ? undefined : io.interactive;
  const openMenus = async (start) => {
    const { browse } = await import('./interact/browse.mjs');
    // Menus page every screen, so enter and q behave the same for short
    // topics and long ones — unless --no-pager asked for printing.
    return browse({ ...io, interactive: interactive }, paint, start, pager);
  };
  const lines = [];
  const write = (produced) => lines.push(...produced);
  const finish = async (code) => {
    await io.present(lines, pager);
    return code;
  };

  if (argv.length === 0) {
    if (interactive) return (await openMenus({ at: 'root' })) ?? 0;
    const layout = layoutForNames(
      registry.map((e) => e.name),
      4,
      io.width,
    );
    write(renderOverview(paint, layout, registry));
    return finish(0);
  }

  const [toolName, ...topicArgs] = argv;

  // Spaced repetition over everything practised — a conversation, so it
  // writes as it goes rather than building a screen.
  if (toolName === 'drill') {
    const { drillRun } = await import('./learn/run.mjs');
    const result = await drillRun(
      topicArgs,
      paint,
      io.env,
      io.width,
      Boolean(io.interactive),
    );
    result.errors.forEach(io.err);
    return result.code;
  }

  // The learning half. Imported lazily for the same reason guides are: a
  // reference lookup never pays for code it isn't using.
  if (toolName === 'learn') {
    // Practice is a session, not a screen: same early exit as drill.
    const practising = topicArgs.some((a) => normalise(a) === 'practice');
    if (practising) {
      const rest = topicArgs.filter((a) => normalise(a) !== 'practice');
      const { practiceRun } = await import('./learn/run.mjs');
      const result = await practiceRun(
        rest[0] ?? '',
        paint,
        io.env,
        io.width,
        Boolean(io.interactive),
      );
      result.errors.forEach(io.err);
      return result.code;
    }

    // Bare learn, or learn with just a course, opens menus; a named lesson
    // (or a course that fails to resolve) prints, exactly as before.
    if (interactive && topicArgs.length <= 1) {
      const code = await openMenus(
        topicArgs.length === 0
          ? { at: 'courses' }
          : { at: 'lessons', courseArg: topicArgs[0] },
      );
      if (code !== null) return code;
    }
    const { learnScreen } = await import('./learn/index.mjs');
    const result = await learnScreen(topicArgs, paint, io);
    result.errors.forEach(io.err);
    write(result.lines);
    return finish(result.code);
  }

  const entry = findEntry(toolName);
  if (!entry) {
    renderUnknownTool(
      paint,
      toolName,
      registry.map((e) => e.name),
    ).forEach(io.err);
    return 1;
  }

  const guide = await entry.load();
  const layout = layoutFor(guide, io.width);

  // Short guides print in full and have no menu — `cheat lsof`.
  if (guide.menu === false) {
    write(renderWholeGuide(paint, layout, guide));
    return finish(0);
  }

  if (topicArgs.length === 0) {
    if (interactive) return (await openMenus({ at: 'guide', guide })) ?? 0;
    write(renderIntro(paint, layout, guide));
    write(renderMenu(paint, layout, guide));
    return finish(0);
  }

  for (const arg of topicArgs) {
    if (isAll(arg)) {
      write(renderWholeGuide(paint, layout, guide));
      write(['']);
      continue;
    }

    const found = resolveTopic(guide.topics, arg);
    if (found.status === 'ambiguous') {
      renderAmbiguousTopic(paint, normalise(arg), found.matches).forEach(
        io.err,
      );
      return 1;
    }
    if (found.status === 'unknown') {
      write(renderUnknownTopic(paint, normalise(arg)));
      write(renderIntro(paint, layout, guide));
      write(renderMenu(paint, layout, guide));
      return finish(1);
    }

    const topic = guide.topics.find((t) => t.name === found.name);
    write(renderTopic(paint, layout, topic));
    write(['']);
  }

  return finish(0);
}
