# render

Objects in, strings out. Every function here takes data and returns an array of
lines; none of them print anything, and none of them know where the lines are
going. `cli.mjs` does the writing.

Returning arrays rather than printing is what lets the tests compare whole
screens against an expected value, and what lets `renderWholeGuide` be built by
concatenating the pieces `renderTopic` already returns.

## The files

**`theme.mjs`** — colour, and the decision of whether to use it. `makePaint()`
returns a function that wraps text in ANSI escape codes, or, when colour is off,
returns the text untouched. Everything downstream takes that function as an
argument and never asks whether colour is on, so there is exactly one branch on
the question in the whole codebase.

Colour follows [no-color.org](https://no-color.org): on for a terminal, off when
the output is piped or redirected, `NO_COLOR` forces it off and `FORCE_COLOR`
forces it back on.

**`layout.mjs`** — how wide to draw and where descriptions start. One column per
guide, measured from the names that guide actually contains and capped at 45% of
the window, so every kind of line shares it and the descriptions form a single
straight edge. This is the only file with a number in it.

**`items.mjs`** — one item to one or more lines. `cliui` does the column
arithmetic and the wrapping; this file handles the two things it won't. A name
too long for the column takes a line of its own rather than being broken
mid-word, and indentation travels as cell padding, because cliui strips leading
spaces from cell text.

**`guide.mjs`** — assembling whole screens from items: a guide's opening, one
topic, or everything.

**`menu.mjs`** — the screens that help you find something rather than showing
it: the topic menu, the no-argument overview, and the three error screens.

## Changing the layout

The widths were once fixed — 45 for a command, 40 for a flag, 42 for a
subcommand, all inherited from the bash script this replaced. They were sized
for the longest name in the whole collection, so the median flag line carried 25
characters of empty space, and because the number differed by kind the
descriptions sat in three columns and zigzagged down the page. Nothing read the
terminal width either, so 179 lines ran off the side of an 80-column window.

The constants that remain live in `layout.mjs`: the 45% share, the
hundred-column ceiling, and the minimum room a description gets. Changing one
moves every line of every guide, so expect `test/fixtures/lsof.txt` to need
regenerating. See [test/README.md](../../test/README.md) for how.

The way to check a change is to render every screen at several widths before and
after and read the diff — the same method that proved the original port from
bash.
