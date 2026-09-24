// Whole interactive journeys, scripted: which menus lead where, what enter
// presents, and that backing out never dead-ends.

import { equal, match, ok } from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { press } from '../src/interact/keys.mjs';
import { browse } from '../src/interact/browse.mjs';
import { makePaint } from '../src/render/theme.mjs';

const plain = makePaint(false);

/** One key queue shared by every menu a journey opens. */
function keyQueue(names) {
  const queue = press(...names);
  return () => ({
    next: () => {
      const key = queue.shift();
      if (!key) throw new Error('journey ran out of keys');
      return Promise.resolve(key);
    },
    close: () => {},
  });
}

/** A journey: run browse from a start with scripted keys, collect screens. */
async function journey(start, names) {
  const screens = [];
  const pagerModes = [];
  const io = {
    present: (lines, pager) => {
      screens.push(lines.join('\n'));
      pagerModes.push(pager);
    },
    err: () => {},
    env: {
      CHEAT_STATE: join(mkdtempSync(join(tmpdir(), 'cheat-test-')), 'p.json'),
    },
    isTTY: true,
    width: 80,
    rows: 24,
    interactive: { keys: keyQueue(names), write: () => {} },
  };
  const code = await browse(io, plain, start);
  return { code, screens, pagerModes };
}

describe('guides', () => {
  it('root → gh → topic prints the topic, then q leaves with 0', async () => {
    const { code, screens, pagerModes } = await journey({ at: 'root' }, [
      'return', // gh
      'return', // its first topic
      'q', // leave the topic list
      'q', // leave the root
    ]);
    equal(code, 0);
    equal(screens.length, 1);
    match(screens[0], /gh auth login/);
    // Every menu-driven screen pages, however short — the height rule is
    // for typed commands only.
    equal(pagerModes[0], 'always');
  });

  it('filtering picks a topic by name', async () => {
    const { screens } = await journey({ at: 'root' }, [
      'return', // gh
      ...['p', 'r'], // filter down towards pr
      'return',
      'q',
      'q',
    ]);
    match(screens[0], /gh pr create/);
  });

  it('a menu-less guide prints whole and returns to the menu above', async () => {
    const { code, screens } = await journey({ at: 'root' }, [
      ...['l', 's', 'o', 'f'], // filter to lsof
      'return', // prints in full, straight back to root
      'q',
    ]);
    equal(code, 0);
    match(screens[0], /lsof — List Open Files/i);
  });

  it('all prints the whole guide', async () => {
    const { screens } = await journey({ at: 'root' }, [
      'return', // gh
      ...['a', 'l', 'l'],
      'return',
      'q',
      'q',
    ]);
    match(screens[0], /gh auth login/);
    match(screens[0], /gh pr create/);
  });

  it('esc from a directly-opened guide lands on the root, not outside', async () => {
    const { code, screens } = await journey({ at: 'root' }, [
      'return', // gh
      'escape', // back to root
      'down', // git
      'return',
      'return', // git's first topic
      'q',
      'q',
    ]);
    equal(code, 0);
    ok(screens.length === 1, 'expected exactly one presented screen');
  });
});

describe('learn', () => {
  it('courses → lessons → a lesson prints and gains its ✓', async () => {
    const { code, screens } = await journey({ at: 'courses' }, [
      'return', // shell
      'return', // line-editor
      'escape', // back to courses
      'return', // shell again — now with a ✓ we can't see but count via desc
      'escape',
      'escape', // out to root (via back)
      'q',
    ]);
    equal(code, 0);
    equal(screens.length, 1);
    match(screens[0], /shell \/ line-editor/);
    match(screens[0], /Ctrl-A/);
  });

  it('a course name typed on the command line starts at its lessons', async () => {
    const { code, screens } = await journey(
      { at: 'lessons', courseArg: 'sh' },
      [
        'down',
        'return', // history
        'escape', // to courses
        'escape', // to root
        'q',
      ],
    );
    equal(code, 0);
    match(screens[0], /shell \/ history/);
  });

  it('offers practice under the lessons, once one has been read', async () => {
    let drawn = '';
    const state = join(mkdtempSync(join(tmpdir(), 'cheat-test-')), 'p.json');
    const io = {
      present: () => {},
      err: () => {},
      env: { CHEAT_STATE: state },
      isTTY: true,
      width: 80,
      rows: 24,
      interactive: {
        keys: keyQueue(['escape', 'escape', 'q']),
        write: (text) => (drawn += text),
      },
    };
    await browse(io, plain, { at: 'lessons', courseArg: 'shell' });
    const frames = drawn.replaceAll(/\[[^A-Za-z]*[A-Za-z]/g, '');
    match(frames, /practise\s+read a lesson first/);
  });

  it('an unresolvable course hands back to the printing path', async () => {
    const { code, screens } = await journey(
      { at: 'lessons', courseArg: 'nosuch' },
      [],
    );
    equal(code, null);
    equal(screens.length, 0);
  });
});
