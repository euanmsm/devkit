// Asking a question and waiting for a typed answer.
//
// The counterpart to interact/keys.mjs, and deliberately its opposite: menus
// take the keyboard raw, a character at a time, because they redraw a screen;
// a practice session is a conversation, so it uses cooked-mode readline and
// everything it prints stays in scrollback.
//
// The two must never hold stdin at once. select() closes its KeySource —
// restoring cooked mode and pausing stdin — before anything is presented, so
// a session opened from a menu finds the terminal in the state readline
// expects. openAsk() is the only thing that creates an interface, and it
// always closes it.

import { createInterface } from 'node:readline/promises';

/**
 * Where a session asks and writes, injectable for tests.
 *
 * @typedef {object} AskIo
 * @property {(prompt: string) => Promise<string>} ask Prints the prompt and resolves with the line typed.
 * @property {(text: string) => void} write
 */

/** Ctrl-C or Ctrl-D during a question: the session should end, not crash. */
export class SessionCancelled extends Error {}

/**
 * A real readline-backed AskIo, plus the close() that must run afterwards.
 * Ctrl-C and Ctrl-D both come back as SessionCancelled so a session can end
 * tidily rather than leaving a half-answered question recorded.
 */
export function openAsk(stdin, stdout) {
  const rl = createInterface({ input: stdin, output: stdout });
  let cancelled = false;
  rl.on('SIGINT', () => {
    cancelled = true;
    rl.close();
  });

  return {
    io: {
      ask: async (prompt) => {
        if (cancelled) throw new SessionCancelled();
        const answer = await rl.question(prompt);
        // A closed interface resolves with "" — that is Ctrl-D, not an answer.
        if (cancelled) throw new SessionCancelled();
        return answer;
      },
      write: (text) => stdout.write(text),
    },
    close: () => rl.close(),
  };
}

/** The test double: answers off an array, output onto a string. */
export function scriptedAsk(answers) {
  const remaining = [...answers];
  let written = '';
  return {
    ask: (prompt) => {
      written += prompt;
      const answer = remaining.shift();
      if (answer === undefined) throw new SessionCancelled();
      written += answer + '\n';
      return Promise.resolve(answer);
    },
    write: (text) => {
      written += text;
    },
    output: () => written,
  };
}
