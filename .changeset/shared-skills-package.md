---
'@euanmsm/skills': minor
---

Add `@euanmsm/skills`, which writes shared Claude Code skills into a repository
from `.devkit/skills.json`. Ships `clean-commit-history` and `clean-comments`
(with its `comments-specialist` agent), plus `skills check` to fail CI when the
generated files drift from the config.
