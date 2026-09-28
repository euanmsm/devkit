# @euanmsm/skills

## 0.2.0

### Minor Changes

- 55ef1ab: Add a `dead-code` skill and run `@euanmsm/dead-code` in the code
  review's prepass.

  - The prepass has a new built-in `deadCode` check, used when
    `@euanmsm/dead-code` is installed, in place of raw knip. In diff mode it
    runs `dead-code branch --json <base>`, so reviewers see what the branch
    newly left dead in any file, with the known false positives set apart and
    explained. In target mode it runs `dead-code --json -- <files>`, so a file
    named like a command stays a path. `prepass.deadCode` switches it (`'auto'`,
    `true`, `false`), and `knip` stays the fallback. Installed means declared in
    the root `package.json` or a workspace from it or `pnpm-workspace.yaml`.
  - `skills prepass tools` takes `--base <commit>`, and the code-review skill
    passes the merge base in diff mode only; an empty `--base` counts as none. A
    tool's new `baseCommand` field runs in its place, with the base appended,
    and `errorExitCodes` marks the exit codes that mean the tool itself failed.
    Replacing a built-in's `command` without its `baseCommand` is a config
    error.
  - A JSON tool's report is now the JSON on its stdout alone, kept even when the
    tool failed, with its stderr in the sentinel entry. npx finding no package
    it may install, and a JSON tool exiting non-zero without JSON, count as
    `failed`.
  - The review's verifier keeps a finding in a file the diff did not touch when
    the dead-code branch report lists it, and the dead-code lens says that
    report counts uncommitted edits.
  - The new `dead-code` skill, written from `.devkit/skills.json`, finds,
    verifies and removes dead code through `npx --no-install dead-code`. It
    stops at a preflight when the package is missing, and `skills sync` warns
    about it. It resolves the branch base from `origin/<baseBranch>` or the
    local branch, and never deletes a file `skills sync` generated. When
    enabled, the code review's `dead-code` lens loads it by default.

## 0.1.0

### Minor Changes

- acb8c57: Add the `code-review` skill: a deep multi-agent review whose workflow
  script is generated from `.devkit/code-review.mjs`, with built-in lenses,
  bundles and prompt wording a repository overrides only where it differs. Adds
  `skills prepass`, which the skill runs for its background typecheck, lint and
  import graph, plus a terse comment check and a knip dead-code check over the
  files under review whenever the repository has those tools installed. Adds a
  shared `rulesDir` setting.
- 870c616: Add the `pr` skill: opens the pull request with a summary and a
  Manual QA checklist whose every step is verified against the code, configured
  per repository in `.devkit/pr.mjs`. Adds `skills pr prepass|publish`, and
  `skills qa-gate reset|status` with an optional GitHub workflow that un-ticks
  the checklist on every push.
- 0db9d9e: Add `@euanmsm/skills`, which writes shared Claude Code skills into a
  repository from `.devkit/skills.json`. Ships `clean-commit-history` and
  `clean-comments` (with its `comments-specialist` agent), plus `skills check`
  to fail CI when the generated files drift from the config.
