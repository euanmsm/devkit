# test

```bash
npm test   # from the devkit root: every package, these included
```

Node's own test runner, so there is no framework to learn — `describe`, `it` and
`node:assert/strict`. No mocks anywhere; `run()` in `src/cli.mjs` takes its
input and output as an argument, so the end-to-end tests just pass in functions
that push onto an array.

## The files

**`resolve.test.mjs`** — the rules for matching what someone typed to a topic:
exact names win over prefixes, a prefix matching several topics is reported
rather than guessed at, `--PR` and `pr` mean the same thing.

**`render.test.mjs`** — the layout rule, indentation, nesting, and when colour
is on. It asserts the rules rather than the numbers: that every kind of line in
one guide shares a description column, that a name too long for that column
takes a line of its own, that a wrapped description comes back to the column
rather than the margin, and that nothing is drawn past the width it was given. A
tighter or looser column is free to change; a broken one fails here.

**`pager.test.mjs`** — which pager runs and when. The arguments look trivial and
are not: `less -X` keeps less off the alternate screen, and off it the mouse
wheel scrolls the terminal's own scrollback rather than the document, so the
wheel appears dead and everything past the first screen appears missing. There
is a test whose whole job is that `-X` never comes back.

**`cli.test.mjs`** — the whole thing, arguments in and lines and an exit code
out. Covers each screen, the three ways to get it wrong, and the exit codes.

**`guides.test.mjs`** — checks that hold for every guide in the registry rather
than any one of them, so a new tool can't be added half-wired. It loads them all
and asserts that topic names are typeable, unique and described, that nothing
claims the reserved name `all`, that every topic renders to more than a heading,
and that the registry stays alphabetical and agrees with each guide about its
name.

That last file is why adding a guide needs no new tests. Getting the flags right
is still on you — nothing here can tell you a description is wrong, only that it
exists.

## The lsof fixture

`fixtures/lsof.txt` is the entire `cheat lsof` screen, recorded. `cli.test.mjs`
compares against it byte for byte, which makes it the tripwire for accidental
layout changes: a stray space or a moved column fails this one test loudly
rather than quietly changing all 89 screens.

`lsof` is the fixture because it's the only guide with `menu: false`, so it
exercises the full-guide path in a single short screen.

It is recorded at 80 columns, which is what redirected output always uses —
`cheat` reads `process.stdout.columns` and there isn't one when the output is a
file, so the recording does not depend on the window you made it in.

When you change the layout on purpose, regenerate it:

```bash
node bin/cheat.mjs lsof > test/fixtures/lsof.txt
```

Then read the diff before committing — that diff is the change to every screen,
which is the point of having it. Colour is off automatically because the output
is redirected rather than going to a terminal.

`fixtures/` is in `.prettierignore`. Formatting it would break the byte-for-byte
comparison.
