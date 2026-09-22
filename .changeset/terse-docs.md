---
'@euanmsm/terse': minor
---

Generate the written contract from the config. A new `terse-docs` command
assembles one prose chunk per rule, including only the rules a repository
switches on and writing its caps into the prose. `--check` fails when the
document drifts from the config. Five prose-only rules join the registry so the
contract can carry them.
