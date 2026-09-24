// The practice loop: ask, judge, say why, record, move on.
//
// A session is a transcript, not a screen — questions scroll past and stay in
// scrollback, which is the line drawn in plan/README.md between navigation
// (raw-mode menus) and conversation (readline). Nothing here redraws, and
// nothing here reaches for the pager.
//
// Two rules from plan/exercises.md that the code exists to enforce: one
// attempt per question per session, because a retry ten seconds later teaches
// nothing and the drill queue is the real comeback; and every miss shows the
// answer with its note immediately, because that is the moment of maximum
// attention.

import { SessionCancelled } from './ask.mjs';
import { judge, modelAnswer, optionLetter } from './exercise.mjs';

/**
 * One exercise, and where its card lives in the progress file.
 *
 * @typedef {object} Question
 * @property {Exercise} exercise
 * @property {string} key `course/lesson/exercise-id`.
 * @property {string} [origin] Shown above the prompt on a drill, where cards come from everywhere.
 */

/**
 * How a session ended, and what it did.
 *
 * @typedef {object} SessionResult
 * @property {number} asked
 * @property {number} right
 * @property {boolean} cancelled True when the user walked out early — nothing further was recorded.
 */

/**
 * Told when a question is answered, so the caller can write it down.
 *
 * @typedef {(key: string, right: boolean) => void} Record_
 */

const INDENT = '  ';

/** Wraps a prompt to the width, indented under its question number. */
function wrap(text, width, hanging) {
  const room = Math.max(20, width - hanging.length);
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (line && [...line].length + 1 + [...word].length > room) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Runs one session to the end, or until the user leaves. Returns what
 * happened; the caller decides what to say about it.
 */
export async function runSession(io, paint, width, title, questions, record) {
  const say = (line = '') => io.write(line + '\n');
  let asked = 0;
  let right = 0;

  say();
  say(INDENT + paint(title, 'bold'));
  say(
    INDENT +
      paint(
        `${questions.length} ${questions.length === 1 ? 'exercise' : 'exercises'} · ctrl-c to stop`,
        'dim',
      ),
  );
  say();

  try {
    for (const [index, question] of questions.entries()) {
      const { exercise } = question;
      const number = `${index + 1}/${questions.length}`;
      const hanging = INDENT + ' '.repeat(number.length + 2);

      // The question itself, numbered, wrapped under its own number.
      const promptLines = wrap(exercise.prompt, width - 4, hanging);
      say(`${INDENT}${paint(number, 'bold', 'cyan')}  ${promptLines[0]}`);
      for (const line of promptLines.slice(1)) say(hanging + line);

      if (exercise.kind === 'choice') {
        say();
        // Options go on one line when they fit — four short keystrokes read
        // as a set that way, and as a list they read as four questions.
        const labelled = exercise.options.map(
          (option, n) => `${paint(optionLetter(n) + ')', 'bold')} ${option}`,
        );
        const oneLine = hanging + labelled.join('   ');
        if ([...oneLine].length <= width) say(oneLine);
        else for (const line of labelled) say(hanging + line);
      }
      say();

      // One attempt. Recall reveals and self-grades; the others are judged.
      let correct;
      if (exercise.kind === 'recall') {
        await io.ask(hanging + paint('(enter to reveal) ', 'dim'));
        say();
        say(hanging + paint(modelAnswer(exercise), 'green'));
        say();
        const grade = await io.ask(hanging + 'Did you have it? [y/n] ');
        correct = /^\s*y/i.test(grade);
      } else {
        const answer = await io.ask(hanging + '> ');
        correct = judge(exercise, answer) === true;
      }
      say();

      // The verdict carries the note, because a bare "wrong" wastes the
      // moment of most attention. A judged miss shows the answer first and
      // drops the note underneath it.
      const mark = correct
        ? paint('✓', 'bold', 'green')
        : paint('✗', 'bold', 'magenta');
      if (!correct && exercise.kind !== 'recall') {
        say(`${INDENT}${mark}  ${paint(modelAnswer(exercise), 'green')}`);
        say(`${INDENT}   ${paint(exercise.note, 'dim')}`);
      } else say(`${INDENT}${mark}  ${paint(exercise.note, 'dim')}`);

      if (correct) right++;
      asked++;
      record(question.key, correct);
      say();
    }
  } catch (error) {
    if (!(error instanceof SessionCancelled)) throw error;
    say();
    say(INDENT + paint('Stopped — what you answered is kept.', 'dim'));
    say();
    return { asked, right, cancelled: true };
  }

  // The summary earns its line only by saying what happens next.
  const missed = asked - right;
  say(
    INDENT +
      paint(
        missed === 0
          ? `All ${asked} right. They come back further out.`
          : `${right} of ${asked} — the ${missed === 1 ? 'one' : missed} you missed ${missed === 1 ? 'comes' : 'come'} back tomorrow.`,
        'bold',
      ),
  );
  say();
  return { asked, right, cancelled: false };
}
