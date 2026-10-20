---
'@euanmsm/skills': minor
---

The review page now takes review comments. Click the `+` beside a line number to
comment on that line, drag it or shift-click another line for a range, or use a
file's **Comment** button for the whole file. Comments are kept in the browser
per branch, beside the read marks, so rebuilding the page keeps them.

A comments sheet (`c`) lists them in reading order and jumps to each one, and
**Export JSON** saves them with GitHub's review comment fields (`path`, `line`,
`side`, `start_line`, `start_side`, `subject_type`), ready to post to the PR.

Large branches are also much faster to hover and type in: files far off screen
are no longer drawn or hit-tested, and the page no longer asks the browser what
is under the mouse on every move.
