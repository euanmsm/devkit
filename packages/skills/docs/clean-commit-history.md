# clean-commit-history

Rewrites the current branch's commits into a clean sequence — one concern per
commit, stacked from the bottom layer up — **without changing a single byte of
the code the branch ends with**. Only the grouping into commits changes.

It is for the moment before opening a pull request, when a branch holds twenty
commits called "wip", "fix", "fix again".

## Running it

```
/clean-commit-history          # rewrite on top of the configured base branch
/clean-commit-history develop  # rewrite on top of another branch
```

The model never runs it on its own initiative: the skill is marked
`disable-model-invocation`, so it only runs when you type the command.

## What it does

### 1. Preflight

- Finds the current branch, and stops if it is the base branch itself.
- Stops if there are uncommitted changes. It never stashes your work.
- Records the current commit, `ORIGINAL_HEAD`. Everything afterwards is checked
  against this.
- Records the fork point, the commit where the branch left the base branch
  (`git merge-base`). The new commits are stacked on the fork point, not on the
  base branch's latest commit, so work that landed on the base since is never
  undone. Rebasing onto the newer base is a separate step you take yourself.
- Stops if the base branch you named does not exist.
- Checks for commit hooks (a `.husky/` folder, a `core.hooksPath` setting or any
  installed hook) and for commit signing (`commit.gpgsign`). If it finds any, it
  warns you first: every new commit runs those hooks and is signed, so a hook
  that rejects a commit or rewrites files, or a signing prompt, stops the
  script. It does not skip them with `--no-verify`.

### 2. Creates a backup

It always creates a local branch named `<branch>-backup-<short commit id>`
pointing at `ORIGINAL_HEAD`, and leaves it there, even when the branch is
pushed. The remote copy doesn't count as a backup, because the force-push you
run afterwards overwrites it. On a rerun at the same commit it reuses the backup
branch it already made. It tells you the backup's name before going further.

### 3. Works out the story

It reads the existing commits and every file changed since the fork point, then
groups every changed path into commits, ordered bottom-up so each commit makes
sense on its own. The order comes from the `layerOrder` option; layers the
branch did not touch are skipped. Every path — added, changed or deleted — lands
in exactly one commit.

Commit messages follow the repository's commit rules if `commitRules` points at
them, and Conventional Commits (`type(scope): subject`) otherwise.

### 4. Writes and runs a script

Rather than committing step by step, it writes a bash script to its scratch
folder, so the grouping can be read before it runs. The script has
`ORIGINAL_HEAD` written into it as a fixed commit id, and:

1. Checks it is on the right branch, at `ORIGINAL_HEAD`, with nothing
   uncommitted.
2. Sets a trap: if any later command fails, the branch is reset to
   `ORIGINAL_HEAD`, exactly as it was.
3. Moves the branch back to the fork point with `git reset --soft`, which leaves
   every file exactly as it is and only unstages the changes.
4. Stages each group by path and commits it.
5. Checks two things at the end, and fails if either is wrong:
   - nothing is left uncommitted
   - the final code is byte-identical to `ORIGINAL_HEAD`

A failure anywhere, whether a hook, a missed file or a failed check, leaves the
branch where it started, so the fix is to correct the grouping and run the
script again.

Because no file is ever edited — only staged and committed — the code cannot
change. The checks are there to prove it.

### 5. Reports, and does not push

It shows the old commits against the new ones and where the backup is. It never
pushes. Publishing rewritten history is your decision, so it prints the command
(`git push --force-with-lease`) and stops.

If anything looks wrong, `git reset --hard <backup branch>` puts the old history
back.

## Options

Under `skills["clean-commit-history"]` in `.devkit/skills.json`. It also uses
the shared `baseBranch` setting.

| Option        | Default   | What it does                                                                                                                                 |
| ------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `commitRules` | none      | Path to the repository's commit message rules. The skill tells the model to follow them. Without it, the skill asks for Conventional Commits |
| `layerOrder`  | see below | The order commits are stacked in, bottom first. Written into the skill as `a → b → c`                                                        |

The default `layerOrder`:

```json
[
  "migrations",
  "generated types",
  "shared schemas",
  "data access",
  "services",
  "routes",
  "UI",
  "tests",
  "docs",
  "cleanup"
]
```

### Example

```json
{
  "skills": {
    "clean-commit-history": {
      "commitRules": ".claude/rules/commits.md",
      "layerOrder": [
        "db migration",
        "generated types",
        "schemas/shared",
        "data access",
        "services",
        "API routes",
        "components/UI",
        "stories",
        "docs",
        "cleanup"
      ]
    }
  }
}
```

## Files it writes

| File                                        |
| ------------------------------------------- |
| `<skillsDir>/clean-commit-history/SKILL.md` |
