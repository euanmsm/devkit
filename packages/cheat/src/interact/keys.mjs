// Raw mode in, typed keypresses out.
//
// The one place the terminal is put into raw mode, and the one place it is
// guaranteed to come back out — on close, and on process exit as a safety
// net, so a crash mid-menu never leaves the shell eating its own keystrokes
// with the cursor hidden.

import { emitKeypressEvents } from 'node:readline';

/**
 * One keypress, reduced to what the selector needs.
 *
 * @typedef {object} Key
 * @property {string} name readline's key name — "up", "return", "escape" — or the character.
 * @property {string} [ch] The printable character, when the press was one.
 * @property {boolean} ctrl
 */

/**
 * A stream of keypresses the selector can await, injectable for tests.
 *
 * @typedef {object} KeySource
 * @property {() => Promise<Key>} next
 * @property {() => void} close
 */

/** Shown again on exit in case a crash left the cursor hidden. */
const SHOW_CURSOR = '\u001b[?25h';

/** The real thing: raw mode on the process's stdin until closed. */
export function terminalKeys(stdin) {
  const queue = [];
  const waiting = [];

  const onKeypress = (ch, key) => {
    const printable =
      ch !== undefined && !key?.ctrl && [...ch].length === 1 && ch >= ' ';
    const parsed = {
      name: key?.name ?? ch ?? '',
      ctrl: key?.ctrl ?? false,
      ...(printable ? { ch } : {}),
    };
    const woken = waiting.shift();
    if (woken) woken(parsed);
    else queue.push(parsed);
  };

  const restore = () => {
    stdin.setRawMode(false);
    process.stdout.write(SHOW_CURSOR);
  };

  emitKeypressEvents(stdin);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.on('keypress', onKeypress);
  process.once('exit', restore);

  return {
    next: () =>
      new Promise((resolve) => {
        const queued = queue.shift();
        if (queued) resolve(queued);
        else waiting.push(resolve);
      }),
    close: () => {
      stdin.off('keypress', onKeypress);
      process.off('exit', restore);
      stdin.setRawMode(false);
      // Pause so a closed menu hands stdin back to whatever runs next —
      // the pager needs it.
      stdin.pause();
    },
  };
}

/** The test double: keys off an array, in order. */
export function scriptedKeys(keys) {
  const remaining = [...keys];
  return {
    next: () => {
      const key = remaining.shift();
      if (!key) throw new Error('scriptedKeys ran dry');
      return Promise.resolve(key);
    },
    close: () => {},
  };
}

/** Sugar for writing test scripts: press("down", "down", "return"). */
export function press(...names) {
  return names.map((name) =>
    name.startsWith('ctrl-')
      ? { name: name.slice(5), ctrl: true }
      : name.length === 1
        ? { name, ch: name, ctrl: false }
        : { name, ctrl: false },
  );
}
