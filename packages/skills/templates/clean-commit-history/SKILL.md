---
name: clean-commit-history
description:
  "Rewrite the current branch's messy commit history into a clean, atomic,
  layered story on top of {{baseBranch}} — backup-guarded and byte-identical.
  Use when asked to clean up commits, squash/regroup a branch, or rewrite
  history before a PR."
user-invocable: true
disable-model-invocation: true
---

{{marker}}

# Atomic History Rewrite

Rewrite the current branch's commit history into a clean, atomic, layered
sequence that tells a clear story — **without changing the resulting tree by a
single byte**. Invoking this skill authorises the `git reset` / `git add` /
`git commit` sequence below for THIS operation only, overriding any standing
rule against touching the index. It does **not** authorise any push.

Base branch: `$ARGUMENTS` if given, otherwise `{{baseBranch}}`.

## Non-negotiable guarantees

Every run MUST satisfy all three, or abort and report:

1. **Backup exists first.** A local backup branch points at the original commit
   before anything is rewritten. Never rewrite an unbacked branch.
2. **Byte-identical outcome.** The final tree must equal the pre-rewrite HEAD
   tree exactly (`git diff <old-head> HEAD` empty). No content change — only
   commit grouping changes.
3. **Nothing left behind.** Zero uncommitted changes after the rewrite. If a
   file is unaccounted for, the run failed.

Shell variables do not survive from one command to the next. Every value
captured below — the base, `ORIGINAL_HEAD`, `FORK`, the backup name — is written
out literally in every later command and in the script.

## Workflow

### 1. Preflight

Run from the repository root:

```bash
BASE=<base branch>
git rev-parse --verify --quiet "$BASE^{commit}" || echo "ABORT: no branch $BASE"
git rev-parse --abbrev-ref HEAD
git status --porcelain
git rev-parse HEAD
git merge-base "$BASE" HEAD
```

- Abort if the base branch does not exist.
- Abort if on the base branch itself.
- Abort if the working tree is dirty (`git status --porcelain` non-empty). The
  user manages their own uncommitted work — never stash it.
- `ORIGINAL_HEAD` is the full SHA from `git rev-parse HEAD`. This is the
  byte-for-byte reference point.
- `FORK` is the merge-base, the commit the branch left the base at. The rewrite
  stacks onto `FORK`, never onto the base's tip: if the base has moved on,
  resetting onto its tip would make the new commits revert everything it gained
  since. Rebasing onto the newer base is a separate step for the user, not part
  of this skill.

Then check what runs on every commit:

```bash
echo "hooksPath: $(git config --get core.hooksPath)"
test -d .husky && echo "husky: .husky/ present"
echo "hooks: $(ls "$(git rev-parse --git-path hooks)" | grep -v '\.sample$' | tr '\n' ' ')"
echo "signing: $(git config --get commit.gpgsign)"
```

If there is a `.husky/` folder, a `core.hooksPath`, any hook listed, or signing
is `true`, **warn the user before running the script**: every new commit runs
those hooks and is signed, and a hook can reject a commit, rewrite staged files
or fail on a commit that holds only part of the change, and signing can stop on
a passphrase prompt. Any of these fails the script, and its trap puts the branch
back. Do not skip them with `--no-verify` or `--no-gpg-sign`; if they block the
run, report which one and stop.

### 2. Create the backup

Always create a local backup branch, even when the branch is pushed. The remote
copy is not a backup: the `git push --force-with-lease` this skill hands over at
the end overwrites it.

```bash
BACKUP=<branch>-backup-<short ORIGINAL_HEAD>
if git rev-parse --verify --quiet "refs/heads/$BACKUP" >/dev/null; then
  test "$(git rev-parse "refs/heads/$BACKUP")" = <ORIGINAL_HEAD> && echo "reusing $BACKUP" || echo "ABORT: $BACKUP points elsewhere"
else
  git branch "$BACKUP" <ORIGINAL_HEAD> && echo "created $BACKUP"
fi
```

A rerun at the same commit finds the backup already there and reuses it. If a
branch of that name points anywhere else, abort. Never delete or move the
backup.

State the backup branch to the user before proceeding.

### 3. Understand the story

- `git log --oneline <FORK>..HEAD` — the messy history.
- `git diff --name-status <FORK> HEAD` and `--stat` — the full change surface.
- Read small/ambiguous modified files to slot them into the right layer.
- Group every changed path into **atomic, layered commits**, ordered bottom-up
  so each commit stands on its own. Typical order (skip layers not touched):
  {{layerOrder}}.
- {{commitStyle}} One concern per commit, no fluff.
- Every path must land in exactly one commit — including deletions and
  modifications, not just additions.

### 4. Write a self-verifying script

Emit a bash script to the scratchpad (not inline commits) so the grouping is
reviewable and the safety assertions run atomically. It follows this shape, with
the SHAs and branch written in literally:

```bash
#!/usr/bin/env bash
set -euo pipefail
ORIGINAL_HEAD=<full sha>
FORK=<full sha>
cd <repo root>
test "$(git rev-parse --abbrev-ref HEAD)" = <branch>
test "$(git rev-parse HEAD)" = "$ORIGINAL_HEAD"
test -z "$(git status --porcelain)"
trap 'git reset -q --hard "$ORIGINAL_HEAD"; echo "Failed: branch restored to $ORIGINAL_HEAD" >&2' ERR

git reset -q --soft "$FORK"
git reset -q

git add -A -- <paths>
git commit -q -m "<message>"
# … one add + commit per group

test -z "$(git status --porcelain)"
git diff --quiet "$ORIGINAL_HEAD" HEAD
git log --oneline "$FORK"..HEAD
```

- `ORIGINAL_HEAD` is the SHA from preflight, never `$(git rev-parse HEAD)`: a
  recomputed value would lose the reference point on a rerun.
- The trap is armed only after the three checks pass, so it can never reset a
  different branch or throw away uncommitted work. The tree was clean at
  `ORIGINAL_HEAD`, so its `reset --hard` restores exactly that, including any
  file a hook rewrote.
- Assertions are plain commands (`test …`, `git diff --quiet …`). Never
  `|| exit 1`: an explicit `exit` does not fire the `ERR` trap.
- `git add -A -- <paths>` captures deletions and modifications. Quote any path
  with spaces.
- For "everything under X except subdir Y": `git add -A -- X` then
  `git reset -q -- X/Y`.

Run it with `bash <script>`. If it fails, the trap has already put the branch
back: confirm `git rev-parse HEAD` equals `ORIGINAL_HEAD` and
`git status --porcelain` is empty, then fix the cause (a missed path, a hook)
and rerun the same script. If HEAD is anywhere else, stop and tell the user to
run `git reset --hard <backup branch>`.

### 5. Report, do not push

- Show the old → new commit mapping and the backup branch.
- **Never push or force-push.** Publishing rewritten history rewrites the remote
  — that is the user's call. Surface the exact command
  (`git push --force-with-lease`) and stop. Wait for explicit authorisation.

## Notes

- The `reset --soft` mechanism guarantees byte-identity for free: no file is
  ever edited, so the tree cannot drift. The assertions are belt-and-braces.
- The backup branch is the recovery path: if anything looks wrong after the
  rewrite, `git reset --hard <backup branch>` restores the original history.
