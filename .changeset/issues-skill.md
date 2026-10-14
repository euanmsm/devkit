---
'@euanmsm/skills': minor
---

Adds the `issues` skill: how Claude writes, links and plans issues on Linear,
GitHub or both. It covers two-to-four-word titles, a leaf template for issues
that become one PR and a parent template for groups of them, a plain writing
style that names real code in backticks and shows shapes with short snippets,
architecture documents on parent issues, and a status lifecycle where every
issue Claude creates starts in Backlog and is never closed by it.

The writing rules are shared. The mechanics are written per tracker: the Linear
MCP's fields and documents, or `gh` and the GitHub API for sub-issues,
blocked-by relations and project status. Set `trackers` to leave out the one a
repository does not use, `layerOrder` to change how features split into leaves,
and `testingRules` to point at the repository's testing conventions.
