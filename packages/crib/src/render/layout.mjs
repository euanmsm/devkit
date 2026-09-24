// How wide to draw, and where the descriptions start.
//
// The old widths were fixed numbers — 45 for a command, 40 for a flag, 42 for a
// subcommand — inherited from the bash script this replaces. They were sized
// for the longest name in the whole collection, so the median flag line carried
// 25 characters of empty space, and because the number differed per kind the
// descriptions landed in three different columns and zigzagged down the page.
//
// Now there is one column per guide, measured from the names actually in it and
// capped against the window. Every kind of line shares it, so the descriptions
// form a single straight edge; the indent alone says what is nested under what.

/** How far each kind of line is indented from the left margin. */
export const INDENT = { cmd: 2, flag: 4, subcmd: 4 };

/** The margin down both sides of every screen. */
export const MARGIN = 2;

/**
 * Wide terminals get a readable measure rather than the full window — past
 * about a hundred characters a line is harder to track back from, not easier.
 */
const MAX_WIDTH = 100;

/** No more than this share of the width goes to names. */
const COLUMN_SHARE = 0.45;

/** Descriptions always get at least this much room. */
const MIN_DESC = 24;

/**
 * Low enough to stay out of the way. A menu of short topic names should get a
 * short column, not be padded out to some notion of a respectable width.
 */
const MIN_COLUMN = 8;

/**
 * @typedef {object} Layout
 * @property {number} width Total width to draw within.
 * @property {number} column The column every description starts at.
 */

const measure = (text) => [...text.trim()].length;

/**
 * The shared rule, given how wide the widest name is. Names longer than the
 * column are not accommodated — they spill onto their own line instead, which
 * costs one line each rather than pushing every description right.
 */
export function layoutFrom(widest, terminalWidth) {
  const width = Math.max(
    MIN_COLUMN + MIN_DESC,
    Math.min(terminalWidth, MAX_WIDTH),
  );
  const cap = Math.floor(width * COLUMN_SHARE);
  const column = Math.min(
    Math.max(Math.min(widest, cap) + 2, MIN_COLUMN),
    width - MIN_DESC,
  );
  return { width, column };
}

function widestIn(items, indent, seen) {
  for (const item of items) {
    switch (item.kind) {
      case 'cmd':
        seen.push(indent + measure(item.name));
        widestIn(item.children ?? [], indent + 2, seen);
        break;
      case 'flag':
      case 'subcmd':
        seen.push(INDENT[item.kind] + measure(item.name));
        break;
      case 'note':
      case 'gap':
        break;
    }
  }
}

/**
 * One column for a whole guide, so it holds steady as you scroll from topic to
 * topic. Per topic would be a little tighter on each screen, but the river
 * would shift every time you crossed a heading.
 */
export function layoutFor(guide, terminalWidth) {
  const seen = [];
  widestIn(guide.intro, INDENT.cmd, seen);
  for (const topic of guide.topics)
    for (const section of topic.sections)
      widestIn(section.items, INDENT.cmd, seen);
  return layoutFrom(Math.max(0, ...seen), terminalWidth);
}

/** The same rule for the menu and overview screens, which have no guide. */
export function layoutForNames(names, indent, terminalWidth) {
  return layoutFrom(
    Math.max(0, ...names.map((n) => indent + measure(n))),
    terminalWidth,
  );
}
