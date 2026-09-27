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

Optional arg `$1` = base branch to rewrite on top of (default `{{baseBranch}}`).

## Non-negotiable guarantees

Every run MUST satisfy all three, or abort and report:

1. **Backup exists first.** Before rewriting, confirm the branch is fully pushed
   to its remote tracking ref, OR create a local backup branch. Never rewrite an
   unbacked branch.
2. **Byte-identical outcome.** The final tree must equal the pre-rewrite HEAD
   tree exactly (`git diff <old-head> HEAD` empty). No content change — only
   commit grouping changes.
3. **Nothing left behind.** Zero uncommitted changes after the rewrite. If a
   file is unaccounted for, the run failed.

## Workflow

### 1. Preflight

- `BASE=${1:-{{baseBranch}}}`. Resolve the branch:
  `git rev-parse --abbrev-ref HEAD`. Abort if on `$BASE` itself.
- Abort if working tree is dirty (`git status --porcelain` non-empty). The user
  manages their own uncommitted work — never stash it.
- Capture `ORIGINAL_HEAD=$(git rev-parse HEAD)`. This is the byte-for-byte
  reference point.
- Capture `FORK=$(git merge-base "$BASE" HEAD)`, the commit the branch left
  `$BASE` at. The rewrite stacks onto `$FORK`, never onto `$BASE`'s tip: if
  `$BASE` has moved on, resetting onto its tip would make the new commits revert
  everything it gained since. Rebasing onto the newer base is a separate step
  for the user, not part of this skill.

### 2. Guarantee a backup

Check whether local HEAD is safe:

- If an upstream is set (`git rev-parse --abbrev-ref @{u}` succeeds) AND
  `git rev-parse @{u}` equals a commit that contains `ORIGINAL_HEAD`'s tree
  reachable on the remote — i.e. `git status` shows the branch is not ahead of
  its remote — the remote is the backup. Report which remote ref backs it up.
- Otherwise create a local backup branch pointing at `ORIGINAL_HEAD`:
  `git branch <branch>-backup-<shortsha> <ORIGINAL_HEAD>` (use the short SHA so
  reruns don't collide). Report the backup branch name. Do NOT delete it.

State the backup explicitly to the user before proceeding.

### 3. Understand the story

- `git log --oneline "$FORK"..HEAD` — the messy history.
- `git diff --name-status "$FORK" HEAD` and `--stat` — the full change surface.
- Read small/ambiguous modified files to slot them into the right layer.
- Group every changed path into **atomic, layered commits**, ordered bottom-up
  so each commit stands on its own. Typical order (skip layers not touched):
  {{layerOrder}}.
- {{commitStyle}} One concern per commit, no fluff.
- Every path must land in exactly one commit — including deletions and
  modifications, not just additions.

### 4. Write a self-verifying script

Emit a bash script to the scratchpad (not inline commits) so the grouping is
reviewable and the safety assertions run atomically. The script MUST:

- `set -euo pipefail`; `cd` to repo root; re-assert branch + clean tree.
- `git reset --soft "$FORK"` then `git reset -q` (HEAD to the fork point, tree
  untouched, everything unstaged).
- Stage each group by explicit pathspec (`git add -A -- <paths>` so deletions
  and modifications are captured), then `git commit -m "<message>"`.
- For "everything under X except subdir Y": `git add -A -- X` then
  `git reset -q -- X/Y`.
- **Final assertions** (abort non-zero on failure):
  - `git status --porcelain` empty — nothing missed.
  - `git diff --quiet $ORIGINAL_HEAD HEAD` — tree byte-identical.
- Print the new `git log --oneline "$FORK"..HEAD` on success.

Run the script. If it aborts, the branch is unchanged from the last good commit
— diagnose the missed path, fix the grouping, rerun.

### 5. Report, do not push

- Show the old → new commit mapping and the backup location.
- **Never push or force-push.** Publishing rewritten history rewrites the remote
  — that is the user's call. Surface the exact command
  (`git push --force-with-lease`) and stop. Wait for explicit authorisation.

## Notes

- The `reset --soft` mechanism guarantees byte-identity for free: no file is
  ever edited, so the tree cannot drift. The assertions are belt-and-braces.
- Reuse the backup branch as the recovery path: if anything looks wrong after
  the rewrite, `git reset --hard <backup>` restores the original history.
