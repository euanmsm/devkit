# Architecture

How the learning feature fits the codebase without bending its rules. Read
`experience.md` first — this is the machinery behind those screens.

## Where it lives

```
src/
  learn/
    types.mjs        Course, Lesson, Exercise, Card — the new data shapes
    registry.mjs     which courses exist; lazy-loaded like guides
    markdown.mjs     the constrained markdown subset → blocks
    loader.mjs       a lesson's .md off disk and through the parser
    render.mjs       course list, lesson menu, lesson body, session frames
    session.mjs      the interactive loop: ask, judge, report
    progress.mjs     the state file: reads, card boxes, due dates
    scheduler.mjs    which cards are due; the Leitner boxes
    sandbox.mjs      build a temp dir, spawn a shell in it, tear down
    check.ts        the assertion vocabulary sandbox checks are written in
    courses/
      shell/
        index.mjs          the Course object: order, names, descriptions
        line-editor.md    lesson prose
        line-editor.ex.mjs exercises for that lesson
        ...
      pipeline/
      git/
```

`cli.mjs` grows one branch: if the first argument is `learn` or `drill`, hand
the rest to `src/learn/`. Everything else about `run()` is untouched. `learn`
and `drill` join `all` as reserved names, with a test that no registry entry
ever claims them.

## The scaling contract

The property that has to survive growth: **code complexity tracks the number of
formats, never the amount of content.** There are four exercise formats and a
fixed sandbox vocabulary; the session loop, renderer, scheduler and checker are
written once against those, and a repo with ninety courses runs on byte-for-byte
the same code as a repo with one. Concretely, what each unit of content costs a
contributor:

| To add       | You touch                                             |
| ------------ | ----------------------------------------------------- |
| an exercise  | one object in an existing `.ex.ts` file               |
| a lesson     | one `.md` file, one entry in the course's `index.mjs` |
| a course     | one directory, one line in `learn/registry.mjs`       |
| a drill card | `drill: true` on an existing guide item               |

Nothing on that list is code, and the list is enforced rather than hoped for:
course files export plain objects only — no functions, no escape hatches (see
`exercises.md` for how sandboxes stay declarative) — and the content tests fail
anything half-wired, so a contributor who only ever writes markdown and data
objects can never break the machinery. The corollary is a review rule: any pull
request that adds content _and_ edits `src/learn/*.ts` outside `courses/` needs
a justification, because the design says that combination should be rare enough
to be suspicious.

Two pressure points get named brakes. The markdown subset doesn't grow to
accommodate an awkward lesson — the lesson simplifies. The sandbox vocabulary
doesn't grow for one exercise — only for a verb several exercises already want,
as a deliberate decision. Both are cases where saying yes once would make every
future contribution a little more complicated to review.

## The data shapes

Sketches, not final code — enough to see the design.

```ts
interface Course {
  name: string; // what you type: "shell"
  title: string; // banner: "shell — Your shell"
  summary: string; // one line for the course list
  lessons: Lesson[]; // in teaching order
}

interface Lesson {
  name: string; // "line-editor"
  description: string; // one line for the course menu
  body: string; // path to the .md file, relative to the course
  reference?: string[]; // guide pointers: ["zsh --keys"]
  exercises: Exercise[];
}
```

`Exercise` and `Card` are defined in `exercises.md` alongside the formats they
model. The invariant carried over from guides, without exception: a course file
exports plain objects and nothing else — sandbox setup and checks included,
which is why their vocabulary is declarative (see `exercises.md`).

## Lesson prose: markdown, but a subset

Guides are TS data because items are tabular. Lessons are paragraphs, and
authoring paragraphs in template strings is miserable, so lesson bodies are
`.md` files beside the course index. But we render them ourselves — no external
markdown library, and output must match crib's theme — so the subset is
deliberately small:

- `##` headings (rendered like section titles)
- paragraphs, `**bold**`, `` `code` `` spans
- fenced code blocks (rendered in the item colours, never wrapped)
- `-` bullet lists
- `---` rules

