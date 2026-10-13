---
'@euanmsm/skills': minor
---

`/pr` now posts a collapsed Manual QA checklist. With every toggle closed, the
boxes fit one browser window, so ticking them no longer means scrolling past
every step's instructions. The steps, their checks and what the gate enforces
are unchanged; only the layout is new.

Each section is now three parts:

- a bold section line naming who runs it and roughly how long it takes, such as
  `**Backend** · agent · about 7 min`, in place of the `---` rule, the heading
  and the timing line;
- one line per box, with `[blocking]` dropped and `· if-time` kept;
- one "How to run" toggle, holding the section's setup, teardown and Covered by
  line, then each step's instructions in a toggle of its own.

The boot block and triage line, the gaps and the Local CI notes are toggles too.
Drafters and checkers now keep step titles to 70 characters, so a list line
never wraps, and send back any step whose body holds a `<details>` or
`<summary>` tag. The list is capped at 20 steps whatever the `budget` allows,
cutting if-time steps first.

`publish` splits a long checklist only between sections or step toggles, and
every comment opens and closes each toggle it holds.

The gate reads a step as its list line plus its toggle. On a push it also strips
the ` · ❌ failed` that `manual-qa` appends to a failed step's line, keeps the
latest note in each step's toggle and in the Local CI notes, and names a stale
step by its list line. Its banner is now one visible line, with the counts and
the stale steps in a toggle. A checklist from before this layout, still open on
a PR, resets and counts as before, and `/pr` rewrites it in the new layout the
next time it runs.

To pick this up in a repository, update its `manual-qa` skill to tick on the
list line, paste observations at the end of the step's toggle, append
` · ❌ failed` to a failed step's line, and never move a `<details>`,
`<summary>` or `</details>` tag.
