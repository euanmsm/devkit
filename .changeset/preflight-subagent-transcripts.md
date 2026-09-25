---
'@euanmsm/preflight': patch
---

Check a subagent's own transcript for loaded skills. Until now a subagent or
workflow agent was checked against the main session's transcript, so it was
blocked however many skills it loaded itself. Skills the main session loaded no
longer count for its subagents.
