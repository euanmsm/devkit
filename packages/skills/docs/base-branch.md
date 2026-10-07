# How the base branch is found

Every skill that works on "this branch's changes" compares the branch with its
**parent**: the branch it was cut from. That covers `code-review`, `pr`,
`dead-code`, `reading-order`, `clean-comments` and `clean-commit-history`. On a
stacked branch the parent is the branch below it, so its parents' commits never
end up in a review, a checklist or a rewrite. `baseBranch` is only the fallback.

All six skills ask the same command:

```bash
npx --no-install skills base [--base <branch>] [--json]
```

## Where the parent comes from

It tries these in order and stops at the first answer:

1. **`--base <branch>`**, when given. An empty value counts as not given.
2. **The base of the branch's open PR**, from
   `gh pr view <branch> --json number,baseRefName,state`. It asks only when the
   repository has an `origin` remote. No `gh`, or no PR for the branch, moves on
   quietly. Any other failure, such as being offline, moves on with a warning.
3. **The branch below it in a `gh stack`**, when the `gh stack` extension is
   installed. A stack it cannot read stops the command and asks for `--base`,
   since guessing could move a mid-stack PR.
4. **The parent git recorded when the branch was created**:
   `branch.<name>.vscode-merge-base` in git config. VS Code, Claude Code
   worktrees and `wt -b <branch> -f <base>` all write it. A value naming the
   branch itself is ignored.
5. **The branch reflog's oldest entry**, when it reads
   `branch: Created from <name>` and `<name>` is a branch rather than a commit.
6. **`baseBranch`**, only when none of the above answers.

When the PR and the recorded parent disagree, the PR wins and a warning names
both.

## Which copy, and from where

It fetches the parent from `origin` first; offline, the refs already there are
used. It then compares with the local branch or `origin/<parent>`, whichever the
current branch left later. A local copy that was never pulled would otherwise
add every commit that landed upstream since. The commit where the branch left
that copy is the **fork**, and every skill diffs from it.

## Parents that have merged

- **The parent was merged into `baseBranch`, and this branch rebased onto it.**
  The parent is then behind `baseBranch` in this branch's history, so the
  command compares against `baseBranch` instead and says so in a warning.
- **The parent's branch is gone.** If its PR merged and its last commit is still
  in this branch's history, as it is after a squash merge, the command compares
  against `baseBranch` from that commit. The parent's commits then stay out of
  the diff. If no merged PR is found, it stops and asks for `--base`. It never
  falls back to `baseBranch` silently.

## What it prints

Shell assignments a skill evaluates, each value single-quoted:

```bash
BASE_BRANCH='cur-1722-03-unverified-login'
BASE_REF='origin/cur-1722-03-unverified-login'
FORK='6d8c7cff3…'
BASE_SOURCE='PR #992'
```

`BASE_SOURCE` is one of these:

- `given`
- `PR #<n>`
- `gh stack`
- `recorded when the branch was created`
- `the branch reflog`
- `default branch`

A merged parent adds `, merged into <baseBranch>`. Warnings go to stderr, each
starting `warning:`. `--json` prints the same as one object, with the warnings
and the current branch.

It exits with code 2 and one line saying why when it cannot decide:

- on `baseBranch` itself;
- the branch given does not exist;
- the parent is gone with no merged PR;
- the stack cannot be read.

Every skill tells you the base and how it was found before it does anything
else. A wrong base is the one mistake that makes everything after it wrong.
