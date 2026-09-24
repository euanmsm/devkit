# learn

The learning half: courses you read in the terminal, questions on what you've
read, and a queue that brings them back before you forget. The reference half
answers "what was that flag again?"; this half is how a thing gets into your
head in the first place. The design lives in [`plan/`](../../plan/README.md) —
lessons, practice and drills are built; sandboxed exercises are the remaining
phase.

## The one rule, again

Courses are data, exactly as guides are. Everything under `courses/` exports
plain objects — no functions, no exceptions — and lesson prose lives in markdown
files beside them. The code in this directory renders and remembers; it knows
nothing about zsh or git. That split is what keeps content growth from becoming
code growth (`plan/architecture.md`, "The scaling contract").

## What happens on a run

Take `cheat learn shell --line-editor`:

1. `cli.mjs` sees the reserved first word `learn` and hands the rest to
   `learnScreen()` in `index.mjs` — imported lazily, so reference runs never
   load any of this.
2. `registry.mjs` resolves `shell` (prefixes work, via the same `resolve.mjs`
   the guides use) and loads the course — and only it.
3. `loader.mjs` reads `courses/shell/line-editor.md` and `markdown.mjs` parses
   it, throwing with `file:line` on anything outside the subset.
4. `render.mjs` turns the blocks into lines, reusing the guide renderer's
   banner, section headings and menu rows.
5. `progress.mjs` records the lesson as read.
6. `learnScreen()` returns the lines to `cli.mjs`, which presents them once —
   paging, colour and exit codes all behave exactly as they do for a guide.

## The files

| File            | Job                                                      |
| --------------- | -------------------------------------------------------- |
| `types.mjs`     | What a course and a lesson are. Start here.              |
| `registry.mjs`  | Which courses exist, and how to load one.                |
| `markdown.mjs`  | The lesson markdown subset, parsed and enforced.         |
| `loader.mjs`    | A lesson's `.md` off disk and through the parser.        |
| `render.mjs`    | Courses and lessons to lines. Nothing prints.            |
| `progress.mjs`  | The state file: lessons read, cards and their due dates. |
| `index.mjs`     | Arguments in, one screen out.                            |
| `exercise.mjs`  | The three question formats, and how answers are judged.  |
| `scheduler.mjs` | Leitner boxes: when a card comes back.                   |
| `pool.mjs`      | Which questions a practice or drill run gets.            |
| `session.mjs`   | The question loop: ask, judge, say why, record.          |
| `ask.mjs`       | Readline, and the test double that replaces it.          |
| `practice.mjs`  | A run, from either way in — shared with the menus.       |
| `run.mjs`       | `--practice` and `cheat drill` from the command line.    |
| `courses/`      | The content. One directory per course.                   |

## Practice and drills

Reading teaches; being asked is what makes it stick. Exercises live beside the
prose that taught them — `line-editor.ex.mjs` next to `line-editor.md` — and a
lesson names its own in `index.mjs`. Three formats, all from
[`plan/exercises.md`](../../plan/exercises.md):

- **recall** — reveal and grade yourself. No matching at all, which is why it
  suits anything with more than one right phrasing.
- **choice** — for two things genuinely confused with each other.
- **typed** — only where the answer is one short string. `normalise()` treats
  `Ctrl-A`, `ctrl a`, `^a` and `C-a` as the same answer; if an exercise needs a
  third accept pattern, it wanted to be a recall card.

Only lessons you have **read** contribute questions, so practice revises rather
than skipping the writing. One attempt each: a miss shows the answer and its
note straight away, and the comeback is the queue, never a retry ten seconds
later.

Every answer schedules the card — right moves it up a box (1 day, 3, a week, 3
weeks, 8), wrong drops it to box one. `cheat drill` asks whatever is due, oldest
first. `scheduler.mjs` is a pure function of `(cards, today)`, so it is
table-tested and instant.

Sessions are transcripts, not screens: `ask.mjs` uses cooked-mode readline and
everything stays in scrollback. When one is launched from a menu the keyboard
has to change hands — `select()` closes its raw-mode reader before presenting,
readline takes over, and closing it hands stdin back. Ctrl-C leaves cheat
entirely, the same as it does in a menu.

## The markdown subset

Lessons are prose, so they are written in markdown — but a small subset,
rendered here rather than by a library, so lessons look like the rest of cheat:
`##` headings, paragraphs, `**bold**` and `` `code` `` spans, `-` bullets,
fenced code blocks, and `---` rules. Nothing else — no links, tables, images,
nesting or other heading levels. `npm test` renders every lesson and fails on
the first construct outside the subset, naming the file and line.

If the subset feels tight, simplify the lesson. The parser doesn't grow.

## Progress

`~/.local/state/cheat/progress.json` (honouring `XDG_STATE_HOME`; `CHEAT_STATE`
overrides the whole path). Printing a lesson marks it read — "read" means
exactly "was printed at least once", which is all that can be known. The file is
a convenience, not a database: corrupt or missing means starting fresh,
unwritable means the ✓ is lost and nothing else. Deleting it resets all progress
and breaks nothing.

## Adding a lesson

Write `courses/<course>/<name>.md`, then add one entry to that course's
`index.mjs`:

```js
{
  name: "globbing",
  description: "Expansion, braces, ** and why rg foo *.ts surprises",
  body: "globbing.md",
}
```

The order of `lessons` is the order of the menu and of the `Next:` pointers — a
course is a path, not a pile. An optional `reference: ["git --branching"]`
prints a pointer to the guide that takes over once the course is forgotten; the
tests check it names a real guide topic.

Questions go in `<name>.ex.mjs` beside the prose, exported as an array and named
on the lesson as `exercises`. Write them to the bar in
[`plan/exercises.md`](../../plan/exercises.md): a situation rather than a
definition ("your cursor is at the end and the typo is at the start" beats "what
does Ctrl-A do?"), wrong options that are real confusions, and a note that earns
its line. Ids must be unique within their lesson — they key the card, so
renaming one starts its history over.

## Adding a course

Create `courses/<name>/index.mjs` exporting a `Course`, put its lesson files
beside it, and add one line to `registry.mjs`. Keep that list alphabetical; a
test enforces it, along with everything else `test/learn.test.mjs` checks —
names typeable and unique, every body parsing and rendering, nothing drawn past
the width.
