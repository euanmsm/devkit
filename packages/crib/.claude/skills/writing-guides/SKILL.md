---
name: writing-guides
description:
  'Load this BEFORE adding or editing any guide under src/guides/ in the crib
  repo — new tool, new topic, or reworking an existing one. Covers the five item
  kinds and how each renders, the flag-over-note density rule that decides
  whether a guide looks right, the leading-space trick that indents a nested
  note, the shared description column, wiring into index.mjs and registry.mjs,
  and the verify-before-you-write discipline. The types and the tests do not
  encode any of this; a guide can pass every check and still render as a wall.'
---

# Writing a guide

A guide is data. `src/guides/<tool>/index.mjs` exports a `Guide`, one file
beside it per topic, and nothing under `src/guides/` contains logic. The
renderer decides how it looks, so the only lever you have is which item kind you
choose — and that choice is the whole difference between a guide that matches
the others and one that doesn't.

Read [`src/guides/README.md`](../../../src/guides/README.md) for the shape. This
file is the part that isn't written down anywhere else.

## The one rule that matters most

**Flags carry the information. Notes are for the occasional caveat.**

A `flag` renders as an indented, coloured name against the shared description
column — scannable, and it costs one line. A `note` renders as a full-width line
of grey prose that interrupts the column. Reach for `note` when you have
something a description genuinely cannot hold, and reach for `flag` the rest of
the time.

Here is what the repo actually does:

| Guide     | cmd | flag | note |
| --------- | --- | ---- | ---- |
| gh        | 187 | 366  | 21   |
| git       | 42  | 380  | 7    |
| infisical | 46  | 129  | 5    |
| openclaw  | 280 | 537  | 17   |
| supabase  | 77  | 119  | 4    |

Roughly **two flags per command, and a note every ten or twenty**. If your draft
is anywhere near one note per command, you have written prose where the repo
writes a two-column list, and it will look wrong on screen no matter how good
the content is. The `rg` guide shipped that way and had to be rebuilt.

Before you commit, count:

```bash
g=rg
for k in cmd flag subcmd note; do
  printf "%-7s %s\n" "$k" "$(rg -c "kind: \"$k\"" src/guides/$g/ | awk -F: '{s+=$2} END {print s+0}')"
done
```

## The five item kinds

| Kind     | Indent | Colour  | Use it for                        |
| -------- | ------ | ------- | --------------------------------- |
| `cmd`    | 2      | green   | A command, or an example run      |
| `flag`   | 4      | magenta | An option on the command above    |
| `subcmd` | 4      | blue    | A subcommand of the command above |
| `note`   | 2      | dim     | A caveat, a default, a gotcha     |
| `gap`    | —      | —       | A deliberate blank line           |

`flag`, `subcmd`, `note` and `gap` go in a `cmd`'s `children` array. A `flag` or
`subcmd` always renders at its own fixed indent regardless of nesting depth, so
nesting them deeper than one level buys nothing.

Never use a `flag` whose `name` is a label rather than something typeable.
`{ name: "Message types", desc: "begin, match, end" }` reads as a real option
and isn't one — make it a note.

## Nested notes need two leading spaces

This is the one that catches everybody.

A note does **not** inherit the indent of the command it is nested under. The
renderer takes its indent from the leading spaces in the note's own text
(`src/render/items.mjs`, the `note` case — cliui strips leading spaces from cell
text, so the nesting has to travel as padding).

So a note that belongs to a specific command needs the spaces written in:

```js
{
  kind: "cmd",
  name: "rg -g 'src/**' PATTERN",
  desc: "Confine the search to one directory",
  children: [
    {
      kind: "note",
      text: "  -g 'src' matches nothing — src/app.ts is not the glob src.",
    },
  ],
},
```

Without them it renders flush against the margin and reads as a comment on the
whole section, not on that command.

A note that really is about the section stays unindented, and belongs at the
**end** of the section rather than between the commands. Two or three of those
in a trailing block reads as a deliberate footnote; the same notes scattered
between commands read as a wall.

## The description column

