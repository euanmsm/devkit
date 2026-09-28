# @euanmsm/shellgate

## 0.1.1

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

## 0.1.0

### Minor Changes

- 5f14ad0: Add shellgate, a Claude Code hook that blocks Bash commands which
  edit repository files
