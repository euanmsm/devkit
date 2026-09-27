# @euanmsm/skills

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
