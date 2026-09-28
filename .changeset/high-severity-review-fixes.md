---
'@euanmsm/vouch': patch
'@euanmsm/secure': patch
'@euanmsm/terse': patch
'@euanmsm/dead-code': patch
---

Fix the high-severity findings from the deep review.

- vouch: the README no longer says to run vouch from your own `postinstall`,
  which `ignore-scripts` skips. Run it as its own step instead.
- secure: `secure-config` no longer passes when a config or staged file path
  holds a space or quote, and fails when a file cannot be read. Its pre-commit
  obfuscation check now reads the staged content, renamed files included, rather
  than the working tree. In CI, a missing lockfile-lint is skipped with a
  message rather than reported as a broken lockfile, and more than one
  `lockfileAllowedHosts` entry now works.
- terse: `terse` finds new violations when run from a subdirectory, and
  `terse-watch` reports from a linked worktree or submodule.
- dead-code: `dead-code branch` run from a pre-commit hook no longer rewrites
  the index being committed or fails on every commit.
