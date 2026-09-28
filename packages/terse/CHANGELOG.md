# @euanmsm/terse

## 0.3.2

### Patch Changes

- ebcd88f: Fix the high-severity findings from the deep review.

  - vouch: the README no longer says to run vouch from your own `postinstall`,
    which `ignore-scripts` skips. Run it as its own step instead.
  - secure: `secure-config` no longer passes when a config or staged file path
    holds a space or quote, and fails when a file cannot be read. Its pre-commit
    obfuscation check now reads the staged content, renamed files included,
    rather than the working tree. In CI, a missing lockfile-lint is skipped with
    a message rather than reported as a broken lockfile, and more than one
    `lockfileAllowedHosts` entry now works.
  - terse: `terse` finds new violations when run from a subdirectory, and
    `terse-watch` reports from a linked worktree or submodule.
  - dead-code: `dead-code branch` run from a pre-commit hook no longer rewrites
    the index being committed or fails on every commit.

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

## 0.3.1

### Patch Changes

- fe013e8: Fix `jsdoc-tag-coverage` reading past the end of a function. When a
  function's body opened on the same line as its signature, the scanner lost
  track of where the body started. It then blamed the function for any `throw`
  or `return` later in the file, even one outside every function. Arrow
  functions had the opposite problem: a block body was read as a one-line
  expression. So an arrow that threw went unflagged, and one that returned
  nothing was asked for a `@returns`.

## 0.3.0

### Minor Changes

- 74ce769: Add `terse scan`, which checks every line of a repository, a folder
  or a list of files against your config, not just the lines a branch adds.
  Findings are grouped by file and counted per rule, and `--rule` narrows the
  report to the rules you name. It exits 1 on any finding, so a clean repository
  can run it as a test.

  Running `src/scanner.mjs` directly no longer scans anything; use `terse scan`
  instead. Bare `terse` still runs the branch check, unchanged.

## 0.2.0

### Minor Changes

- a3a2bc0: Add a `sectionBanners` setting, so a repository can welcome inline
  banners instead of only permitting them past a line count. Set it to `always`
  and a banner is never a finding, and the generated contract gains a section on
  what a banner should separate. `off` bans them outright; the default
  `large-files` keeps today's `bannerMinCode` threshold.
- 023a796: Rule 2 now covers unexported functions, and a new rule 20 checks that
  a JSDoc block says something.

  `jsdocScope` defaults to `"all"`, so a top-level function the file keeps to
  itself needs JSDoc as well as everything it exports. Plain values, classes,
  types and interfaces still need it only when exported. Set `jsdocScope` to
  `"exported"` for the old behaviour. `jsdocScopeExclude` defaults to `.test.`
  and `.spec.`, where the `describe` and `it` names are the documentation and
  only exports are covered.

  Rule 20, `jsdoc-tag-coverage`, reads what is inside the block: a `@param` for
  every parameter, a `@returns` when the function returns a value, a `@throws`
  when it throws, and a finding for a `@param` naming a parameter the signature
  no longer has. It requires only the tags `allowedTags` permits.

  Both are on by default, so an existing repository will see new findings the
  next time `terse` runs. The CI check still fails only on violations a branch
  adds, so the backlog is reported rather than blocking. `terse-docs --check`
  will fail until you re-run `terse-docs` and commit the result.

## 0.1.0

### Minor Changes

- b2a712d: First release. Extracted from the Curricular repository, with every
  repo-specific value moved into a `.devkit/` config file.
- 758680b: Generate the written contract from the config. A new `terse-docs`
  command assembles one prose chunk per rule, including only the rules a
  repository switches on and writing its caps into the prose. `--check` fails
  when the document drifts from the config. Five prose-only rules join the
  registry so the contract can carry them.
- 9aa415d: Name every rule, report the name in findings, and let a repo switch
  rules off individually. A new `terse-init` command writes a complete config
  with every rule and cap spelled out.
- edfd164: Catch comments written by any route. A new `terse-watch` PostToolUse
  hook compares the working tree against the last commit, so a file written with
  a Bash heredoc, `sed -i` or a script no longer bypasses the contract. It
  reports each violation once per session.

### Patch Changes

- 615d781: Raise the Node floor to 22.11, which is what changesets v3 supports.
- e79c748: Generate the contract's scope section from the config, so the
  document names the extensions it covers and the paths it skips.
- bf0f746: Tell the user, not only the agent. `terse-watch` now returns a
  one-line `systemMessage` alongside the findings it hands the agent, so the
  terminal shows that it fired.
- Updated dependencies [615d781]
- Updated dependencies [b2a712d]
  - @euanmsm/devkit-core@0.1.0
