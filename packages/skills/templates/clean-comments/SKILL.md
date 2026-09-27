---
name: clean-comments
description:
  'Fix comment debt — headers, JSDoc, property docs, `//` lines. Defaults to
  working-tree changes, else the branch diff, else paths you name. Fans out to
  parallel agents on a big changeset.'
user-invocable: true
---

{{marker}}

# Clean Comments

Fixes comment debt against the comment contract in `{{rulesDoc}}`. The terse
scanner finds the mechanical breaks; agents fix those and then make the two
judgement calls no script can.

```
/clean-comments                     # working-tree changes, else the branch diff
/clean-comments <path> [<path>...]  # a file, files, or a directory
```

**Comments only. Code is never edited.** That is the invariant the whole thing
rests on — a cleanup that also changes logic cannot be reviewed as a cleanup.

---

## 1. Load the skills before anything else

**Do this first, before resolving scope or spawning anything:**

```
{{preloadCalls}}
```

A `@euanmsm/preflight` hook, if the repository runs one, blocks edits to
governed files until these are loaded, and its check is **session-scoped, not
agent-scoped** — it reads the session transcript without caring which agent made
the call. Loading them here is what lets every spawned agent edit without
hitting the gate. Skip this step and the fan-out stalls on its first edit.

## 2. Resolve the scope

Run everything from the repository root. First rule that matches wins.

**Paths given** → use them. Expand a directory with `git ls-files <dir>`.

**No paths, working tree dirty** → the changed files that still exist, plus
every untracked file, including those inside new folders:

```bash
git -c core.quotePath=false diff --name-only --diff-filter=d HEAD
git -c core.quotePath=false ls-files --others --exclude-standard
```

**No paths, working tree clean** → the branch's own changes, minus the files it
deleted:

```bash
git -c core.quotePath=false diff --name-only --diff-filter=d {{baseBranch}}...HEAD
```

Each line is one path. A path can contain spaces, so quote every path in every
command from here on.

**Nothing either way** → say the tree and branch are both clean, and stop. Do
not go hunting the repo for debt to fix — that is not what was asked for.

## 3. Find the work

```bash
npx --no-install terse scan <files>
```

The scan keeps only the files `governs()` accepts, reading `.devkit/terse.json`,
and names each one it drops as `skipped`. Those are out of scope from here on;
do not reimplement the rule.

Every finding is `path:line  [rule-name]  message`, and the scan exits 1 when
there is one. Zero findings does **not** mean there is nothing to do —
`logic-comment-exception` and `what-not-why` are invisible to the scanner, so a
clean report still earns a judgement pass. Say so rather than declaring victory.

### Snapshot before editing

Copy the governed files to a fresh folder in the scratchpad before anything is
edited, keeping their paths relative to the repository root:

```bash
mkdir -p <snapshot> && tar -cf - -- <files> | tar -xf - -C <snapshot>
```

Step 5 compares against this copy, not against git. The files in scope may
already carry the user's own uncommitted edits, and untracked files have nothing
in git to compare with. Write the snapshot's absolute path down: shell variables
do not survive between commands.

## 4. Decide whether to fan out

| Scope                       | How                                          |
| --------------------------- | -------------------------------------------- |
| ≤ 3 files and ≤ 40 findings | Do it yourself. Spawning costs more          |
| More files or more findings | Fan out, one `comments-specialist` per batch |

Every file needs the judgement pass whatever its finding count, so many files
with few findings still fan out.

### Batching

- **Bundle whole files.** Two agents editing one file will clobber each other,
  so a file belongs to exactly one batch
- **Balance by finding count, not file count.** One 400-finding file is a batch
  on its own; forty clean-ish files fit in one
- **Cap at 8 agents.** Past that they contend for the same CPU and each runs
  slower than it would have

### Spawning

Put every `Agent` call in **one message** so they run concurrently. One per
batch, `subagent_type: "comments-specialist"`.

Each prompt carries:

- The exact file list for that batch, absolute paths
- That batch's slice of the scanner output, verbatim
- The snapshot folder's absolute path
- Nothing else — the contract is already preloaded in the agent

## 5. Verify

Re-run the scanner across the whole scope:

```bash
npx --no-install terse scan <files>
```

Then confirm the invariant held. Diff each file against its snapshot and check
that every changed line is a comment:

```bash
for f in <files>; do git diff --no-index -- "<snapshot>/$f" "$f"; done
```

Only the cleanup shows up: the user's earlier edits are in the snapshot too, and
untracked files are covered.

{{#typecheck}}Typecheck — a mangled block comment can swallow code:

```bash
{{typecheck}}
```

{{/typecheck}}## 6. Report

Leave the working tree as it is. Surface:

- Findings before and after, and how many files changed
- What the agents deleted under `logic-comment-exception`, grouped so a reviewer
  can scan it
- Anything left unfixed, and why
- Bugs or dead code the agents flagged and correctly did not touch

Then propose a commit message and stop. Staging and committing are the user's.

---

## Boundaries

- **Never edit code**, including a rename or a reordering that looks harmless
- **Never relocate cut content** to a README or a doc comment (`cut-is-deleted`)
  — it is deleted, and git history keeps it
- **Never work around a blocked edit** with `Bash`, `sed` or `python3`. A block
  names the rule it wants fixed; fix that
- **Never widen the scope.** A file outside what step 2 resolved is not yours to
  clean, however much debt it carries
