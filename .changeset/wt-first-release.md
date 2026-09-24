---
'@euanmsm/wt': minor
---

First release. Creates git worktrees in one folder beside the main checkout,
named separately from their branch, each with its own ports, copied env files
and an optional isolated local Supabase stack, all set from `.devkit/wt.json`.
Can add each worktree to a saved VS Code workspace instead of opening a new
window.
