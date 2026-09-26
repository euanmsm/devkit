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

### 2. Makes sure a backup exists

If the branch is pushed and the remote has everything the local branch has, the
remote copy is the backup. Otherwise it creates a local branch named
`<branch>-backup-<short commit id>` pointing at `ORIGINAL_HEAD`, and leaves it
there. It tells you where the backup is before going further.

### 3. Works out the story

It reads the existing commits and the full list of changed files, then groups
every changed path into commits, ordered bottom-up so each commit makes sense on
its own. The order comes from the `layerOrder` option; layers the branch did not
touch are skipped. Every path — added, changed or deleted — lands in exactly one
commit.

Commit messages follow the repository's commit rules if `commitRules` points at
them, and Conventional Commits (`type(scope): subject`) otherwise.

### 4. Writes and runs a script

Rather than committing step by step, it writes a bash script to its scratch
folder, so the grouping can be read before it runs. The script:

1. Moves the branch back to the base with `git reset --soft`, which leaves every
   file exactly as it is and only unstages the changes.
2. Stages each group by path and commits it.
3. Checks two things at the end, and fails loudly if either is wrong:
   - nothing is left uncommitted
   - the final code is byte-identical to `ORIGINAL_HEAD`

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
