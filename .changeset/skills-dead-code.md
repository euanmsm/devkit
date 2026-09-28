---
'@euanmsm/skills': minor
---

Add a `dead-code` skill and run `@euanmsm/dead-code` in the code review's
prepass.

- The prepass has a new built-in `deadCode` check, used when
  `@euanmsm/dead-code` is installed, in place of raw knip. In diff mode it runs
  `dead-code branch --json <base>`, so reviewers see what the branch newly left
  dead in any file, with the known false positives set apart and explained. In
  target mode it runs `dead-code --json <files>`. `prepass.deadCode` switches it
  (`'auto'`, `true`, `false`), and `knip` stays the fallback.
- `skills prepass tools` takes `--base <commit>`, and the code-review skill
  passes the merge base in diff mode. A tool's new `baseCommand` field runs in
  its place, with the base appended, and `errorExitCodes` marks the exit codes
  that mean the tool itself failed.
- The new `dead-code` skill, written from `.devkit/skills.json`, finds, verifies
  and removes dead code through `npx --no-install dead-code`. It stops at a
  preflight when the package is missing, and `skills sync` warns about it. When
  enabled, the code review's `dead-code` lens loads it by default.
