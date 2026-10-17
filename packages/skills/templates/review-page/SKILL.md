---
name: review-page
description:
  "Build a review page for the current branch's diff over its parent branch: a
  single HTML page with an overview, the files in reading order, each file's
  real diff beside notes on what changed and why, and a UI / UX walkthrough when
  the branch changes what users see. Use when asked for a review page, a review
  doc, or help reviewing a large branch or PR."
user-invocable: true
---

{{marker}}

# Review Page

Writes `{{outputDir}}/<branch>/review-page/review.html`, where `<branch>` is the
branch name after its last `/` (or the commit, when HEAD is detached): one page a reviewer
reads top to bottom instead of the raw diff. It opens with what the branch does,
then walks the changed files in the order that makes the change easiest to
follow, each file's real diff beside notes on what changed and why. When the
branch changes what users see, it ends with walkthroughs for checking that by
hand.

```
/review-page            # diff over the branch's parent
/review-page <branch>   # diff over another base
```

**The work is split.** A script owns every fact git can give: the diffs, paths,
statuses, line counts, commits and the folder tree. You own the judgement: the
reading order, the grouping, and what each change means. Never copy code, line
numbers or counts into the notes; name files by path and hunks by position, and
the script attaches the real diff.

It never edits code, stages or commits. The only files it writes are inside the
page folder.

## 1. Prepare

Run from the repository root:

```bash
npx --no-install skills review-page prepare --base "<the branch given, or empty>" --output-dir {{outputDir}}
```

It finds the branch's parent — the branch given, else its open PR's base, the
branch below it in a `gh stack`, or the parent git recorded, and the default
branch only when none of those answers — and writes `brief.json` into the page
folder it prints, along with the base, how it was found and the fork commit.
The brief lists every changed file with its status, its +/− counts and its
hunks. A hunk is one `@@` block of the diff, and **every hunk of a file you put
in a section gets exactly one note**. Tests and Skim files need none, so the
brief's hunk total is more than the notes you write.

- Name the base and its source in your reply, and pass on any `warning:` line.
- Stop if it exits non-zero, and show what it printed.
- `uncommitted:` means changes outside the page; mention them in your reply.
- When the brief has a PR, its body is the author's account of the change.

**When prepare prints `since the last brief:`**, notes already exist from an
earlier run. Rewrite only the notes for the `changed` and `added` files, drop
the `dropped` ones, and update the overview only if the branch's story changed.
Then go to step 6.

## 2. Understand the change

Read the whole diff (`git diff -M <fork> HEAD`, with the fork prepare printed),
then open whatever you need around it — the rest of a changed file, the code it
calls, the code that calls it — until you can answer:

- What does this branch set out to do, in one sentence?
- What changes for the people using the product, if anything?
- Which file or two is the change really about? Everything else either feeds
  into those files or reacts to them.
- Which files only changed mechanically — a rename, an import path, formatting,
  a regenerated file, a lockfile — and need no real reading?
- Is there a doc, plan or convention file, changed or not, that explains the
  design faster than the code would?

Do not write anything until you can answer all five.

## 3. Choose the order

The rule behind every choice: **read a thing before anything that depends on it,
and read the why before the how.** In practice that usually means sections like:

1. **Intent** — docs, plans or convention files that explain the design.
2. **Shape** — the data the change is built on: migrations, schemas, shared
   types, config.
3. **Core** — the file or files the change is really about, in the order their
   logic runs.
4. **Outward** — the code that uses the core: services, routes, hooks, then UI.
   Follow the direction a call travels.
5. **Skim** — mechanical changes, grouped by what kind of change they are, such
   as "Import paths after the `EmailView` move".

Name sections after what they hold ("The add-fact form", "Callers") rather than
the generic names. Every file in the diff appears exactly once: as a section
file, as a test, or in a Skim group.

- Put each test file in the `tests` of the file it tests, rather than as its own
  entry.
- A test that only changed mechanically, alongside a source file in Skim, goes
  in the same Skim group.
- Shared test fixtures and helpers, used by many tests, are section files: in
  Shape when they define the data the tests run on, otherwise in their own
  section after the code they support.

## 4. Write the notes

