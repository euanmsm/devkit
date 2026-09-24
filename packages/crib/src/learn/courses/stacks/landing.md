Merging a stack has one rule: bottom-up, together. You can merge the bottom PR
alone, or the bottom three at once — never a middle PR by itself. Pick a PR and
everything below it merges with it as a single operation; if any of them can't
merge, none of them do.

## From the terminal

```bash
gh stack merge              # wizard: pick how far up to land
gh stack merge -y --squash  # the lot, squashed, no questions
```

Given a bare number, `merge` reads it as a stack number first, then as a PR.
GitHub judges branch protection as the merge runs — a stack can't bypass a
required review or a red check on any layer. A merge queue on the base takes the
stack's PRs in order, and if one is ejected, everything above it leaves the
queue too. The one thing you lose: auto-merge doesn't work on stacked PRs.

## After a layer lands

When the bottom PR merges, the one above is retargeted onto trunk on GitHub's
side — it becomes the new bottom, ready to review. Your clone doesn't know yet:

```bash
gh stack sync --prune
```

fast-forwards trunk, rebases what's left, pushes, and — the `--prune` part —
deletes your local branches for the merged PRs. Merge then sync is the steady
rhythm of a long stack: land the bottom, everything shuffles down, keep working
on top.

Once every PR has merged, the stack is complete and can't be extended —
`gh stack submit` on new work simply starts the next one.

## Changing your mind

`gh stack unstack` takes a stack apart without deleting anything: the PRs and
branches stay, they just stop being linked. `--local` only forgets it on your
machine and leaves GitHub alone. A PR already queued to merge refuses, and the
stack is kept.
