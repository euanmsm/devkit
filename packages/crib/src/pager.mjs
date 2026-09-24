// Handing long output to a pager.
//
// `crib openclaw --all` is over nine hundred lines. On a terminal that is
// worth paging; piped or redirected it must stay exactly as it was, because
// `crib gh --pr > notes.txt` and the recorded lsof fixture both depend on it.

import { spawn } from 'node:child_process';

/**
 * @typedef {object} PagerContext
 * @property {NodeJS.ProcessEnv} env
 * @property {boolean} isTTY
 * @property {number} rows
 */

/**
 * `-R` keeps the colour, and that is deliberately all.
 *
 * No `-X`: it suppresses the terminal's init sequences, so less never switches
 * to the alternate screen. Outside it the terminal handles the mouse wheel
 * itself and scrolls its own scrollback — which holds only the one screenful
 * less painted — so the wheel does nothing, arrow keys are the only way to
 * move, and everything past the first screen reads as missing. Staying on the
 * alternate screen costs the output vanishing when you quit, which is the same
 * bargain `man` makes.
 *
 * No `--mouse` either: it would make less grab the wheel directly, but it also
 * captures the mouse, so selecting a command to copy stops working.
 *
 * No `-F`: shouldPage() already refuses to page anything that fits.
 */
const LESS_ARGS = ['-R'];

/**
 * The pager to run, as command and arguments, or undefined for "just print".
 * `less` on its own gets our arguments; a pager someone spelled out themselves
 * is run exactly as they wrote it.
 */
export function pagerCommand(env) {
  const chosen = env['CRIB_PAGER'] ?? env['PAGER'] ?? 'less';
  const parts = chosen.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return undefined;
  const [command, ...args] = parts;
  if (command === 'cat') return undefined;
  return command === 'less' && args.length === 0
    ? [command, ...LESS_ARGS]
    : [command, ...args];
}

/**
 * True when the caller should page rather than print: a terminal, more lines
 * than fit on it, and nothing asking us not to.
 *
 * `always` skips the height check — the interactive menus page every screen,
 * however short, so enter always opens the same view and q always comes back
 * to the menu. A terminal and the absence of NO_PAGER are still required.
 */
export function shouldPage(context, lineCount, always = false) {
  if (!context.isTTY) return false;
  if (context.env['NO_PAGER']) return false;
  return always || lineCount > context.rows - 1;
}

/**
 * Runs the pager with the lines on its stdin. Returns false when it could not
 * be started at all — no such command — so the caller can print instead.
 */
export async function page(lines, env) {
  const command = pagerCommand(env);
  if (!command) return false;
  const [file, ...args] = command;

  return new Promise((resolve) => {
    const child = spawn(file, args, {
      stdio: ['pipe', 'inherit', 'inherit'],
      env,
    });

    // The pager exiting first — someone pressing q — closes the pipe under us.
    child.stdin.on('error', () => {});
    child.on('error', () => resolve(false));
    child.on('close', () => resolve(true));

    child.stdin.end(lines.join('\n') + '\n');
  });
}
