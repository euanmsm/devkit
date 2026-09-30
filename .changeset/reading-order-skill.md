---
'@euanmsm/skills': minor
---

New `reading-order` skill. `/reading-order` reads the branch's diff over the
base and writes `tmp/<branch>/reading-order.tmp.md`: the changed files as an
ordered list of links for a reviewer, with brief notes where they help. Its one
option, `outputDir`, moves the file out of `tmp`.
