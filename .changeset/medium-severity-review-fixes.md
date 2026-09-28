---
'@euanmsm/vouch': patch
'@euanmsm/preflight': patch
'@euanmsm/shellgate': patch
'@euanmsm/secure': patch
'@euanmsm/terse': patch
'@euanmsm/dead-code': patch
'@euanmsm/wt': patch
'@euanmsm/skills': patch
---

Fix the medium-severity findings from the deep review.

- vouch: runs without a `.git` (Docker builds, tarballs), finds packages in
  `node_modules` from the cwd up to the git root, says when an allowlisted
  package is not installed, and can start npm on Windows.
- preflight: a file in a nested checkout or worktree follows that checkout's own
  map, or the nearest enclosing one when it has none.
- shellgate: blocks writes hidden behind a fake heredoc, a quoted path with a
  space, a `cd` inside a subshell, an interpreter behind `env` or a path, Bun
  and Deno write calls, and scripts that name an unrelated absolute path.
- secure: pre-commit semgrep and lockfile-lint read the staged content, renamed
  and non-ASCII files included; the `.gitignore` check fails when a required
  pattern is negated; `Function(` and similar patterns no longer match
  identifiers that merely end in them.
- terse: catches lines added inside an over-long comment block, checks one-line
  `/** */` comments, stops reading template literals as comments, accepts
  decorated and directive-led declarations, handles non-ASCII paths and CRLF
  edits, and `terse-watch` no longer drops a second identical violation.
- dead-code: branch mode no longer reports old debt as new when the branch moves
  a project folder, or when `files` is left out of `include`.
- wt: `wt supabase` rebuilds a missing worktree override instead of using the
  main stack, linked worktrees read the main checkout's `wt.local.json`,
  concurrent creates get distinct slots, `wt -d` removes a worktree whose folder
  is gone, editors and multiplexers are never killed, the Supabase guard reads
  ports and env files correctly, and an unreadable folder no longer aborts
  create.
- skills: code-review, clean-comments and clean-commit-history use
  `origin/<base>` when it is ahead of the local base, the code-review skill
  passes absolute paths and works under zsh, duplicate bundle keys are refused,
  target paths are normalised, large file lists no longer hit E2BIG, the PR
  prepass lists moved files and reads non-ASCII paths, ignores the user's diff
  settings and survives unreadable paths, and CRLF checkouts count as in step.
