---
'@euanmsm/skills': minor
---

Adds the `review-page` skill: one HTML page for reviewing a branch. It opens
with what the branch does, then walks the changed files in reading order, each
file's real diff beside notes on its context, what changed and what every hunk
does. A file tree shows the changed files among their neighbours, and when the
branch changes what users see, the page ends with walkthroughs for checking it
by hand.

The agent writes only the notes, as JSON. `skills review-page prepare` writes
the brief it plans from, and `skills review-page build` checks the notes against
the diff — every file placed once, one note per hunk, every cited line in the
diff — and only writes the page when they pass. Set `outputDir` to change where
pages are built and `editor` to pick VS Code or Cursor for file links.
