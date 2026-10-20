# review-page

Builds a review page for the current branch: one HTML file a reviewer reads top
to bottom instead of the raw diff. It opens with what the branch does, then
walks the changed files in the order that makes the change easiest to follow,
each file's real diff beside notes on what changed and why. When the branch
changes what users see, it ends with walkthroughs for checking that by hand.

It never edits code, stages or commits.

## Running it

```
/review-page            # diff over the branch's parent
/review-page <branch>   # diff over another base
```

## How the work is split

A script owns every fact git can give: diffs, paths, statuses, line counts,
commits, full file text and the folder tree. The agent owns only judgement and
prose: the reading order, the grouping, and what each change means. The agent
never copies code, line numbers or counts into its notes. It names files by path
and hunks by position, and the script attaches the real diff, so the notes
cannot drift from the code.

## What it does

1. **Prepares.** `skills review-page prepare` finds the base the same way as
   every other branch skill (see
   [How the base branch is found](base-branch.md)), reads the open PR if there
   is one, and writes `brief.json`: every changed file with its status, +/−
   counts and hunks. A hunk is one `@@` block of the diff, and each one needs a
   note, so the brief tells the agent exactly what to cover.
2. **Understands the change.** The agent reads the whole diff and the code
   around it until it can say what the branch does, what changes for users,
   which files the change is really about, and which only changed mechanically.
3. **Orders the files.** The same rules as [reading-order](reading-order.md):
   something is read before anything that depends on it, and the why before the
   how. Files are grouped into named sections, each test is attached to the file
   it tests, and mechanical changes go in Skim groups.
4. **Writes the notes.** JSON files in a `notes/` folder: an overview, then per
   file a one-line summary, the context it lives in, what changed as a whole,
   and one note per hunk. On a big branch the agent splits the sections between
   subagents, each writing its own file.
5. **Checks the UI / UX.** If the branch changes what a user sees or does, the
   agent adds walkthroughs: how to start the app, then what to do and what to
   expect for each change. Otherwise this step is skipped.
6. **Builds.** `skills review-page build` checks the notes against the diff and
   writes the page only when they pass. The agent fixes whatever it names and
   builds again.
7. **Opens the page** and replies with its path, the base, and whether a UI
   review was written.

## The checks

The build refuses to write the page until:

- every changed file appears exactly once, as a section file, a test or in Skim;
- no file is named that is not in the diff;
- each file has one note per hunk;
- every line range a note cites is in the diff;
- every file a UI walkthrough names is in the diff;
- the diff has not changed since `prepare`.

Each problem is one line naming the file, such as
`src/review/use-review.ts: 3 hunk notes for 4 hunks`.

## The folder

`<outputDir>/<branch>/review-page/` at the repository root, where `<branch>` is
the branch name after its last `/`:

```
brief.json      written by prepare
notes/          written by the agent, merged in name order
review.html     written by build
```

The page has to be inside the checkout, because its links open files in your
editor by their full path. Keep `outputDir` git-ignored; `prepare` warns when it
is not.

Running it again after new commits rewrites only what changed: `prepare` lists
the files whose diffs moved since the last brief, and the agent updates just
those notes.

## The page

- The overview, the commits, and every file in reading order, each with its diff
  beside the notes. A hunk's note opens inline when the hunk is clicked.
- A sidebar with read progress, and a choice between the reading order and a
  file tree showing changed files among their neighbours, coloured by git
  status.
- Read marks and UI checklist ticks kept in the browser per branch. A file whose
  diff changes after it was marked read shows as changed since read.
- Review comments on a line, a range of lines in one hunk, or a whole file. The
  `+` beside a line number starts one; drag it, or shift-click another line's,
  for a range. A file's **Comment** button covers the whole file. They are kept
  in the browser per branch, like the read marks, so rebuilding the page keeps
  them.
- A comments sheet (`c`, or **Comments** in the sidebar) listing every comment
  in reading order, each one jumping to its line, with **Export JSON**. The
  export uses GitHub's review comment fields — `path`, `line`, `side`,
  `start_line`, `start_side`, and `subject_type: "file"` — plus the PR, base and
  head, so it can be posted to the PR as a review.
- Keyboard shortcuts: `j`/`k` to move, `v` to mark read, `c` for comments, `?`
  for the rest.

Files far off screen are neither drawn nor hit-tested until scrolled near, so a
branch with thousands of changed lines stays responsive.

## Options

| Option      | Default  | What it is                                                                       |
| ----------- | -------- | -------------------------------------------------------------------------------- |
| `outputDir` | `tmp`    | The folder pages are built in, relative to the repository root, no spaces        |
| `editor`    | `vscode` | Which editor file links open first: `vscode` or `cursor`; the page can switch it |

The notes format is written next to the skill as `notes-format.md`, with an
example of every field.
