// The screens that help you find something, rather than showing it.

import cliui from 'cliui';

import { renderHeader } from './items.mjs';
import { layoutForNames, MARGIN } from './layout.mjs';

/** Menu rows sit one step in from the body text. */
const ROW_INDENT = 4;

/**
 * A list of name-and-summary rows, sharing a column measured the same way the
 * guides are. Replaces the old fixed pads of 12 and 15, which left six blank
 * characters after the longest name they were ever given.
 *
 * A row can carry a mark — the ✓ against a read lesson. When any row in the
 * list has one, every name gains a two-character mark cell so the names stay
 * aligned; when none do, the output is byte-identical to a markless menu.
 */
export function rows(paint, layout, entries) {
  const marked = entries.some((e) => e.mark);
  const { column } = layoutForNames(
    // Every name is two wider when any row carries a mark, whether or not
    // this one does — the mark cell exists down the whole column.
    entries.map((e) => (marked ? '✓ ' : '') + e.name),
    ROW_INDENT,
    layout.width,
  );
  const ui = cliui({ width: layout.width });
  for (const entry of entries) {
    // cliui strips leading spaces from cell text, so the blank mark cell of
    // an unmarked row has to travel as padding to survive.
    const bare = marked && !entry.mark;
    ui.div(
      {
        text: paint(entry.mark ? '✓ ' + entry.name : entry.name, 'green'),
        width: column,
        padding: [0, 0, 0, ROW_INDENT + (bare ? 2 : 0)],
      },
      { text: paint(entry.desc, 'dim'), padding: [0, 0, 0, 0] },
    );
  }
  return ui.toString().split('\n');
}

/** The list of topics for one tool, with `all` on the end. */
export function renderMenu(paint, layout, guide) {
  return [
    '',
    `  ${paint('Topics:', 'bold')}  cheat ${guide.name} --<topic>`,
    '',
    ...rows(paint, layout, [
      ...guide.topics.map((t) => ({ name: t.name, desc: t.description })),
      { name: 'all', desc: 'Show the whole guide' },
    ]),
    '',
  ];
}

/** The no-argument screen: how to call it, and which tools are covered. */
export function renderOverview(paint, layout, guides) {
  return [
    ...renderHeader(paint, layout, 'cheat — CLI Quick Reference'),
    `  ${paint('Usage:', 'bold')}  cheat <tool>            Topic menu for a tool`,
    '          cheat <tool> --<topic>  One topic',
    '          cheat <tool> --all      The whole guide',
    '          cheat learn             Courses to work through, with progress',
    '',
    `  ${paint('Available guides:', 'bold')}`,
    '',
    ...rows(
      paint,
      layout,
      guides.map((g) => ({ name: g.name, desc: g.summary })),
    ),
    '',
  ];
}

export function renderUnknownTopic(paint, input) {
  return [
    '',
    `${' '.repeat(MARGIN)}${paint('Unknown topic:', 'bold')} ${input}`,
  ];
}

export function renderAmbiguousTopic(paint, input, matches) {
  return [
    '',
    `  ${paint('Ambiguous topic:', 'bold')} ${input}`,
    `  ${paint('Matches:', 'dim')} ${matches.join(' ')}`,
    '',
  ];
}

export function renderUnknownTool(paint, input, known) {
  return [
    `${paint('Unknown tool:', 'bold')} ${input}`,
    '',
    `Available: ${known.join(', ')}`,
  ];
}
