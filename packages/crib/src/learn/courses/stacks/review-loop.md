Review feedback rarely lands on the top of the stack. The habit this lesson
builds: fix a change **in the layer it belongs to** and let the rebase carry it
upward — never patch it where you happen to be standing.

## The mid-stack fix

A reviewer wants a rename in layer two of your four-layer stack:

```bash
gh stack down               # ...until you're on that branch
git add -p && git commit -m "Rename per review"
gh stack rebase --upstack   # carry it up through the layers above
gh stack push               # publish, per-branch --force-with-lease
gh stack top                # back to where you were working
```

`--upstack` rebases from here to the top; `--downstack` is the other half, trunk
up to here; a bare `rebase` does the whole chain. The layers above your fix get
rebased, their PRs update, and their checks re-run — an approval up there may
need re-earning, which is the honest price of changing its foundations.

## Which command, when

- `push` — publish the branches exactly as they are. Nothing else.
- `rebase` — fetch, then cascade locally. Touches nothing on GitHub.
- `sync` — the everything move: fetch, fast-forward trunk, cascade, push,
  reconcile PR state. Reach for it when trunk moved or a PR merged.
- `submit` — create or update the PRs themselves.

## When the rebase fights back

A conflict pauses `rebase`: fix the files, `git add` them, then
`gh stack rebase --continue` — or `--abort` to put every branch back where it
was. `sync` instead rolls the whole run back on conflict, which is why the
fix-up loop belongs to `rebase`. And if your repo requires signed commits,
rebase here rather than with GitHub's **Rebase stack** button — server-side
rebases aren't signed.

## Bigger surgery

"Split this PR" or "these two belong together" is `gh stack modify`: a TUI that
drops, folds, inserts, reorders and renames, `Ctrl+S` to apply the lot. Run
`gh stack submit` afterwards so the PRs catch up with the new shape.
