# Review page: the skill

How `/review-page` turns a branch into the review page: what the agent writes,
what the script builds, and how they check each other.

## The split

- **Script:** every fact git can give. Diffs, paths, statuses, line counts,
  commits, full file text, the folder tree.
- **Agent:** judgement and prose only. Reading order, grouping, what each change
  means, how to check the UI.

The agent never copies code, line numbers or counts into its notes. It names
files by path and hunks by position; the script attaches the real diff. Notes
can't drift from the code.

## Flow

```
/review-page
  1. script: prepare  → brief.json         (facts the agent needs to plan)
  2. agent:  reads the diff, writes notes  (judgement and prose)
  3. script: build    → checks notes, writes review.html
             └─ on errors, the agent fixes the notes and runs build again
  4. skill opens the page
```

### 1. `prepare` (script)

- Works out the base: the open PR's base, the parent branch in the stack, or
  `--base`.
- Finds the fork point.
- Writes a brief listing each changed file: status, +/−, hunk count and headers,
  diff hash.

The brief tells the agent exactly what to cover ("4 hunks, so 4 hunk notes").

### 2. Notes (agent)

Plain JSON, not the prototype's `.mjs`.

| Field                                   | Written by           | Contents                                                                                   |
| --------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------ |
| `title`                                 | Agent, or PR title   | One line for the branch                                                                    |
| `overview`                              | Agent                | Summary, what changes for users, what to keep in mind                                      |
| `sections[]`                            | Agent                | Ordered groups: title, intro, files                                                        |
| `sections[].files[]`                    | Agent                | Path, summary, context, what changed, one note per hunk (parts for new files), tests       |
| `skim[]`                                | Agent                | Mechanical-change groups: label, note, paths                                               |
| `uiReview`                              | Agent, if UI changed | Setup commands, walkthroughs (do / expect steps), related files, cases the seed can't show |
| Branch, base, PR link, commits, editor  | Script               | —                                                                                          |
| Diffs, full files, tree, folder changes | Script               | —                                                                                          |

### 3. `build` (script)

These checks fail the build (they are only warnings in the prototype):

- Every changed file appears exactly once: in a section, in Skim, or as a test.
- No file is named that isn't in the diff.
- Each file has as many hunk notes as hunks.
- Every cited line range is in the diff.

Errors print one per line (`use-review.ts: 3 hunk notes for 4 hunks`). The agent
fixes those notes and runs the build again. On a pass, it writes one
self-contained HTML file.

## What the split makes easy

- **Big branches can use subagents.** Build accepts a folder of note files
  (`notes/01-intent.json`, …) and joins them in name order. The main agent plans
  the sections and hands each to a subagent. This branch's notes were 83KB.
- **Re-reviews are cheap.** The brief records diff hashes, so after new commits
  `prepare` lists only the files whose diffs changed. The agent rewrites just
  those, and the page already shows "changed since read".

## Where things live

Built as the `review-page` skill in `@euanmsm/skills`:

- **Scripts and the page:** `packages/skills/src/review-page/`, run as
  `skills review-page prepare` and `skills review-page build`.
- **The skill:** `packages/skills/templates/review-page/`, its `SKILL.md` and
  `notes-format.md`, a reference for the notes with an example per field.

## Decided

1. **The page is written to `tmp/<branch>/review-page/`** (the `outputDir`
   option). `prepare` warns when that folder is not git-ignored.
2. **The UI review is part of the same run**, written only when the agent finds
   the diff changes what users see or do.
