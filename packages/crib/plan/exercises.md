# Exercises

The practice formats, how answers are judged, how sandboxes work, and the
scheduling that makes any of it stick. This is the file to get right: lessons
are just good writing, but exercises are a design problem.

## The four formats

Chosen so that strict answer-matching — the thing that ruins practice tools — is
needed almost nowhere.

### recall — self-graded flashcards

The workhorse, and the format drills are made of. Show a prompt ("rerun the
previous command with one word substituted"), the user thinks or types for
themselves, presses enter to reveal the answer, then says whether they had it.
No matching at all; honesty is the user's problem, and their own progress is the
only thing at stake. This is the Anki model and it has decades of evidence
behind it.

```ts
{ kind: "recall", id: "hist-substitute",
  prompt: "Rerun the previous command, substituting one word",
  answer: "^old^new",
  note: "Only replaces the first occurrence." }
```

### choice — multiple choice

For discriminations — the places where two things are confusable and the
confusion is the point: Ctrl-U vs Ctrl-W, `git reset --soft` vs `--mixed` vs
`--hard`, `2>&1` before vs after the redirect. Wrong options should be real
confusions, not filler. Judged trivially by letter.

```ts
{ kind: "choice", id: "delete-word",
  prompt: "Which deletes the whole word behind the cursor?",
  options: ["Ctrl-U", "Ctrl-W", "Ctrl-K", "Ctrl-Y"],
  correct: 1,
  note: "Ctrl-U takes everything to the start of line, not one word." }
```

### typed — type the answer, matched generously

Only where the answer space is genuinely small: a keystroke name, a single flag,
one short command with essentially one form. Matching is normalised (case,
surrounding whitespace, `ctrl-a`/`^a`/`C-a` style equivalences) against an
accept list. The design rule that keeps this format honest: **if you find
yourself writing a third accept pattern, the exercise should be a recall card.**
Never used for whole multi-flag command lines — that's what sandboxes are for,
where the outcome is checkable and the keystrokes are free.

```ts
{ kind: "typed", id: "start-of-line",
  prompt: "Cursor to the start of the line — which keystroke?",
  accept: ["ctrl-a"],
  answer: "Ctrl-A",
  note: "Ctrl-E returns to the end." }
```

### sandbox — do it for real

A generated directory, a task, a real shell, and a check on the outcome. The
format that teaches most and costs most to author. Judged only on end state —
refs, files, processes — never on what was typed, so `git switch`,
`git checkout`, or three wrong turns and a recovery all pass alike.

```ts
{ kind: "sandbox", id: "reflog-rescue",
  task: "A hard reset threw away two commits. Get the branch back to where it was.",
  setup: [
    { file: "notes.txt", content: "one\n" },
    { run: ["git", "init", "-b", "main"] },
    { commit: "first" },
    { file: "notes.txt", content: "one\ntwo\n" }, { commit: "second" },
    { file: "notes.txt", content: "one\ntwo\nthree\n" }, { commit: "third" },
    { run: ["git", "reset", "--hard", "HEAD~2"] },
  ],
  check: [
    { ref: "main", equals: { commitWithMessage: "third" } },
    { file: "notes.txt", contains: "three" },
  ],
  solution: ["git reflog", "git reset --hard HEAD@{2}"] }
```

Setup and check are declarative lists interpreted by `sandbox.mjs` and
`check.ts`, keeping course files data-shaped. The vocabularies start tiny —
setup: write a file, run a command, make a commit; check: file exists/contains,
ref points where, command output matches — and they are the one place content
could pull code along with it, so growth is deliberately braked. There is no
escape hatch: a course file may not contain a function, full stop. An exercise
that can't be said in the vocabulary gets redesigned first; only when several
good exercises all want the same missing verb does the vocabulary gain one, and
that's a reviewed decision, not a side effect of shipping an exercise. Since
setup already includes "run a command", the ceiling is genuinely about _checks_
— and most checks reduce to "run this command, compare its output", which the
vocabulary has from day one.

Safety, by construction: setup and check receive a path under the system temp
dir that cheat just created, and nothing else — no cwd, no home. Setup `run`
steps execute with the sandbox as cwd and a scrubbed environment (so a git
exercise isn't warped by the user's global config: `HOME` pointed into the
sandbox, identity and `init.defaultBranch` provided explicitly). The user's
shell inside the sandbox is their real shell with their real config, because
that's the environment they're learning to be fast in.

## Judging and feedback

The same rules across formats:

- One attempt per question per session. A miss shows the answer and the note
  immediately — the comeback happens via scheduling, not via retries, because a
  retry ten seconds later teaches nothing.
- The note is compulsory. Every exercise carries one line of _why_ or _what it's
  confused with_; a bare "wrong, it was b" wastes the moment of maximum
  attention.
- Sandboxes print the model solution on success too. Seeing a route cleaner than
  the one you took is half the value of doing it for real.

## Scheduling — Leitner boxes

Every exercise, once attempted, becomes a card the scheduler owns. Five boxes
with doubling intervals:

| Box      | 1     | 2      | 3      | 4       | 5       |
| -------- | ----- | ------ | ------ | ------- | ------- |
| Interval | 1 day | 3 days | 1 week | 3 weeks | 8 weeks |

Right → up one box, due after that box's interval. Wrong → back to box 1, due
tomorrow. Box 5 cards that stay right just repeat at 8 weeks — long enough to be
cheap, short enough to catch decay. That's the whole algorithm; SM-2 and friends
tune ease factors per card, and that sophistication isn't worth its complexity
here. The scheduler is a pure function of (cards, today), so it's table-testable
and `cheat drill` stays instant.

Sandbox cards schedule like any other but cap their box lower (they cost
minutes, not seconds) and `cheat drill` puts them last in a session, flagged, so
a two-minute drill isn't ambushed by a ten-minute repo puzzle. A `--quick` flag
skips them outright.

## Cards from guides — the leverage play

Phase 3's multiplier: a guide item is already `name` + `desc`, which is a recall
card read backwards — show the desc, recall the name. The guides hold thousands
of these for free.

Auto-generating from everything would produce a junk deck (nobody needs to drill
`--help`), so it's opt-in per item: a `drill?: true` field on `Item`, added by
hand to the ones worth knowing cold. Curating a topic's drill-worthy items takes
minutes and doubles as an editorial pass on the guide. These cards carry keys
like `guide:gh/pr/checkout`, live in the same scheduler, and mean `cheat drill`
covers tools that have no course at all — the reference half feeding the
learning half directly.

## Authoring bar

What makes an exercise worth shipping, as review criteria:

- It tests one thing, and the id names it.
- The prompt is a situation, not a definition. "Your cursor is at the end and
  the typo is at the start" beats "What does Ctrl-A do?" — retrieval in the form
  you'll actually need it.
- Wrong choice-options are real confusions someone would hold.
- The note earns its line.
- Sandbox checks accept every correct route (review question: "what's the
  weirdest solution that should pass — does it?").
- It's derived from the lesson: no exercise on material the lesson didn't teach.

## Deliberately not doing

- **Free-form command grading outside sandboxes** — matching is either
  generous-and-wrong or strict-and-infuriating; recall cards and sandboxes cover
  both ends better. (An optional LLM grader — piping answer and intent through
  `claude -p` — is a plausible future experiment, but off by default and never
  load-bearing.)
- **Timed anything.** Speed comes from repetition, not stopwatches.
- **Streaks, XP, levels.** The due-count is the only motivator; this is a tool,
  not a game.
- **A curses UI.** Readline in, lines out, scrollback intact.
