// The list selector, driven by scripted keys: what gets chosen, how the
// filter behaves, and that frames stay inside the terminal.

import { deepEqual, match, ok } from 'node:assert/strict';
import { describe, it } from 'node:test';
import { press, scriptedKeys } from '../src/interact/keys.mjs';
import { select } from '../src/interact/select.mjs';
import { makePaint } from '../src/render/theme.mjs';

const plain = makePaint(false);

const ITEMS = [
  { name: 'gh', desc: 'GitHub CLI' },
  { name: 'git', desc: 'Git' },
  { name: 'lsof', desc: 'Open files' },
  { name: 'supabase', desc: 'Supabase CLI' },
];

function run(names, items = ITEMS, rows = 24) {
  let drawn = '';
  const io = {
    write: (text) => (drawn += text),
    keys: () => scriptedKeys(press(...names)),
    width: 80,
    rows,
  };
  return {
    outcome: select(plain, io, 'pick one', items),
    // The frames, with the control sequences stripped back out.
    frames: () => drawn.replaceAll(/\u001b\[[^A-Za-z]*[A-Za-z]/g, ''),
  };
}

describe('choosing', () => {
  it('enter picks the first item by default', async () => {
    const { outcome } = run(['return']);
    deepEqual(await outcome, { kind: 'chosen', item: ITEMS[0] });
  });

  it('arrows move the selection', async () => {
    const { outcome } = run(['down', 'down', 'up', 'return']);
    deepEqual(await outcome, { kind: 'chosen', item: ITEMS[1] });
  });

  it('ctrl-n and ctrl-p move too', async () => {
    const { outcome } = run(['ctrl-n', 'ctrl-n', 'ctrl-p', 'return']);
    deepEqual(await outcome, { kind: 'chosen', item: ITEMS[1] });
  });

  it('draws the cursor against the selected row', async () => {
    const { outcome, frames } = run(['down', 'return']);
    await outcome;
    match(frames(), /▸ git\s/);
  });
});

describe('filtering', () => {
  it('typed characters narrow the list', async () => {
    const { outcome } = run(['s', 'u', 'return']);
    deepEqual(await outcome, { kind: 'chosen', item: ITEMS[3] });
  });

  it('q and n filter rather than quit or navigate', async () => {
    // "gh" and "git" both contain g; then "i" leaves git alone.
    const { outcome } = run(['g', 'i', 'return']);
    deepEqual(await outcome, { kind: 'chosen', item: ITEMS[1] });
  });

  it('backspace edits and esc clears before it goes back', async () => {
    const { outcome } = run([
      'z',
      'z',
      'backspace',
      'backspace',
      's',
      'escape',
      'escape',
    ]);
    deepEqual(await outcome, { kind: 'back' });
  });

  it('says so when nothing matches', async () => {
    const { outcome, frames } = run(['z', 'escape', 'escape']);
    await outcome;
    match(frames(), /\(no matches\)/);
  });
});

describe('leaving', () => {
  it('esc backs out', async () => {
    deepEqual(await run(['escape']).outcome, { kind: 'back' });
  });

  it('q quits when the filter is empty', async () => {
    deepEqual(await run(['q']).outcome, { kind: 'quit' });
  });

  it('ctrl-c quits from anywhere', async () => {
    deepEqual(await run(['g', 'ctrl-c']).outcome, { kind: 'quit' });
  });

  it('shows the cursor again on the way out', async () => {
    let drawn = '';
    const io = {
      write: (t) => (drawn += t),
      keys: () => scriptedKeys(press('q')),
      width: 80,
      rows: 24,
    };
    await select(plain, io, 't', ITEMS);
    ok(drawn.endsWith('[?25h'), 'cursor left hidden');
  });
});

describe('sections', () => {
  const sectioned = [
    { name: 'gh', desc: 'GitHub CLI' },
    { name: 'learn', desc: 'Courses', gapBefore: true },
  ];

  it('draws a blank line above a gapBefore row, which stays selectable', async () => {
    const { outcome, frames } = run(['down', 'return'], sectioned);
    deepEqual(await outcome, { kind: 'chosen', item: sectioned[1] });
    match(frames(), /gh {2,}GitHub CLI\n\n\s+▸ learn/);
  });

  it('drops the gap while a filter is active', async () => {
    const { outcome, frames } = run(['l', 'return'], sectioned);
    deepEqual((await outcome).kind, 'chosen');
    ok(
      !/\n\n\s+▸ learn/.test(frames().split('filter:')[1] ?? ''),
      'filtered list should be one list',
    );
  });
});

describe('fitting the terminal', () => {
  const many = Array.from({ length: 40 }, (_, n) => ({
    name: `item-${String(n).padStart(2, '0')}`,
    desc: 'x'.repeat(200),
  }));

  it('scrolls a long list inside a short window, selection visible', async () => {
    const { outcome, frames } = run(
      Array(39).fill('down').concat('return'),
      many,
      10,
    );
    deepEqual((await outcome).kind, 'chosen');
    match(frames(), /▸ item-39/);
  });

  it('draws nothing wider than the terminal', async () => {
    const { outcome, frames } = run(['return'], many, 10);
    await outcome;
    for (const line of frames().split('\n'))
      ok([...line].length <= 80, `overflows: ${line}`);
  });
});
