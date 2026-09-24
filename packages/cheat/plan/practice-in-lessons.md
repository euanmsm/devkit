# Practice belongs to lessons

Practice currently hangs off the course. A `practise` row sits under the lesson
list, pooling questions from every lesson you have read, and the lesson you just
finished offers you nothing. That is backwards: a lesson teaches seven specific
things, and the questions on those seven things belong to _it_, at the moment
you finish reading it.

This is the change that moves them there.

## What's wrong today, precisely

- The lesson menu's `practise` row is course-wide. Read three lessons and it
  mixes all three, so you cannot revise the one you just read.
- Finishing a lesson leads nowhere. The footer points at the next lesson and at
  a guide, and says nothing about the questions on what you just read.
- `cheat learn shell --line-editor --practice` **silently practises the whole
  course** — `cli.mjs` takes `rest[0]` as the course and drops every lesson
  argument on the floor. A bug, not just a gap.
- Nothing tells you a lesson has questions until you go looking.

## The shape of the fix

Practice becomes a property of a lesson in all four places a lesson appears: its
row in the menu, the moment you finish reading it, its footer, and its command
line.

### 1. A lesson row carries its own questions

```
  shell — Your shell, properly

  ✓ line-editor  The keys that edit the line you're typing     7 questions
  ✓ history      Ctrl-R, history settings, !$ and friends      6 questions
    aliases      What earns an alias, and writing functions

  ↑↓ move · ⏎ read · p practise · esc back · q quit
```

Enter reads, `p` practises that lesson. The count appears only once the lesson
is read, because unread lessons are not in the pool — practice revises, it does
not run ahead of the prose. The course-wide `practise` row goes away;
`cheat drill` is what mixes lessons, and it does so on a schedule rather than
all at once. Practising a whole course in one sitting stays available from the
command line, which is the deliberate trade: the menus get the lesson-shaped
thing, the command line keeps the bulk one.

### 2. Finishing a lesson offers its practice

The natural moment, and the one currently wasted. After the lesson is presented
and marked read:

```
  7 questions on this lesson — enter to practise, any key to go back
```

One keypress through the menu's existing raw-mode reader, so nothing new has to
hold the keyboard for a yes/no; readline takes over only if the answer is yes,
exactly as it does now. Shown only when the lesson has exercises.

### 3. The footer says so, in both modes

`renderLesson` gains a pointer beside `Reference:` and `Next:`, so the printed
path carries the same signpost the menus do:

```
  Practice:   cheat learn shell --line-editor --practice   7 questions
```

### 4. The command line means what it says

- `cheat learn shell --line-editor --practice` — that lesson's questions
- `cheat learn shell --line-editor --history --practice` — both lessons'
- `cheat learn shell --practice` — the whole course, as today
- An unrecognised lesson name reports itself rather than quietly widening to the
  course, which is the bug above in its general form.

## Two mechanisms this needs

### Action keys in the selector

`select()` returns chosen, back or quit. It gains a fourth outcome — an action
fired against the row under the cursor:

```ts
select(paint, io, title, items, { p: "practise" })
  → { kind: "action"; action: "practise"; item: T }
```

Three details that are easy to get wrong:

**`p` is a filter character today**, with a test pinning it. The rule that
resolves the clash is one the selector already uses for `q`: an action key fires
only while the filter is empty. Start typing and `p` is a letter again, so
filtering a long lesson list still works.

**Actions are per row, not per menu.** A `SelectItem` says which actions it
accepts, and the hint line shows only the ones the highlighted row offers. So
`p` is absent from the hints on an unread lesson and does nothing there — which
is why no transient "read it first" message is needed. The selector redraws a
frame every keypress and has nowhere to put a message that would survive;
designing the availability in avoids inventing one.

**The outcome must not leak into menus that passed no actions.** Widening
`Outcome` breaks the four existing callers unevenly, which is the dangerous
part. Three of them narrow with
`if (picked.kind !== "chosen") return picked.kind` and would fail to compile,
because `"action"` is not a `Flow` — loud, fine. But `root()` narrows by two
separate equality checks and then reaches for `picked.item`, which exists on an
action too: it would compile and treat an action as a selection. So the actions
parameter is generic and the outcome is parameterised by it:

```ts
select<T, A extends string = never>(…, actions?: Record<A, string>)
  → Outcome<T, A>          // Outcome<T, never> has no action member
```

Menus that pass nothing keep exactly today's type, and the compiler enforces a
branch only where actions actually exist.

