// End-to-end: arguments in, lines and an exit code out.

import { equal, match, ok } from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { run } from '../src/cli.mjs';

function capture(env = {}) {
  const out = [];
  const err = [];
  const io = {
    present: (lines) => {
      out.push(...lines);
    },
    err: (l) => err.push(l),
    env,
    isTTY: false,
    width: 80,
    rows: 24,
  };
  return {
    io,
    out,
    err,
    text: () => out.join('\n'),
    errText: () => err.join('\n'),
  };
}

async function crib(...argv) {
  const c = capture();
  const code = await run(argv, c.io);
  return { code, out: c.text(), err: c.errText() };
}

// Learn screens read and write the progress file, so every learn run gets a
// scratch CRIB_STATE — never the real one in the home directory.
function scratchState() {
  return join(mkdtempSync(join(tmpdir(), 'crib-test-')), 'progress.json');
}

async function learn(state, ...argv) {
  const c = capture({ CRIB_STATE: state });
  const code = await run(['learn', ...argv], c.io);
  return { code, out: c.text(), err: c.errText() };
}

describe('no arguments', () => {
  it('lists the tools', async () => {
    const { code, out } = await crib();
    equal(code, 0);
    for (const tool of [
      'gh',
      'git',
      'infisical',
      'lsof',
      'openclaw',
      'supabase',
    ]) {
      match(
        out,
        new RegExp(`\\n\\s+${tool}\\s`),
        `${tool} missing from the overview`,
      );
    }
  });

  it('points at the learning half', async () => {
    const { out } = await crib();
    match(out, /crib learn\s+Courses to work through/);
  });
});

describe('a tool on its own', () => {
  it('shows the menu, not the content', async () => {
    const { code, out } = await crib('gh');
    equal(code, 0);
    match(out, /Topics:\s+crib gh --<topic>/);
    match(out, /\n\s+pr\s+Pull requests/);
    ok(
      !out.includes('gh pr create'),
      'the menu should not include topic content',
    );
  });

  it('keeps the menu short', async () => {
    const { out } = await crib('gh');
    ok(out.split('\n').length < 40, 'the gh menu should fit on a screen');
  });
});

describe('one topic', () => {
  it('prints only that topic', async () => {
    const { code, out } = await crib('gh', '--pr');
    equal(code, 0);
    match(out, /gh pr create/);
    ok(!out.includes('gh auth login'), 'other topics leaked in');
  });

  it('treats the leading -- as optional', async () => {
    const withDashes = await crib('gh', '--pr');
    const without = await crib('gh', 'pr');
    equal(without.out, withDashes.out);
  });

  it('accepts a unique prefix', async () => {
    const short = await crib('gh', '--bro');
    const full = await crib('gh', '--browse');
    equal(short.out, full.out);
  });

  it('prints several when asked for several', async () => {
    const { out } = await crib('gh', '--pr', '--issue');
    match(out, /gh pr create/);
    match(out, /gh issue create/);
  });
});

describe('the whole guide', () => {
  it('includes every topic', async () => {
    const { code, out } = await crib('gh', '--all');
    equal(code, 0);
    match(out, /gh auth login/);
    match(out, /gh pr create/);
    match(out, /GH_TOKEN/);
  });
});

describe('mistakes', () => {
  it('shows the menu and fails on an unknown topic', async () => {
    const { code, out } = await crib('gh', '--nope');
    equal(code, 1);
    match(out, /Unknown topic: nope/);
    match(out, /Topics:/);
  });

  it('lists the candidates and fails on an ambiguous prefix', async () => {
    const { code, err } = await crib('git', '--s');
    equal(code, 1);
    match(err, /Ambiguous topic: s/);
    match(err, /setup snapshot sharing/);
  });

  it('names the tools it does know on an unknown tool', async () => {
    const { code, err } = await crib('nosuchtool');
    equal(code, 1);
    match(err, /Unknown tool: nosuchtool/);
    match(err, /gh, git, infisical, lsof, openclaw, rg, supabase/);
  });
});