Write JSON files into the page folder's `notes/` folder. They are merged in name
order. The format, with an example of every field, is in
[notes-format.md](notes-format.md); read it before writing. Use one file per
section so they are easy to redo:

```
notes/00-overview.json    { "title": …, "overview": … }
notes/01-<section>.json   { "sections": [ … ] }
notes/80-skim.json        { "skim": [ … ] }
notes/90-ui.json          { "uiReview": … }      step 5, only when needed
```

The reader knows the product and works in this codebase, but has not read this
branch. Write plain sentences for them:

- **`overview.summary`** — what the branch does and why, in two to four
  sentences.
- **A file's `summary`** — one sentence: what this file now does differently.
- **`context`** — the part of the system this file belongs to, for a reader who
  has not opened it: what it is for, what calls it, what it calls. This is what
  turns a diff into something a reviewer can judge.
- **`changed`** — the file's change as a whole, in a few sentences. Name
  behaviour, not mechanics: "an unconfirmed email can now be opened with `v`",
  not "added a branch to the switch".
- **Hunk notes** — one per hunk, in order, each with a short title (two to five
  words) and a sentence or two on what that hunk does. `git diff -M <fork> HEAD
  -- <path>` shows one file's hunks in the order the notes follow. A hunk that
  only touches imports or doc comments gets `null` or a one-line note; never
  pad it. An added or deleted file is
  one hunk holding the whole file: split its single note into `parts`, each
  citing the line range it covers (new-side lines for an added file, old-side
  lines for a deleted one).
- **Skim groups** — a label naming the kind of change, and a note saying why it
  needs no reading.

Keep each note to what the reader cannot see at a glance in the diff beside it.
Do not restate the code, and do not give review findings: if you spot a bug,
say so in your reply, not in the page.

### Big branches

When the brief lists more than about 40 files or 3,000 changed lines, write
`00-overview.json` and decide the sections yourself, then hand each section to a
subagent with the brief, the files it covers, its section title and its file
name (`notes/03-<section>.json`), and `notes-format.md`. Each writes only its own
file. Read what comes back before building; the page is only as clear as its
least clear section.

## 5. Check the UI / UX

Decide whether the branch changes what a user sees or does: a screen, a
component, copy, a key binding, a flow, an error message. Internal refactors,
tests, tooling and backend-only changes do not count — including a refactor of
screen code that is meant to look identical. If such a refactor has a small
visible side effect, say so in `overview.userChanges` instead of writing
walkthroughs.

**If it does not, skip to step 6** and say so in your reply.

If it does, write `notes/90-ui.json` so the reviewer can check the change by
hand:

- **`setup`** — the commands to get the app running with useful data, found in
  the README and package scripts. Each step says why, with the command
  separately so it can be copied.
- **`scenarios`** — one walkthrough per user-visible change: where it is, why it
  changed, the files involved, and `steps` of what to `do` and what to `expect`,
  with a `cmd` when a step runs a command. Write steps someone can follow
  without reading the code. For a terminal UI, a `screen` sketch of what should
  appear helps, but only sketch what the code that draws the screen shows;
  leave it out rather than guess.
- **`notPreviewable`** — changes the local setup cannot show (a state the seed
  data never reaches, a third-party callback), and why.

## 6. Build

```bash
npx --no-install skills review-page build --output-dir {{outputDir}} --editor {{editor}}
```

It checks the notes against the diff and only writes the page when they cover
the whole branch. Each problem is printed on its own line, naming the file:

```
src/app/review/_hooks/use-review.ts: 3 hunk notes for 4 hunks
src/app/review/_lib/draft-edit.ts: missing; add it to a section, a file's tests, or skim
```

Fix every problem it names and build again, until it prints `wrote …`. Fix the
notes by doing what they should have done — write the missing hunk note, place
the missing file — never by deleting a note or dropping a file to make the count
come out. If it says the diff changed since prepare, run step 1 again first.

## 7. Open it and reply

Open the page (`open <path>` on macOS, `xdg-open <path>` on Linux; if that
fails, just give the path).

Reply with:

- the page's path;
- the base and how it was found;
- one sentence on what the branch does;
- whether a UI / UX review was written, and in a few words why or why not;
- any uncommitted changes left out, warnings, or bugs you noticed while reading.

Do not paste the notes into the reply; the page is the deliverable.
