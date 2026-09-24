// Turning items into lines.
//
// cliui does the column arithmetic and the wrapping. Two things it will not do
// on its own, and this file handles: a name too long for its column gets its
// own line rather than being broken mid-word, and the indent has to travel as
// cell padding, because cliui strips leading spaces from cell text.

import cliui from 'cliui';

import { INDENT, MARGIN } from './layout.mjs';

const measure = (text) => [...text.trim()].length;

/** Smallest gap between a name and its description before they read as one. */
const MIN_GAP = 2;

const HEADER_RULE = '━';
const SECTION_RULE = '─';

const rule = (character, layout) =>
  character.repeat(Math.max(0, layout.width - MARGIN * 2));

/** The banner at the top of a guide. */
export function renderHeader(paint, layout, title) {
  const line = ' '.repeat(MARGIN) + rule(HEADER_RULE, layout);
  return [
    '',
    paint(line, 'bold', 'cyan'),
    paint(`  ${title}`, 'bold', 'white'),
    paint(line, 'bold', 'cyan'),
    '',
  ];
}

/** The heading above a group of items. */
export function renderSectionTitle(paint, layout, title) {
  return [
    '',
    paint(`  ▸ ${title}`, 'bold', 'yellow'),
    paint(' '.repeat(MARGIN) + rule(SECTION_RULE, layout), 'dim'),
  ];
}

/**
 * @typedef {(
 *    {
 *     indent: number;
 *     name: string;
 *     colour: Parameters<Paint>[1];
 *     desc: string;
 *   }
 * )} Row
 */

/**
 * A name and its description, aligned to the shared column. If the name would
 * reach the column it takes the line to itself and the description follows
 * underneath, still at the column — one extra line, rather than shoving every
 * other description to the right to accommodate it.
 */
function pushRow(ui, paint, layout, row) {
  const name = row.name.trim();
  const painted = paint(name, row.colour);
  const desc = row.desc.trim();

  if (row.indent + measure(name) > layout.column - MIN_GAP) {
    ui.div({ text: painted, padding: [0, 0, 0, row.indent] });
    if (desc)
      ui.div({ text: paint(desc, 'dim'), padding: [0, 0, 0, layout.column] });
    return;
  }

  if (!desc) {
    ui.div({ text: painted, padding: [0, 0, 0, row.indent] });
    return;
  }

  ui.div(
    { text: painted, width: layout.column, padding: [0, 0, 0, row.indent] },
    { text: paint(desc, 'dim'), padding: [0, 0, 0, 0] },
  );
}

function pushItem(ui, paint, layout, item, indent) {
  switch (item.kind) {
    case 'cmd':
      pushRow(ui, paint, layout, {
        indent,
        name: item.name,
        colour: 'green',
        desc: item.desc,
      });
      for (const child of item.children ?? [])
        pushItem(ui, paint, layout, child, indent + 2);
      return;
    case 'flag':
      pushRow(ui, paint, layout, {
        indent: INDENT.flag,
        name: item.name,
        colour: 'magenta',
        desc: item.desc,
      });
      return;
    case 'subcmd':
      pushRow(ui, paint, layout, {
        indent: INDENT.subcmd,
        name: item.name,
        colour: 'blue',
        desc: item.desc,
      });
      return;
    case 'note': {
      // A few notes are deliberately indented to sit under the command above.
      // cliui strips leading spaces from cell text, so that nesting has to
      // travel as padding to survive.
      const nested = item.text.length - item.text.trimStart().length;
      ui.div({
        text: paint(item.text.trim(), 'dim'),
        width: layout.width,
        padding: [0, 0, 0, MARGIN + nested],
      });
      return;
    }
    case 'gap':
      ui.div({ text: '', padding: [0, 0, 0, 0] });
      return;
  }
}

export function renderItems(paint, layout, items) {
  if (items.length === 0) return [];
  const ui = cliui({ width: layout.width });
  for (const item of items) pushItem(ui, paint, layout, item, INDENT.cmd);
  return ui.toString().split('\n');
}

export function renderItem(paint, layout, item) {
  return renderItems(paint, layout, [item]);
}