describe('the learning half', () => {
  it('lists the courses', async () => {
    const { code, out } = await learn(scratchState());
    equal(code, 0);
    match(out, /crib learn — Courses/);
    match(out, /\n\s+shell\s/);
  });

  it("shows a course's lessons, not their content", async () => {
    const { code, out } = await learn(scratchState(), 'shell');
    equal(code, 0);
    match(out, /Lessons, in order:\s+crib learn shell --<lesson>/);
    match(out, /\n\s+line-editor\s/);
    ok(!out.includes('Ctrl-A'), 'the menu should not include lesson content');
  });

  it('prints a lesson, with the next one signposted', async () => {
    const { code, out } = await learn(scratchState(), 'shell', '--line-editor');
    equal(code, 0);
    match(out, /shell \/ line-editor/);
    match(out, /Ctrl-A/);
    match(out, /Next:\s+crib learn shell --history/);
  });

  it('marks a printed lesson read, and the menus show it', async () => {
    const state = scratchState();
    await learn(state, 'shell', '--line-editor');
    match(
      readFileSync(state, 'utf8'),
      /"shell\/line-editor": "\d{4}-\d{2}-\d{2}"/,
    );
    match((await learn(state, 'shell')).out, /✓ line-editor/);
    match((await learn(state)).out, /1\/2 read/);
  });

  it('resolves prefixes for the course and the lesson', async () => {
    const state = scratchState();
    const short = await learn(state, 'sh', '--line');
    const full = await learn(state, 'shell', '--line-editor');
    equal(short.out, full.out);
  });

  it('shows the menu and fails on an unknown lesson', async () => {
    const { code, out } = await learn(scratchState(), 'shell', '--nope');
    equal(code, 1);
    match(out, /Unknown lesson: nope/);
    match(out, /Lessons, in order:/);
  });

  it('names the courses it does know on an unknown course', async () => {
    const { code, err } = await learn(scratchState(), 'nosuchcourse');
    equal(code, 1);
    match(err, /Unknown course: nosuchcourse/);
    match(err, /shell/);
  });
});

describe('practice and drills need a terminal', () => {
  it('refuses to practise into a pipe, in one line', async () => {
    const c = capture({ CRIB_STATE: scratchState() });
    const code = await run(['learn', 'shell', '--practice'], c.io);
    equal(code, 1);
    match(c.errText(), /^crib: practice needs a terminal$/);
    equal(c.text(), '', 'nothing printed — a session is not a worksheet');
  });

  it('refuses to drill into a pipe', async () => {
    const c = capture({ CRIB_STATE: scratchState() });
    const code = await run(['drill'], c.io);
    equal(code, 1);
    match(c.errText(), /^crib: drill needs a terminal$/);
  });

  it('names the courses on an unknown one, before asking about terminals', async () => {
    const c = capture({ CRIB_STATE: scratchState() });
    const code = await run(['drill', 'nosuch'], c.io);
    equal(code, 1);
    match(c.errText(), /Unknown course: nosuch/);
  });

  it('leaves reading a lesson alone', async () => {
    const c = capture({ CRIB_STATE: scratchState() });
    equal(await run(['learn', 'shell', '--line-editor'], c.io), 0);
    match(c.text(), /Ctrl-A/);
  });
});

describe('interactive routing', () => {
  // An Io whose keyboard immediately quits: reaching a menu is observable as
  // "no lines were presented", since menus draw through interactive.write.
  function interactiveCapture(...argv) {
    const c = capture({ CRIB_STATE: scratchState() });
    c.io.isTTY = true;
    c.io.interactive = {
      keys: () => ({
        next: () => Promise.resolve({ name: 'q', ch: 'q', ctrl: false }),
        close: () => {},
      }),
      write: () => {},
    };
    return run(argv, c.io).then((code) => ({ code, out: c.text() }));
  }

  it('bare crib opens the menus instead of printing', async () => {
    const { code, out } = await interactiveCapture();
    equal(code, 0);
    equal(out, '');
  });

  it('a tool with no topic opens its menu', async () => {
    const { code, out } = await interactiveCapture('gh');
    equal(code, 0);
    equal(out, '');
  });

  it('learn with a course opens its lesson menu', async () => {
    const { code, out } = await interactiveCapture('learn', 'shell');
    equal(code, 0);
    equal(out, '');
  });

  it('--print forces the printed screens at a terminal', async () => {
    const c = capture();
    c.io.isTTY = true;
    c.io.interactive = {
      keys: () => ({
        next: () => Promise.reject(new Error('menus must not open')),
        close: () => {},
      }),
      write: () => {},
    };
    const code = await run(['--print'], c.io);
    equal(code, 0);
    match(c.text(), /Available guides:/);
  });

  it('a named topic prints even at a terminal', async () => {
    const c = capture();
    c.io.isTTY = true;
    c.io.interactive = {
      keys: () => ({
        next: () => Promise.reject(new Error('menus must not open')),
        close: () => {},
      }),
      write: () => {},
    };
    const code = await run(['gh', '--pr'], c.io);
    equal(code, 0);
    match(c.text(), /gh pr create/);
  });
});

describe('guides with no menu', () => {
  it('prints lsof in full, exactly as recorded', async () => {
    const { code, out } = await crib('lsof');
    equal(code, 0);
    const expected = readFileSync(
      new URL('./fixtures/lsof.txt', import.meta.url),
      'utf8',
    );
    equal(out + '\n', expected);
  });
});
