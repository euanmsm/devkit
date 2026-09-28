# @euanmsm/skills

## 0.3.0

### Minor Changes

- 5912f8b: Fixes and options so a repository can adopt every skill without a
  fork.

  - `clean-comments`: each `comments-specialist` now loads its own skills with
    the `Skill` tool, so a preflight gate that checks each agent no longer
    blocks its edits. New `typecheckPaths` option.
  - `code-review`: new `dedupe` (`by: 'lens' | 'location'`, `lines`) and
    `verdicts` (`'all-refute' | 'any-refutes'`) config keys, and four more
    coverage prompt slots. The generated workflow passes `@euanmsm/terse`.
  - `pr`: new `name` option. Stories are found by import as well as by name
    (`storyMatch`). The QA gate trusts a checklist whose author can push,
    instead of reading `author_association`, which hid private organisation
    members. A failed `gh stack` lookup now stops the prepass instead of falling
    back to the base branch, and publish no longer changes an open PR's base
    unless given `--set-base`. `qaGate` takes
    `{ nodeVersion | nodeVersionFile, install: 'npx' | 'lockfile' }`. A stale
    checklist with no boxes now fails the gate rather than passing; re-run the
    skill on such PRs.
  - `dead-code`: new `typecheck` option.
  - New shared `format: 'prettier'` setting, which formats generated files with
    the repository's Prettier so `check` stays stable.
  - `code-review`: the skill's default `name` is now `review`, so it runs as
    `/review` and is written to `<skillsDir>/review/`. Set
    `"name": "code-review"` to keep the old command. The `skills.json` key stays
    `code-review`.

### Patch Changes

- 5aba561: The /pr workflow now gives a failing checklist step two verification
  rounds instead of four, so it finishes sooner.

## 0.2.1

### Patch Changes

- b89d81c: Patch the low-severity findings from the deep review.

  - core: `loadConfig` reads a file saved with a byte order mark, and a lone
    string pattern counts as one pattern.
  - vouch: a malformed allowlist names the config instead of crashing.
  - preflight: a skill loaded with a slash command counts as loaded, and path
    rules match on Windows.
  - shellgate: blocks `>&` redirects, BSD `sed -I`, `ruby -i` and more `perl -i`
    and `gawk` forms, and stops blocking read-only `git apply` flags, quoted
    `tee`, `\EOF` heredocs and `>` inside `(( ))`.
  - secure: config files in gitignored folders are skipped, `.gitignore` lines
    with CRLF or trailing spaces match, and the launcher reports errors in one
    line.
  - terse: TypeScript overloads share their JSDoc, one-line bodies are held to
    tag coverage, a logic comment at the end of a file is checked, git colour
    settings no longer hide changes, and `terse-watch` stays quiet on a bad
    config.
  - dead-code: branch mode no longer crashes when a workspace was a plain folder
    at the fork point, and only a real generated-file marker hides findings.
  - wt: refuses a locked worktree or an out-of-range port up front, validates
    `supabase.link` entries, and reads env files as dotenv does.
  - skills: `skills help` exits 0, a config module with no default export is an
    error, sync handles `agentsDir` and `rulesDir` naming one folder, reused
    finding ids no longer overwrite each other's verdicts, the import graph
    survives unreadable files and `$` in names, and the PR gate catches a
    missing continuation comment and a reset racing a re-publish.

- fe6c529: Fix the medium-severity findings from the deep review.

  - vouch: runs without a `.git` (Docker builds, tarballs), finds packages in
    `node_modules` from the cwd up to the git root, says when an allowlisted
    package is not installed, and can start npm on Windows.
  - preflight: a file in a nested checkout or worktree follows that checkout's
    own map, or the nearest enclosing one when it has none.
  - shellgate: blocks writes hidden behind a fake heredoc, a quoted path with a
    space, a `cd` inside a subshell, an interpreter behind `env` or a path, Bun
    and Deno write calls, and scripts that name an unrelated absolute path.
  - secure: pre-commit semgrep and lockfile-lint read the staged content,
    renamed and non-ASCII files included; the `.gitignore` check fails when a
    required pattern is negated; `Function(` and similar patterns no longer
    match identifiers that merely end in them.
  - terse: catches lines added inside an over-long comment block, checks
    one-line `/** */` comments, stops reading template literals as comments,
    accepts decorated and directive-led declarations, handles non-ASCII paths
    and CRLF edits, and `terse-watch` no longer drops a second identical
    violation.
  - dead-code: branch mode no longer reports old debt as new when the branch
    moves a project folder, or when `files` is left out of `include`.
  - wt: `wt supabase` rebuilds a missing worktree override instead of using the
    main stack, linked worktrees read the main checkout's `wt.local.json`,
    concurrent creates get distinct slots, `wt -d` removes a worktree whose
    folder is gone, editors and multiplexers are never killed, the Supabase
    guard reads ports and env files correctly, and an unreadable folder no
    longer aborts create.
  - skills: code-review, clean-comments and clean-commit-history use
    `origin/<base>` when it is ahead of the local base, the code-review skill
    passes absolute paths and works under zsh, duplicate bundle keys are
    refused, target paths are normalised, large file lists no longer hit E2BIG,
    the PR prepass lists moved files and reads non-ASCII paths, ignores the
    user's diff settings and survives unreadable paths, and CRLF checkouts count
    as in step.

- Updated dependencies [b89d81c]
  - @euanmsm/devkit-core@0.1.1

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
