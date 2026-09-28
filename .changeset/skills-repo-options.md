---
'@euanmsm/skills': minor
---

Fixes and options so a repository can adopt every skill without a fork.

- `clean-comments`: each `comments-specialist` now loads its own skills with the
  `Skill` tool, so a preflight gate that checks each agent no longer blocks its
  edits. New `typecheckPaths` option.
- `code-review`: new `dedupe` (`by: 'lens' | 'location'`, `lines`) and
  `verdicts` (`'all-refute' | 'any-refutes'`) config keys, and four more
  coverage prompt slots. The generated workflow passes `@euanmsm/terse`.
- `pr`: new `name` option. Stories are found by import as well as by name
  (`storyMatch`). The QA gate trusts a checklist whose author can push, instead
  of reading `author_association`, which hid private organisation members. A
  failed `gh stack` lookup now stops the prepass instead of falling back to the
  base branch, and publish no longer changes an open PR's base unless given
  `--set-base`. `qaGate` takes
  `{ nodeVersion | nodeVersionFile, install: 'npx' | 'lockfile' }`. A stale
  checklist with no boxes now fails the gate rather than passing; re-run the
  skill on such PRs.
- `dead-code`: new `typecheck` option.
- New shared `format: 'prettier'` setting, which formats generated files with
  the repository's Prettier so `check` stays stable.
- `code-review`: the skill's default `name` is now `review`, so it runs as
  `/review` and is written to `<skillsDir>/review/`. Set `"name": "code-review"`
  to keep the old command. The `skills.json` key stays `code-review`.
