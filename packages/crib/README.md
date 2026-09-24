# crib

Quick reference sheets for the CLIs I use daily, in the terminal, without
opening a browser.

```
crib                    the tools with guides
crib gh                 gh's topics
crib gh --pr            the pull request commands
crib gh --all           the whole gh guide
```

## Using it

At a terminal, `crib` on its own — or a tool on its own — opens a menu you drive
with the keyboard:

```
$ crib gh

  gh — GitHub CLI

  ▸ auth         Log in, tokens, scopes, account switching
    browse       Open repos, files and PRs in the browser
    repo         Create, clone, fork and manage repos
    …
    all          Show the whole guide

  ↑↓ move · ⏎ open · type to filter · esc back · q quit
```

Enter prints the topic (paged when long) and brings the menu back when you quit
the pager; typing filters the list the way fzf does; esc walks up a level. Piped
or redirected output skips the menus entirely and prints the plain lists
instead, so `crib gh | cat` and scripts see exactly what they always did — and
`--print` forces those printed screens at a terminal too.

Everything below works identically whether you reached it by menu or by typing.
The leading `--` is optional, so `crib gh pr` and `crib gh --pr` are the same.
Any prefix that matches one topic works, so `crib gh --bro` finds `browse`; a
prefix matching several lists them instead of guessing. Several topics at once
is fine: `crib gh --pr --issue`.

Colour is dropped when the output isn't going to a terminal, so
`crib gh --pr > notes.txt` gives a clean file. `NO_COLOR=1` turns it off
anywhere, `FORCE_COLOR=1` turns it back on.

Screens are drawn to fit the window, up to a hundred columns.
`CRIB_WIDTH=60 crib gh --pr` renders at a width you aren't sitting at, which is
handy for checking a layout.

Anything longer than the terminal is tall goes through your pager, the same way
`man` does — so it scrolls, and the screen is yours again when you quit. In the
menus every screen pages, however short, so enter always opens the same view and
q always brings the menu back — no guessing which you'll get. `NO_PAGER=1` or
`--no-pager` prints it straight out instead, redirected output is never paged,
and `CRIB_PAGER` overrides `PAGER` if you want something different here than
everywhere else.

Tools covered: `gh`, `git`, `infisical`, `lsof`, `openclaw`, `rg`, `supabase`.

## Learning

Reference is for things you already know; `crib learn` is for getting them into
your head — courses read in the terminal, one lesson at a time, with progress
remembered between runs.

```
crib learn                       the courses, with your progress
crib learn shell                 one course's lessons
crib learn shell --line-editor   read a lesson
```

The same conventions as the rest: the `--` is optional, prefixes resolve, long
lessons page. A lesson you've printed is marked ✓ on the menus, remembered in
`~/.local/state/crib/progress.json` — delete the file to start over. Each lesson
ends by pointing at the next one, and at the guide topic that serves you after
the course is forgotten.

Reading is half of it. The other half is being asked:

```
crib learn shell --practice   questions on the lessons you've read
crib drill                    whatever's due for review today
crib drill shell              just that course
```

Practice is a conversation rather than a screen — a question, your answer, the
right one with a line on why. Only lessons you've read are in the pool, so
practice revises rather than skipping ahead, and the menus offer it as a
`practise` row under the lessons.

Every answer schedules the question's return: right pushes it further out (a
day, three, a week, three weeks, eight), wrong brings it back tomorrow.
`crib drill` is the two-minute habit that makes the rest stick — it says so in
one line and exits when nothing is due. Sessions need a terminal on both ends;
piped or redirected, they refuse rather than printing answers next to their
questions.

Courses so far: `shell`. Sandboxed exercises — a throwaway repo you fix for real
— are the remaining piece, designed in [`plan/`](plan/).

## Installing

Needs Node 22.11 or newer.

```bash
npm i -g @euanmsm/crib
```

The one runtime dependency is `cliui`, which does the column layout and
wrapping.

## How it's put together

The content is data and the printing is code, and the two don't know about each
other.

```
bin/crib.mjs        launcher, hands over to src/cli.mjs
src/
  types.mjs          what a guide, topic, section and item are
  registry.mjs       which tools exist and how to load one
  resolve.mjs        working out which topic someone meant
  cli.mjs            arguments in, screens out
  pager.mjs          handing long output to $PAGER
  render/
    theme.mjs        colour, and whether to use it
    layout.mjs       how wide to draw, and where descriptions start
    items.mjs        one line per item
    guide.mjs        a topic, or a whole guide
    menu.mjs         the topic menu and the no-argument screen
  guides/
    gh/              index.mjs, then one file per topic
    git/
    …
  interact/          the menus: raw keys, the selector, the flows
  learn/             the learning half: lessons, practice, drills
    courses/
      shell/         index.mjs, a .md per lesson, a .ex.mjs of questions
test/
```

A guide is a `Guide`: a title, a one-line summary, an intro of global flags, and
a list of `Topic`s. A topic is one or more `Section`s, and a section is a list
of `Item`s — a command, a flag, a subcommand, a note, or a deliberate blank
line. Flags and notes nest under the command they belong to, which is how they
read on screen.

Nothing is generated and there is nothing to rebuild. Edit a topic file and the
next `crib` run has it.

Each directory has its own README going a level deeper: [`src/`](src/README.md)
for how a run flows through the code, [`src/guides/`](src/guides/README.md) for
writing content, [`src/render/`](src/render/README.md) for the layout rules,
[`src/learn/`](src/learn/README.md) for courses and lessons, and
[`test/`](test/README.md) for what is covered and how to regenerate the fixture.

### Adding a topic

Create `src/guides/<tool>/<topic>.mjs`:

```js
export const worktree = {
  name: 'worktree',
  description: 'Working with several checkouts at once',
  sections: [
    {
      title: 'worktree — Multiple working trees',
      items: [
        {
          kind: 'cmd',
          name: 'git worktree add <path> <branch>',
          desc: 'Check a branch out alongside this one',
          children: [
            {
              kind: 'flag',
              name: '-b <new-branch>',
              desc: 'Create the branch too',
            },
          ],
        },
      ],
    },
  ],
};
```

Then import it in that tool's `index.mjs` and add it to `topics`. The order
there is the order of the menu. `npm test` will tell you if the name clashes,
isn't typeable, or has no description.

### Adding a tool

Make `src/guides/<tool>/index.mjs` exporting a `Guide`, add topic files beside
it, and add one line to `src/registry.mjs`. Set `menu: false` on the guide if
it's short enough to print in full — `lsof` does.

## Working on it

From the devkit root:

```bash
npm test          # every package's tests, crib's included
node packages/crib/bin/crib.mjs gh --pr
```

Plain JavaScript with no build step, so nothing checks a guide's shape except
the tests. `src/types.mjs` describes the shapes in JSDoc for editors and
readers; `test/guides.test.mjs` is what actually catches a guide that drifts.

## History

This started as a single 3,000-line bash script called `cheat`, then became
TypeScript in its own repository, then moved here as plain JavaScript. It was
renamed `crib` on the way in, because npm refuses "cheat" in a package name.
Both moves were checked the same way: render every screen before and after and
diff them. Both matched byte for byte.