Nothing else: no links, tables, images, nesting. `markdown.mjs` parses exactly
this and a test renders every lesson in every course, failing on any construct
outside the subset — so an author finds out at `npm test`, not when a reader
hits a mangled screen. If the subset ever feels tight, that's a prompt to
simplify the lesson, not extend the parser.

## Interactivity: the Io extension

Today `Io` is write-only, and everything below `cli.mjs` is testable because
real streams never leak in. Sessions extend the same idea rather than bypassing
it:

```ts
interface SessionIo extends Io {
  ask: (prompt: string) => Promise<string>; // readline underneath
  runShell: (cwd: string) => Promise<number>; // inherit stdio, resolve on exit
}
```

The real `ask` is `node:readline/promises`; the test one shifts answers off an
array. The real `runShell` spawns `$SHELL` with stdio inherited; the test one
mutates the sandbox directly to simulate what a user would have done, then
returns. `session.mjs` is the only module that touches `SessionIo`, which keeps
the interactivity in one room.

Two consequences the reference side never had:

- **Sessions print incrementally.** The build-everything-then-present model
  can't hold a conversation. Session output goes out line by line through
  `io.err`-style immediate writes; the pager is never involved. Every
  non-interactive screen (course list, menus, lessons) keeps the present model
  and the pager.
- **Sessions require a TTY.** Checked once at the top; a clean one-line refusal
  otherwise.

## The progress file

One JSON file, small enough to read whole and rewrite whole on every change:

```
~/.local/state/crib/progress.json     (XDG_STATE_HOME respected,
                                        CRIB_STATE overrides for tests)
```

```json
{
  "version": 1,
  "read": { "shell/line-editor": "2026-08-14" },
  "cards": {
    "shell/line-editor/ctrl-a": {
      "box": 3,
      "due": "2026-08-21",
      "seen": 5,
      "right": 4
    }
  }
}
```

Card keys are `course/lesson/exercise-id`, so renaming an exercise id orphans
its history — acceptable, documented, and orphans are pruned on write. A corrupt
or missing file means starting fresh with a warning, never a crash: the progress
file is a convenience, not a database. `scheduler.mjs` is given today's date by
its caller so tests control time.

## Rendering

`render.mjs` reuses what exists rather than duplicating it: `theme.mjs` for
paint, `layout.mjs` for widths, and the guide item renderer wherever a lesson or
session shows a command with a description. New rendering is limited to the
markdown subset, the progress markers on menus, and the session frames (question
numbers, verdict lines). Same 100-column cap, same colour rules, same
`NO_COLOR`/`FORCE_COLOR` behaviour — a lesson piped to a file is plain text,
like any topic today.

## Testing

The existing pattern stretches to cover all of it:

- **Content tests** (like `guides.test.mjs`): every course loads, lesson names
  are typeable and unique, every lesson body parses within the subset and
  renders, every `reference` pointer resolves to a real guide topic, exercise
  ids are unique, every exercise's model answer passes its own checker.
- **Session tests**: scripted `ask` answers drive a whole session; assert the
  transcript and the progress file afterwards.
- **Scheduler tests**: pure functions plus an injected date; box promotion and
  demotion table-tested.
- **Sandbox tests**: build the sandbox, apply the model solution, assert the
  check passes; apply nothing, assert it fails with the right message. These run
  in the system temp dir and are the slowest tests in the repo — kept fast by
  keeping fixtures tiny.

## Build order

Matching the phases in `README.md`:

1. **Lessons**: `types.mjs`, `registry.mjs`, `markdown.mjs`, `render.mjs`, the
   `cli.mjs` branch, one full course (`shell`). No session, no state — except
   marking lessons read, which brings `progress.mjs` in early in its simplest
   form.
2. **Practice**: `session.mjs`, the recall/choice/typed formats, progress
   recording. First exercises for the shipped course.
3. **Drills**: `scheduler.mjs`, `crib drill`, due counts on the learn screens.
4. **Sandboxes**: `sandbox.mjs`, `check.ts`, the first git sandbox exercises.

Each phase ends with the tests above extended to cover it, and nothing in a
later phase is load-bearing for an earlier one.
