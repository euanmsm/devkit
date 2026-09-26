---
'@euanmsm/skills': minor
---

Add the `code-review` skill: a deep multi-agent review whose workflow script is
generated from `.devkit/code-review.mjs`, with built-in lenses, bundles and
prompt wording a repository overrides only where it differs. Adds
`skills prepass`, which the skill runs for its background typecheck, lint and
import graph, plus a terse comment check and a knip dead-code check over the
files under review whenever the repository has those tools installed. Adds a
shared `rulesDir` setting.