### A trailing column in the row renderer

`frame()` draws two columns — name padded to a shared width, then description
filling the rest. "7 questions" needs a third, right-aligned, and there is no
room for it by accident: `descRoom` is currently
`width - MARGIN - 2 - mark - column`, and it has to give the trailing text its
width plus a gap. Rows without trailing text keep the full description, so every
other menu in the tool renders byte-identically.

Truncation order matters: the description is what gets an ellipsis, never the
count.

## Files

| File                      | Change                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| `src/interact/select.mjs` | Action outcome (generic), per-row availability, hints, trailing column                     |
| `src/interact/browse.mjs` | Per-lesson rows and `p`; the after-reading offer; drop the course row                      |
| `src/learn/pool.mjs`      | `lessonQuestions` / `lessonPool` beside the course ones                                    |
| `src/learn/practice.mjs`  | `runPractice` takes optional lessons; per-lesson session title and "nothing to do" wording |
| `src/learn/run.mjs`       | Lesson-scoped `--practice`, and an unknown-lesson error                                    |
| `src/cli.mjs`             | Pass every lesson argument through, not just `rest[0]`                                     |
| `src/learn/render.mjs`    | The `Practice:` footer pointer                                                             |
| `test/select.test.mjs`    | Action keys, per-row availability, `p` still filtering, the trailing column                |
| `test/browse.test.mjs`    | Replaces the course-row test                                                               |
| `test/pool.test.mjs`      | Lesson-scoped pools                                                                        |
| `test/cli.test.mjs`       | The dropped-lesson bug, as a regression test                                               |

## What this does not do

**It does not put questions inside the lesson text.** While you read, `less`
owns the screen and cheat is blocked waiting for it, so "embedded" here means
_at the end of reading_, not _interleaved with the prose_. Going further means
dropping the pager for lessons and scrolling them ourselves — a separate change
with a real cost: losing `less`'s search, half-page jumps and mouse-wheel
scrolling, and writing a pager to get them back.

That trade is worth making only if the after-reading offer still feels detached
once it exists. It is not a toolkit problem: Ink has no scrolling primitive
either, so an Ink rewrite would face the same choice with a build step and two
dozen dependencies attached.

## Build order

Each step ends green.

1. **Action keys and the trailing column** in `select.mjs`, with tests — the
   mechanisms, before anything uses them. No behaviour changes yet.
2. **Lesson-scoped pools** in `pool.mjs`, with tests.
3. **The CLI bug**: every lesson argument reaching `practiceRun`, with a
   regression test that fails before the fix.
4. **The menu**: per-lesson counts, `p`, the after-reading offer, and removing
   the course row.
5. **The footer pointer**, then the docs describing all of it.

## Verification

```bash
npm test && npm run typecheck && npm run format:check
node bin/cheat.js lsof > /tmp/x && diff /tmp/x test/fixtures/lsof.txt
node bin/cheat.js learn shell --line-editor --practice | cat   # refuses, exit 1
```

By hand at a terminal, since the keyboard hand-off is the risk: read a lesson
from the menu, take the offer, answer a question, land back on the menu; press
`p` on a read lesson and on an unread one; type a filter and check `p` types
rather than fires; check `cheat` and `cheat gh` still look exactly as they do
now, since the row renderer changed underneath them.

The one behaviour to watch for that no test will catch: `less` reads its
keystrokes straight from the terminal while our stdin holds the piped content,
so the after-reading offer opens a fresh key reader in a terminal `less` has
just let go of. If a keypress is swallowed or doubled, that is where it comes
from.

## What the review of this plan changed

Written down because each was a real hole, not a wording choice:

- The mock showed a right-aligned count the renderer cannot produce — two
  columns is all `frame()` has. Now planned as an explicit change with its width
  arithmetic.
- "Pressing `p` on an unread lesson tells you to read it first" needed a
  transient-message mechanism the selector has no room for, since it redraws
  every keypress. Replaced with per-row action availability, which is both
  simpler and more discoverable.
- Widening `Outcome` was described as breaking all the existing callers loudly.
  Checking each: three would fail to compile, but `root()` narrows differently
  and would compile while treating an action as a selection. Made the outcome
  generic so the one dangerous case cannot arise.
- The session title and the "nothing to practise" wording are course-shaped
  ("Practising shell") and were unlisted; both need lesson-shaped variants.
- The unknown-lesson error path for `--practice` did not exist in the plan and
  is half the bug being fixed.
