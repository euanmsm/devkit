// Colour, and the decision of whether to use it.

/**
 * Colour is on for a terminal and off when the output is being piped or
 * redirected, so `crib gh --pr > notes.txt` gives a clean file. `NO_COLOR=1`
 * forces it off, `FORCE_COLOR=1` forces it back on.
 *
 * https://no-color.org
 */
export function colourEnabled(env, isTTY) {
  if (env['FORCE_COLOR'] && env['FORCE_COLOR'] !== '0') return true;
  if (env['NO_COLOR']) return false;
  return isTTY;
}

const ESC = '\u001b';

const CODES = {
  bold: `${ESC}[1m`,
  dim: `${ESC}[2m`,
  reset: `${ESC}[0m`,
  cyan: `${ESC}[36m`,
  yellow: `${ESC}[33m`,
  green: `${ESC}[32m`,
  magenta: `${ESC}[35m`,
  white: `${ESC}[97m`,
  blue: `${ESC}[34m`,
};

/**
 * @typedef {keyof Omit<typeof CODES, "reset">} Colour
 */

/**
 * Wraps text in colour codes, or returns it untouched when colour is off.
 *
 * @typedef {(text: string, ...colours: Colour[]) => string} Paint
 */

export function makePaint(enabled) {
  if (!enabled) return (text) => text;
  return (text, ...colours) =>
    colours.map((c) => CODES[c]).join('') + text + CODES.reset;
}
