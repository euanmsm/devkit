# How `skills sync` works

Every skill in this package reaches a repository the same way. The repository
says which skills it wants in one config file, and
`npx --no-install skills sync` writes those skills into the repository as
ordinary files, which are then committed. Nothing is read from `node_modules`
when a skill runs, apart from the code review's prepass (see
[code-review.md](code-review.md#the-prepass)).

This page covers what every skill shares. Each skill's own page covers what it
does and its options:

- [clean-commit-history.md](clean-commit-history.md)
- [clean-comments.md](clean-comments.md)
- [code-review.md](code-review.md)
- [dead-code.md](dead-code.md)
- [pr.md](pr.md)
- [reading-order.md](reading-order.md)

## The config file

`.devkit/skills.json`, at the repository root. `sync` finds the root by walking
up from the current directory to the nearest folder holding `.git`.

```json
{
  "skillsDir": ".claude/skills",
  "agentsDir": ".claude/agents",
  "rulesDir": ".claude/rules",
  "baseBranch": "main",
  "skills": {
    "clean-commit-history": {},
    "clean-comments": { "typecheck": "npm run typecheck" },
    "code-review": { "githubReview": true },
    "pr": { "qaGate": true }
  }
}
```

A skill is installed only when its name appears under `skills`. Its value is an
object of options, and an empty object installs it with every option at its
default. To leave a skill out, remove its key — `false` is an error, not a way
to switch it off.

### Shared settings

These sit at the top level and apply to every skill.

| Setting      | Default          | What it is                                                                                                                    |
| ------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `skillsDir`  | `.claude/skills` | The folder skills are written into, one subfolder each                                                                        |
| `agentsDir`  | `.claude/agents` | The folder agents are written into (only `clean-comments` writes one)                                                         |
| `rulesDir`   | `.claude/rules`  | The folder rules are written into (only `code-review` writes one)                                                             |
| `baseBranch` | `main`           | The branch a skill compares the current branch with when it has no parent branch — see [base-branch.md](base-branch.md)       |
| `format`     | `none`           | `prettier` runs the repository's own Prettier over each generated file before `sync` writes it and before `check` compares it |

Each is a non-empty string. A trailing slash on a folder is dropped, so
`.claude/skills/` and `.claude/skills` mean the same.

Claude Code reads skills from `.claude/skills`. A repository that keeps its real
files in `.agents/skills` so Codex reads them too, with `.claude/skills` as a
symlink pointing there, sets `skillsDir` to `.agents/skills` so `sync` writes to
the real folder.

### Mistakes are errors

Each of these stops `sync` and `check` with a message naming
`.devkit/skills.json` and the key:

- a skill name the package does not know, an option a skill does not have, or a
  top-level setting outside the five above
- `skills` that is not an object, or a skill whose value is not an object —
  including `false`
- an option whose type differs from its default's: a list of strings, a string,
  or `true`/`false`
- a shared setting that is not a non-empty string, or a `format` other than
  `none` or `prettier`
- `"format": "prettier"` in a repository where Prettier is not installed
- a `code-review` or `pr` `name` that is not lowercase letters, digits and
  dashes, since it becomes a folder name
- a `pr` `qaGate` that is not `true`, `false` or an object of its settings
- two skills that would write the same file, such as a `code-review` named
  `clean-comments`

A typo never silently does nothing.

## What `sync` does, step by step

1. Reads `.devkit/skills.json` once, checks it, and fills in every default.
2. For each skill listed, renders its files from the package's templates in
   memory. Nothing is written yet.
3. Checks every file it is about to write. If one already exists and was not
   written by `sync` — a hand-written skill of the same name, say — it stops,
   lists those files, and writes nothing at all. Pass `--force` to replace them.
4. Writes each file whose content changed. A file that already matches is left
   untouched.
5. Looks through `skillsDir`, `agentsDir`, `rulesDir` and `.github/workflows`
   for files it wrote on an earlier run that the config no longer asks for — a
   skill taken out of `skills`, say — and deletes them. A skill folder left
   empty is removed too.
6. Prints what it wrote and removed. Then, on stderr, a warning for each enabled
   skill whose package the repository does not depend on — today, the
   `dead-code` skill without `@euanmsm/dead-code`. The skill is still written.
   `skills check` never prints these warnings.

### How `sync` knows its own files

Every generated file carries a line starting `Generated by @euanmsm/skills`,
which names the config files its content comes from — `.devkit/skills.json`,
plus the skill's own `config` file for `code-review` and `pr` — in a fixed
place:

- in a markdown file, an HTML comment straight after the frontmatter, or on the
  first line when there is no frontmatter
- in a workflow script, a `//` comment on the first line
- in a GitHub workflow, a `#` comment on the first line

`sync` only ever overwrites or deletes a file with that line in that place
(unless you pass `--force`). Only the start of the line counts, so a file
written by an older release, whose line is worded differently, is still
recognised, and so is one a Windows checkout gave CRLF line endings; `sync`
writes it back with LF. A file that mentions the phrase anywhere else — a rule
explaining generated files, say — is yours. Your own skills can sit in the same
folders safely — `sync` will never touch `.claude/skills/comments/` because it
did not write it.

### Files written once

The PR skill's traps file is the one exception. `sync` writes a starter copy
only when the file does not exist, and from then on it belongs to the
repository: `sync` never overwrites or deletes it, and `check` reports it only
when it is missing. It holds knowledge the repository earns, which no config
could generate.

Because the line is there, **never edit a generated file by hand**. Change the
config and run `sync` again. A hand edit is overwritten on the next run, and
`skills check` reports it in the meantime.

## `skills check`

Renders every file the same way `sync` would, compares the result with what is
on disk, and exits with code 1 if anything differs. It reports each file as one
of:

| Problem                         | Meaning                                                       |
| ------------------------------- | ------------------------------------------------------------- |
| `missing`                       | The config asks for it, and it is not on disk                 |
| `not generated by skills sync`  | A file sits at that path without the generated line           |
| `out of date or edited by hand` | The file on disk differs from what `sync` would write now     |
| `no longer in the config`       | `sync` wrote it earlier, and the config no longer asks for it |

Run it in CI:

```json
{ "scripts": { "check:skills": "skills check" } }
```

It catches three things: someone editing a generated file, someone changing the
config without running `sync`, and a package upgrade whose templates changed.

## Things that break `check`

- **Prettier.** If the repository formats markdown or JavaScript with Prettier,
  it will reformat the generated files and `check` will report them as edited.
  Set `"format": "prettier"` so `sync` writes them already formatted, or add the
  generated paths to `.prettierignore`, for example `.claude/skills/review/`.
- **Upgrading the package.** New templates mean new output. After upgrading, run
  `sync` and commit the result.
- **Editing a config the skill reads outside `skills.json`.** `clean-comments`
  reads `.devkit/terse.json`, `code-review` reads `.devkit/code-review.mjs`, and
  `pr` reads `.devkit/pr.mjs` and the PR template. Changing either changes the
  generated files, so run `sync` afterwards.

## Command reference

Run each as `npx --no-install skills …`. npm has an unrelated package called
`skills`, and a plain `npx skills` downloads and runs it wherever this package
is not installed.

| Command               | What it does                                                               |
| --------------------- | -------------------------------------------------------------------------- |
| `skills sync`         | Writes every configured skill; removes generated files no longer asked for |
| `skills sync --force` | The same, replacing hand-written files that sit where generated ones go    |
| `skills check`        | Exits 1 and lists every generated file that differs from the config        |
| `skills prepass …`    | The code review's background prework. The skill runs it; you never need to |
| `skills pr …`         | The PR skill's prepass and publish steps. The skill runs them              |
| `skills qa-gate …`    | The Manual QA gate. Its generated GitHub workflow runs it                  |
