---
'@euanmsm/skills': minor
---

Add the `pr` skill: opens the pull request with a summary and a Manual QA
checklist whose every step is verified against the code, configured per
repository in `.devkit/pr.mjs`. Adds `skills pr prepass|publish`, and
`skills qa-gate reset|status` with an optional GitHub workflow that un-ticks the
checklist on every push.
