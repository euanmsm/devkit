# Learning in crib

The plan for a second half of this tool. Today `crib` answers "what was that
flag again?" — reference, for things you already know. The learning feature
answers "how do I get this into my head in the first place?" — courses you read
in the terminal, then practise in it, with the tool remembering what you've
learned and resurfacing what you're about to forget.

The pitch in one line: **vimtutor for your whole terminal.**

## Why this belongs here

The reference half and the learning half feed each other. A course teaches a
topic once; the guide is what you check afterwards, forever. Every course links
to guides, and drilling can be generated straight out of guide content — the
11,000 lines of items already written are a deck of flashcards that nobody has
shuffled yet. No other tool has both halves: `tldr` is reference only, Anki is
drills only, `githug` and `vimtutor` are exercises for one tool each.

The content already exists to start: `CONTENT.md` at the repo root is the first
curriculum, written for this machine specifically. The feature is a way to work
through it rather than read it once and forget it.

## The four pieces

1. **Lessons** — prose you read, organised into courses, rendered like the rest
   of crib and paged like `man`. `crib learn shell --line-editor`.
2. **Practice** — short interactive sessions after a lesson: recall cards,
   multiple choice, type-the-command.
   `crib learn shell --line-editor --practice`.
3. **Drills** — spaced repetition across everything you've practised, so the
   commands you don't use daily stay in your head. `crib drill`, a two-minute
   habit.
4. **Sandboxes** — real exercises in a throwaway directory: crib builds a repo
   with a lost commit, drops you into a shell there, you rescue it with
   `reflog`, exit, and it checks your work. The reason to build any of this.

Each is a phase, shippable on its own, in that order. Lessons are nearly free —
they reuse the renderer, the pager and the menu machinery. Sandboxes are the
most work and land last, on top of everything the earlier phases proved.

## Principles, carried over and extended

**Content is data, printing is code** — unchanged, and load-bearing at scale:
courses and exercises export plain objects (lesson prose lives in markdown files
beside them), the code that runs a practice session knows nothing about git or
zsh, and course files may not contain functions at all. The intended consequence
is that content grows without the code growing — adding a course touches one
directory and one registry line, and everything else is data. The full contract,
with the per-unit costs and the two named pressure points, is in
`architecture.md`.

**No new dependencies.** Interaction is `node:readline`, sandboxes are
`node:child_process` and a temp directory. Progress is a JSON file. Still one
runtime dependency (`cliui`), still no build step.

A TUI framework (Ink) was weighed for the interactive phases and rejected, for
reasons worth keeping: JSX is not erasable syntax, so Node cannot strip it and
Ink would force the build step `erasableSyntaxOnly` exists to prevent; it brings
~25 dependencies plus React against a repo with one; and it repaints a screen it
owns, which breaks piping, redirection and the `$PAGER` handoff that lessons
rely on. The interaction model here is a transcript, not an application —
questions scroll past and stay in scrollback — and `node:readline/promises`
covers that in full. A full-screen browser remains possible later as a separate
front-end over the same data.

**Interactivity stays in one room.** The build-the-whole-screen-then-present
model is right for reference and stays untouched. Interactive sessions are a
separate, clearly-bounded path — one module owns the question loop, and
everything it prints still goes through the same theme and layout code.

**Checking must be generous.** A practice tool that rejects `git switch -c x`
because it wanted `git checkout -b x` teaches you to hate the tool. Where
answers are open-ended, we show the model answer and let you grade yourself —
the Anki model, which works. Strict checking is reserved for sandboxes, where we
check the _outcome_, not the keystrokes.

## The files in this directory

| File              | Covers                                                              |
| ----------------- | ------------------------------------------------------------------- |
| `experience.md`   | The command surface, every screen, the flow of a session            |
| `architecture.md` | Types, modules, storage, testing, how it wires into cli.mjs         |
| `exercises.md`    | The practice formats, answer checking, sandboxes, spaced repetition |
| `content.md`      | The course catalogue — what we teach, mapped from CONTENT.md        |

## Risks to hold in view

- **Interactivity creep.** The original line here was "no raw mode, no cursor
  addressing"; the user overrode it for _navigation_, and `src/interact/` now
  owns arrow-key menus — hand-rolled, four escape sequences, still no Ink and no
  build step. The line that remains: menus are for picking, sessions are
  transcripts. Practice (phase 2) still prints and asks at a prompt, and any
  flow needing more than a list with a cursor gets redesigned, not a framework.
- **Answer-checking strictness.** Covered above; it will kill the feature if we
  get it wrong, so the formats are designed so exact matching is rarely needed.
- **Sandbox safety.** Exercises only ever touch a directory crib created under
  the system temp dir. Nothing reads or writes the user's own files, no
  exceptions, enforced by construction (the checker gets the sandbox path and
  nothing else).
- **Content rot.** A course says "you have no git aliases" and then you add
  some. Keep machine-specific observations in CONTENT.md and out of course
  prose; courses teach the tool, not the state of this laptop.

## Status

Phases 1–3 are built. `crib learn` reads lessons and remembers what you've read;
`--practice` and the `practise` menu row ask questions on the lessons you've
read; `crib drill` resurfaces what's due on Leitner boxes. The `shell` course
has two lessons with thirteen exercises between them.

Phase 4 (sandboxes) remains design, and so does the guide-derived drill deck —
`drill: true` on `Item`, which needs an editorial pass over the guides rather
than new machinery. `content.md`'s catalogue supersedes `CONTENT.md` Parts 9
and 10.
