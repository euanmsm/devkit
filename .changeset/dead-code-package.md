---
'@euanmsm/dead-code': minor
---

Add `@euanmsm/dead-code`: runs knip over the repo, named paths, or only what a
branch newly left dead (`dead-code branch`), sets the known false positives in
`.devkit/dead-code.json` apart with their reasons, and explains a trace with
`dead-code why`. Arguments after `--` are always paths, and files
`@euanmsm/skills` generated are listed as known rather than unused.
