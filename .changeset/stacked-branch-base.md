---
'@euanmsm/skills': minor
'@euanmsm/wt': patch
---

Every branch skill now compares a branch with its parent, not with `baseBranch`.
That covers `code-review`, `pr`, `dead-code`, `reading-order`, `clean-comments`
and `clean-commit-history`. A new `skills base` command finds the parent from:

- the branch's open PR;
- a `gh stack`;
- the parent git recorded when the branch was created;
- the branch reflog.

It falls back to `baseBranch` only when none of those answers. A stacked
branch's review, PR checklist, dead-code check, reading order, comment cleanup
and history rewrite no longer include its parents' changes. Each skill says
which base it chose and why before it starts. A parent that has merged gives way
to `baseBranch`, from the parent's last commit after a squash merge. A parent
that is gone without a merged PR stops the skill instead of silently using
`baseBranch`. The PR config's `base` key is no longer used.

The code review labels every finding with its scope:

- the branch caused it;
- it was carried over from code the branch rewrote or moved;
- it is outside the branch.

Verifiers relabel a wrong scope instead of refuting an old problem. The report
gives each scope its own section and writes low-severity findings as a table.
Only the branch's and carried-over findings go on the PR. "Not this branch" ends
with a suggested Linear issue for each medium or higher finding, and the skill
offers to create them. Findings now merge by location by default, so several
lenses flagging one line give one finding. Two findings from the same reviewer
are never merged, in either mode.

`wt -b <branch>` records the branch it forked from as the parent, where the
branch skills look for it.
