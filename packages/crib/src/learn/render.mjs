// The learn screens: the course list, one course's lesson menu, and a lesson.
//
// Same contract as ../render/: data in, an array of lines out, nothing
// printed. Everything reuses the guide renderer's pieces — the banner, the
// section headings, the menu rows — so the two halves of the tool look like
// one tool.

import cliui from 'cliui';

import { renderHeader, renderSectionTitle } from '../render/items.mjs';
import { rows } from '../render/menu.mjs';
import { MARGIN } from '../render/layout.mjs';

/** Lesson code blocks sit where a guide's flags do. */
const CODE_INDENT = 4;

/**
 * Inline `code` and **bold**, resolved to paint. With colour off the markers
 * are simply removed, so piped output reads as clean prose.
 */
export function formatInline(paint, text) {
  return text
    .split(/(`[^`]*`)/)
    .map((part) =>
      part.startsWith('`') && part.endsWith('`') && part.length > 1
        ? paint(part.slice(1, -1), 'cyan')
        : part.replace(/\*\*([^*]+)\*\*/g, (_, bold) =>
            paint(bold, 'bold', 'white'),
          ),
    )
    .join('');
}

/** A paragraph or bullet list, wrapped to the width by cliui. */
function prose(paint, layout, block) {
  const ui = cliui({ width: layout.width });
  if (block.kind === 'para') {
    ui.div({
      text: formatInline(paint, block.text),
      width: layout.width,
      padding: [0, 0, 0, MARGIN],
    });
  } else {
    for (const item of block.items)
      ui.div(
        {
          text: paint('•', 'dim'),
          width: MARGIN + 4,
          padding: [0, 0, 0, MARGIN + 2],
        },
        { text: formatInline(paint, item), padding: [0, 0, 0, 0] },
      );
  }
  return ui.toString().split('\n');
}

/** A dim horizontal rule spanning the text, for `---` and the footer. */
const rule = (paint, layout) =>
  paint(' '.repeat(MARGIN) + '─'.repeat(layout.width - MARGIN * 2), 'dim');

/** One parsed block to its lines, each block ending in a blank line. */
function renderBlock(paint, layout, block) {
  switch (block.kind) {
    case 'heading':
      // Every block already ends in a blank line, so the section title's own
      // leading blank is dropped — one gap between blocks, never two.
      return renderSectionTitle(paint, layout, block.text).slice(1).concat('');
    case 'para':
    case 'bullets':
      return prose(paint, layout, block).concat('');
    case 'code':
      return block.lines
        .map((line) =>
          line ? ' '.repeat(CODE_INDENT) + paint(line, 'green') : '',
        )
        .concat('');
    case 'rule':
      return [rule(paint, layout), ''];
  }
}

/** One lesson: banner, the body, then where to go next. */
export function renderLesson(paint, layout, course, lesson, blocks, next) {
  // The footer wraps like everything else — a long description folds under
  // the pointer rather than running past the width.
  const ui = cliui({ width: layout.width });
  const pointer = (label, text) =>
    ui.div(
      {
        text: paint(label, 'bold'),
        width: MARGIN + 12,
        padding: [0, 0, 0, MARGIN],
      },
      { text, padding: [0, 0, 0, 0] },
    );
  for (const ref of lesson.reference ?? [])
    pointer('Reference:', `crib ${ref}`);
  if (next)
    pointer(
      'Next:',
      `crib learn ${course.name} --${next.name}  ` +
        paint(next.description, 'dim'),
    );
  else pointer('Done', paint(`— the last lesson in ${course.name}.`, 'dim'));
  const footer = ui.toString().split('\n');

  return [
    ...renderHeader(
      paint,
      layout,
      `${course.name} / ${lesson.name} — ${lesson.description}`,
    ),
    ...blocks.flatMap((block) => renderBlock(paint, layout, block)),
    rule(paint, layout),
    ...footer,
    '',
  ];
}

/** A course's lesson menu, ✓-marked from the progress file. */
export function renderCourseMenu(paint, layout, course, read) {
  return [
    ...renderHeader(paint, layout, course.title),
    `  ${paint('Lessons, in order:', 'bold')}  crib learn ${course.name} --<lesson>`,
    '',
    ...rows(
      paint,
      layout,
      course.lessons.map((l) => ({
        name: l.name,
        desc: l.description,
        mark: read(l),
      })),
    ),
    '',
  ];
}

/** The `crib learn` screen: every course, with progress where it exists. */
export function renderCourseList(paint, layout, entries) {
  return [
    ...renderHeader(paint, layout, 'crib learn — Courses'),
    `  ${paint('Usage:', 'bold')}  crib learn <course>             Lesson menu for a course`,
    '          crib learn <course> --<lesson>  Read one lesson',
    '',
    `  ${paint('Courses:', 'bold')}`,
    '',
    ...rows(
      paint,
      layout,
      entries.map(({ entry, done, total }) => ({
        name: entry.name,
        desc:
          entry.summary +
          (done > 0 && done < total ? ` — ${done}/${total} read` : ''),
        mark: total > 0 && done === total,
      })),
    ),
    '',
  ];
}

/** Stderr lines for a course that doesn't exist, naming the ones that do. */
export function renderUnknownCourse(paint, input, known) {
  return [
    `${paint('Unknown course:', 'bold')} ${input}`,
    '',
    `Available: ${known.join(', ')}`,
  ];
}

/** The complaint printed above the lesson menu when a name matches nothing. */
export function renderUnknownLesson(paint, input) {
  return [
    '',
    `${' '.repeat(MARGIN)}${paint('Unknown lesson:', 'bold')} ${input}`,
  ];
}

/** Stderr lines for a prefix matching several lessons, listed not guessed. */
export function renderAmbiguousLesson(paint, input, matches) {
  return [
    '',
    `  ${paint('Ambiguous lesson:', 'bold')} ${input}`,
    `  ${paint('Matches:', 'dim')} ${matches.join(' ')}`,
    '',
  ];
}

/** A lesson whose body is missing or outside the subset. */
export function renderBrokenLesson(paint, course, lesson, reason) {
  return [
    '',
    `  ${paint('Broken lesson:', 'bold')} ${course} --${lesson}`,
    `  ${paint(reason, 'dim')}`,
    '',
  ];
}
