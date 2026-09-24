import { deepEqual, equal, ok } from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderItem, renderItems } from '../src/render/items.mjs';
import { layoutFor, layoutFrom } from '../src/render/layout.mjs';
import { colourEnabled, makePaint } from '../src/render/theme.mjs';

const plain = makePaint(false);

/** Names up to 20 wide on an 80-column terminal. */
const layout = layoutFrom(20, 80);

/** Where a line's description begins, which is the thing that must line up. */
const columnOf = (line, desc) => line.indexOf(desc);

const indentOf = (line) => line.length - line.trimStart().length;

const guideOf = (items) => ({
  name: 't',
  title: 't',
  summary: 't',
  intro: [],
  topics: [{ name: 'x', description: 'x', sections: [{ title: 'x', items }] }],
});

describe('colourEnabled', () => {
  it('follows the terminal by default', () => {
    equal(colourEnabled({}, true), true);
    equal(colourEnabled({}, false), false);
  });

  it('obeys NO_COLOR even on a terminal', () => {
    equal(colourEnabled({ NO_COLOR: '1' }, true), false);
  });

  it('obeys FORCE_COLOR even when piped', () => {
    equal(colourEnabled({ FORCE_COLOR: '1' }, false), true);
    equal(colourEnabled({ FORCE_COLOR: '0' }, false), false);
  });

  it('lets FORCE_COLOR win over NO_COLOR', () => {
    equal(colourEnabled({ NO_COLOR: '1', FORCE_COLOR: '1' }, false), true);
  });
});

describe('paint', () => {
  it('adds nothing when colour is off', () => {
    equal(plain('hello', 'green'), 'hello');
  });

  it('wraps and resets when colour is on', () => {
    equal(makePaint(true)('hi', 'green'), '\u001b[32mhi\u001b[0m');
  });
});

describe('layout', () => {
  it('measures the column from the names a guide actually has', () => {
    const short = layoutFor(
      guideOf([{ kind: 'cmd', name: 'go', desc: 'd' }]),
      80,
    );
    const long = layoutFor(
      guideOf([{ kind: 'cmd', name: 'a'.repeat(30), desc: 'd' }]),
      80,
    );
    ok(
      short.column < long.column,
      'a guide of short names should get a narrower column',
    );
  });

  it("counts a flag's own indent when measuring", () => {
    const name = '-x, --example <value>';
    const asCmd = layoutFor(guideOf([{ kind: 'cmd', name, desc: 'd' }]), 80);
    const asFlag = layoutFor(guideOf([{ kind: 'flag', name, desc: 'd' }]), 80);
    equal(asFlag.column - asCmd.column, 2, 'flags sit two further in');
  });

  it('never lets the column crowd out the description', () => {
    const narrow = layoutFrom(200, 40);
    ok(narrow.width - narrow.column >= 24, 'descriptions need room to read');
  });

  it('stops widening on a very wide terminal', () => {
    equal(layoutFrom(30, 500).width, 100);
  });

  it('uses the whole window when the window is small', () => {
    equal(layoutFrom(30, 70).width, 70);
  });
});

describe('renderItem', () => {
  it("puts every kind of item's description in the same column", () => {
    const [cmd] = renderItem(plain, layout, {
      kind: 'cmd',
      name: 'gh pr list',
      desc: 'List PRs',
    });
    const [flag] = renderItem(plain, layout, {
      kind: 'flag',
      name: '-d, --draft',
      desc: 'Draft',
    });
    const [subcmd] = renderItem(plain, layout, {
      kind: 'subcmd',
      name: 'list',
      desc: 'List them',
    });
    equal(columnOf(cmd, 'List PRs'), layout.column);
    equal(columnOf(flag, 'Draft'), layout.column);
    equal(columnOf(subcmd, 'List them'), layout.column);
  });

  it('indents flags and subcommands further than commands', () => {
    const [cmd] = renderItem(plain, layout, {
      kind: 'cmd',
      name: 'c',
      desc: 'd',
    });
    const [flag] = renderItem(plain, layout, {
      kind: 'flag',
      name: 'f',
      desc: 'd',
    });
    equal(indentOf(cmd), 2);
    equal(indentOf(flag), 4);
  });

  it('ignores indentation baked into a name', () => {
    const [padded] = renderItem(plain, layout, {
      kind: 'flag',
      name: '   --url <url>',
      desc: 'Gateway URL',
    });
    const [bare] = renderItem(plain, layout, {
      kind: 'flag',
      name: '--url <url>',
      desc: 'Gateway URL',
    });
    equal(padded, bare);
  });

  it('gives a name that reaches the column a line of its own', () => {
    const long = '-s, --state <open|closed|merged|all>';
    const lines = renderItem(plain, layout, {
      kind: 'flag',
      name: long,
      desc: 'Filter state',
    });
    equal(lines.length, 2);
    ok(lines[0].endsWith(long), 'the name should not be broken up');
    equal(
      columnOf(lines[1], 'Filter state'),
      layout.column,
      'its description still starts at the column',
    );
  });

  it('wraps a long description back to the column, not to the margin', () => {
    const lines = renderItem(plain, layout, {
      kind: 'cmd',
      name: 'go',
      desc: 'a description far too long to sit on one line of this terminal',
    });
    ok(lines.length > 1, 'it should have wrapped');
    for (const line of lines.slice(1)) equal(indentOf(line), layout.column);
  });

  it("prints a command's children directly beneath it", () => {
    const lines = renderItem(plain, layout, {
      kind: 'cmd',
      name: 'git worktree',
      desc: 'Manage worktrees',
      children: [{ kind: 'subcmd', name: 'list', desc: 'List working trees' }],
    });
    equal(lines.length, 2);
    equal(indentOf(lines[1]), 4);
  });

  it('renders a gap as a genuinely empty line', () => {
    deepEqual(renderItem(plain, layout, { kind: 'gap' }), ['']);
  });

  it('never draws past the width it was given', () => {
    const narrow = layoutFrom(20, 46);
    const lines = renderItems(plain, narrow, [
      { kind: 'cmd', name: 'a'.repeat(40), desc: 'with a description too' },
      { kind: 'note', text: 'a note long enough that it has to be wrapped' },
      { kind: 'flag', name: '-x', desc: 'short' },
    ]);
    for (const line of lines) ok([...line].length <= narrow.width, line);
  });
});

describe('renderItems', () => {
  it('keeps items in the order they were written', () => {
    const lines = renderItems(plain, layout, [
      { kind: 'note', text: 'first' },
      { kind: 'cmd', name: 'second', desc: '' },
    ]);
    ok(lines[0].includes('first'));
    ok(lines[1].includes('second'));
  });

  it("keeps a note's own nesting", () => {
    const [flush, nested] = renderItems(plain, layout, [
      { kind: 'note', text: 'flush' },
      { kind: 'note', text: '  nested' },
    ]);
    equal(indentOf(flush), 2);
    equal(indentOf(nested), 4);
  });
});
