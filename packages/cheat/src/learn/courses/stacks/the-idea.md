A four-thousand-line pull request gets a worse review than four thousand-line
ones — and yet splitting work up usually means waiting for each PR to merge
before starting the next. A stack removes the wait: a chain of branches, each
built on the one below, each with its own PR, all open at once.

## The shape

- The **bottom** branch sits on trunk — usually `main`, but any branch.
- Every other branch sits on the one below it, and its PR's base is that branch.
- The **top** is where new work goes; the stack grows upward.

So a stack of `auth`, `api`, `ui` opens three PRs: `auth` into `main`, `api`
into `auth`, `ui` into `api`. Each PR's diff is only its own layer — whoever
reviews `ui` never wades through `auth` again.

## What GitHub does with it

The PRs are linked: a stack icon, a stack number of its own (which never
collides with a PR number — commands take either), and a stack map showing every
layer and its state. Branch protection and CI run on **every** layer, not just
the bottom — a stack is smaller reviews, not fewer rules.

When a lower branch changes, everything above it is rebased onto it and its
checks re-run. That cascade — each branch rebased onto the one below, bottom to
top — is the machinery the whole workflow rests on.

## The rules of the game

- Every branch must live in the same repository. No cross-fork stacks.
- Merging goes bottom-up: a PR can only land together with everything below it,
  never alone from the middle.
- The feature is in public preview, so details may still move.

## Getting the tool

Not built into gh — it's an extension:

```bash
gh extension install github/gh-stack
```

`gh stack alias` writes a `gs` shortcut into `~/.local/bin/` if the eleven
keystrokes get old, and `gh extension upgrade gh-stack` keeps it current.
