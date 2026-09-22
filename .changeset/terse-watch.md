---
'@euanmsm/terse': minor
---

Catch comments written by any route. A new `terse-watch` PostToolUse hook
compares the working tree against the last commit, so a file written with a Bash
heredoc, `sed -i` or a script no longer bypasses the contract. It reports each
violation once per session.