Every description in a guide starts at one shared column, so they form a single
straight edge across every topic. The column is measured from the longest name
in the whole guide and capped at 45% of the window (`src/render/layout.mjs` —
the only file in the renderer with numbers in it).

Two consequences when writing:

- **One long name pushes the column right for the entire guide.** If a name
  reaches the cap it spills onto its own line instead, with the description
  underneath — that costs one line rather than shifting every other line. Don't
  fight it, but don't invent 60-character names either.
- **Descriptions are not wrapped by hand.** Write one line and let the renderer
  wrap it. Aim to keep the whole rendered line under about 100 characters.

## Writing the content

Names are exactly what you would type, placeholders included:
`gh browse [<number>|<path>|<sha>]`, `-b, --branch <branch>`.

Descriptions are terse and read at a glance, not studied. "Select branch" beats
"Allows you to select which branch to open". Match the tool's own `--help`
wording where it is clear and improve on it where it isn't.

Topic names are what someone types: lowercase, starting with a letter, letters
digits and hyphens only. `all` is reserved for the whole guide, and `learn` and
`drill` are reserved as first words for the learning half.

Sections group a topic when the commands genuinely fall into separate groups.
Most topics have exactly one; don't manufacture more.

## Verify before you write it down

Every command and flag in a guide should be checked against the installed tool,
not recalled. Recall is wrong often enough to matter, and a cheat sheet that is
subtly wrong is worse than no cheat sheet.

The `rg` guide's research turned up three things that contradicted a confident
first draft: the default regex engine rejects `\Q...\E`, PCRE2 10.45 allows
bounded variable-length lookbehind (only unbounded is refused), and `rg` with no
path reads stdin whenever stdin isn't a terminal — which hangs scripts.

A workable loop:

```bash
rg --help > /tmp/help.txt          # long help is the authoritative flag list
man rg | col -b > /tmp/man.txt     # extra sections: exit status, config files
mkdir -p /tmp/lab && cd /tmp/lab   # a corpus to run every example against
```

Then run each example you intend to publish. Two traps when testing in a
non-interactive shell:

- Redirect stdin (`exec < /dev/null`) or tools that read stdin will hang.
- A command returning nothing may be correct — check it against input that
  should match before concluding the syntax is wrong.

## Wiring it up

**A new topic:** create `src/guides/<tool>/<topic>.mjs` exporting a `Topic`,
then import it in that tool's `index.mjs` and add it to `topics`. The order
there is the order of the menu — group related topics rather than alphabetising.

**A new tool:** create `src/guides/<tool>/index.mjs` exporting a `Guide`, put
the topic files beside it, and add one entry to `src/registry.mjs`. **Keep the
registry alphabetical — a test enforces it.** Set `menu: false` when the guide
is short enough to print in full; `lsof` is the only one that is.

Adding a tool also means:

- `README.md` has a "Tools covered" line to extend.
- `test/cli.test.mjs` asserts the exact list of known tools in two places.

## What the tests check, and what they don't

`test/guides.test.mjs` runs against every guide in the registry, so one cannot
be added half-wired. It fails if a topic name isn't typeable, is duplicated, is
called `all`, or has no description; if a topic renders to almost nothing; if a
guide disagrees with the registry about its name; if the registry falls out of
alphabetical order; or if any line is drawn past the width it was given.

None of that checks whether the content is **correct**, and none of it checks
whether the guide **looks right**. A guide made entirely of notes passes every
test. Getting the flags right, and the density right, is on you.

## Look at it before you commit

Rendering is the only real review:

```bash
NO_PAGER=1 CRIB_WIDTH=100 ./bin/crib.mjs rg            # the menu
NO_PAGER=1 CRIB_WIDTH=100 ./bin/crib.mjs rg --regex    # one topic
NO_PAGER=1 CRIB_WIDTH=80  ./bin/crib.mjs rg --all      # the lot, narrow
```

Put a topic of yours beside `crib gh --gist` — the reference for what dense and
scannable looks like — and if yours has visibly more grey in it, convert notes
to flags until it doesn't.
