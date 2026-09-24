// The in-place list selector. Generic: it knows about names, descriptions
// and marks, and nothing about guides, courses or lessons.
//
// It draws a menu, moves a ▸ under the arrow keys, filters as you type, and
// redraws in place — cursor-up plus erase-down plus rewrite, which together
// with hide/show cursor is the complete ANSI vocabulary of the interactive
// mode. When it finishes it erases itself, so whatever prints next starts
// where the menu stood and the scrollback stays clean.
//
// Key rules, chosen so filtering and quitting coexist: printable characters
// always go to the filter; `q` quits only while the filter is empty; esc
// clears a non-empty filter before it means "back"; ctrl-c always quits.

import { MARGIN } from '../render/layout.mjs';

/**
 * One selectable row — the same shape the printed menus render.
 *
 * @typedef {object} SelectItem
 * @property {string} name
 * @property {string} desc
 * @property {boolean} [mark]
 * @property {boolean} [gapBefore] Draw a blank line above this row, separating it into its own section —
 *   how `learn` sits apart from the reference guides on the root menu. The
 *   row itself stays selectable; while a filter is active the gaps vanish,
 *   because a filtered list is one list.
 */

/**
 * Where the selector draws and reads, injectable for tests.
 *
 * @typedef {object} SelectIo
 * @property {(text: string) => void} write
 * @property {() => KeySource} keys
 * @property {number} width
 * @property {number} rows
 */

/**
 * How a selection ended: a pick, one level up, or leave altogether.
 *
 * @template T
 * @typedef {{kind: "chosen"; item: T } | { kind: "back" } | { kind: "quit" }} Outcome
 */

const ESC = '\u001b';
const HIDE_CURSOR = `${ESC}[?25l`;
const SHOW_CURSOR = `${ESC}[?25h`;
/** Move to the frame's first line and erase everything below. */
const eraseFrame = (lines) =>
  lines > 0 ? `${ESC}[${lines}A\r${ESC}[0J` : `\r${ESC}[0J`;

const HINTS = '↑↓ move · ⏎ open · type to filter · esc back · q quit';

const measure = (text) => [...text].length;

/** Cut to a width in code points, marking the cut with an ellipsis. */
function truncate(text, width) {
  const points = [...text];
  if (points.length <= width) return text;
  return points.slice(0, Math.max(0, width - 1)).join('') + '…';
}

/** The lines of one frame, and where the selection sits after clamping. */
function frame(paint, io, title, items, selected, filter) {
  const width = Math.min(io.width, 100);
  const marked = items.some((i) => i.mark);
  const column = Math.max(0, ...items.map((i) => measure(i.name))) + 2;

  // Everything that isn't a row: blank, title, blank … blank, footer. Gaps
  // between sections cost a line each, so they shrink the window too.
  const showGaps = filter === '';
  const gaps = showGaps ? items.filter((i) => i.gapBefore).length : 0;
  const chrome = 5;
  const window = Math.max(3, io.rows - chrome - 1 - gaps);
  const top = Math.min(
    Math.max(0, selected - window + 1),
    Math.max(0, items.length - window),
  );

  const lines = [
    '',
    ' '.repeat(MARGIN) + paint(truncate(title, width - MARGIN), 'bold'),
    '',
  ];

  if (items.length === 0)
    lines.push(' '.repeat(MARGIN + 2) + paint('(no matches)', 'dim'));

  for (const [index, item] of items.slice(top, top + window).entries()) {
    if (showGaps && item.gapBefore) lines.push('');
    const isSelected = top + index === selected;
    const cursor = isSelected ? '▸ ' : '  ';
    const mark = marked ? (item.mark ? '✓ ' : '  ') : '';
    const descRoom = width - MARGIN - 2 - mark.length - column;
    const name = mark + item.name.padEnd(column - mark.length);
    const desc = truncate(item.desc, descRoom);
    lines.push(
      ' '.repeat(MARGIN) +
        (isSelected
          ? paint(cursor + name, 'bold', 'cyan') + paint(desc, 'white')
          : '  ' + paint(name, 'green') + paint(desc, 'dim')),
    );
  }

  lines.push(
    '',
    ' '.repeat(MARGIN) + paint(filter ? `filter: ${filter}▌` : HINTS, 'dim'),
  );
  return lines;
}

/**
 * Runs the menu until a row is chosen, esc backs out, or q/ctrl-c quits.
 * Draws through io.write, reads a fresh KeySource, and erases itself before
 * returning — the caller decides what appears in the space it leaves.
 */
export async function select(paint, io, title, items) {
  const keys = io.keys();
  let drawn = 0;
  let selected = 0;
  let filter = '';

  const finish = (outcome) => {
    io.write(eraseFrame(drawn) + SHOW_CURSOR);
    keys.close();
    return outcome;
  };

  io.write(HIDE_CURSOR);
  for (;;) {
    const visible = filter
      ? items.filter((i) => i.name.toLowerCase().includes(filter.toLowerCase()))
      : items;
    if (selected >= visible.length) selected = Math.max(0, visible.length - 1);

    const lines = frame(paint, io, title, visible, selected, filter);
    io.write(eraseFrame(drawn) + lines.join('\n') + '\n');
    drawn = lines.length;

    const key = await keys.next();
    if (key.ctrl && key.name === 'c') return finish({ kind: 'quit' });
    switch (key.name) {
      case 'up':
        selected = Math.max(0, selected - 1);
        break;
      case 'down':
        selected = Math.min(visible.length - 1, selected + 1);
        break;
      case 'p':
      case 'n':
        // Only the ctrl forms navigate; plain p and n are filter characters.
        if (key.ctrl)
          selected =
            key.name === 'p'
              ? Math.max(0, selected - 1)
              : Math.min(visible.length - 1, selected + 1);
        else if (key.ch) {
          filter += key.ch;
          selected = 0;
        }
        break;
      case 'return': {
        const chosen = visible[selected];
        if (chosen) return finish({ kind: 'chosen', item: chosen });
        break;
      }
      case 'escape':
        if (filter) {
          filter = '';
          selected = 0;
        } else return finish({ kind: 'back' });
        break;
      case 'backspace':
        filter = filter.slice(0, -1);
        break;
      default:
        if (key.ch === 'q' && !filter) return finish({ kind: 'quit' });
        else if (key.ch) {
          filter += key.ch;
          selected = 0;
        }
    }
  }
}
