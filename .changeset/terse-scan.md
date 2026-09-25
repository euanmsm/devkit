---
'@euanmsm/terse': minor
---

Add `terse scan`, which checks every line of a repository, a folder or a list of
files against your config, not just the lines a branch adds. Findings are
grouped by file and counted per rule, and `--rule` narrows the report to the
rules you name. It exits 1 on any finding, so a clean repository can run it as a
test.

Running `src/scanner.mjs` directly no longer scans anything; use `terse scan`
instead. Bare `terse` still runs the branch check, unchanged.
