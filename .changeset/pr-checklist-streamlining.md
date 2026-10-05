---
'@euanmsm/skills': minor
---

Make `/pr` checklists short enough to finish in under 30 minutes. A triage step
sizes each diff first: a pure move gets one smoke check, and the boot block only
starts what the diff needs. A new prune phase merges and drops inventory
entries, and checkers delete steps that would pass on main or repeat a test.
Each section shares one setup, and every checklist has a step and minutes
budget. Behaviour a test proves is cited on a Covered by line, and a new Deploy
and Config Checks section covers what the diff needs outside the repo. Pipeline
notes move to the author's report.

New PR config keys: `layers[].touches`, conditional `boot.start`, `boot.stop`
and `boot.variables` entries (`{ run | from, when }`), `outsideRepo` and
`budget`.

The QA gate's reset now keeps only the latest Observed note per step, and names
steps that cite a file the push changed.
