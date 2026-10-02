---
'@euanmsm/skills': minor
---

pr: draft steps right the first time, and verify them faster. Drafters now get
the verified boot block and read the traps file, so a step no longer guesses at
variables the boot block never defines. The boot block is verified before
drafting starts. Human sections are drafted in groups of up to 8 entries, like
the backend. "Covered by test" claims are checked by the same checker as their
group's steps instead of one agent each. Re-checks after the first round always
run on Sonnet, and the `narrowRounds` experiment is gone; a config that still
sets it now fails sync. A run where 3 or more steps failed returns
`trapCandidates`, the repeated mistakes worth adding to the traps file, and the
skill offers to add them.

The published checklist no longer ends with a "Not covered by these checks"
list; it holds only steps. Gaps stay in the workflow result, and the skill still
names each unresolved unit when it reports.
