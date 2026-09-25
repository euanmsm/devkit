---
'@euanmsm/terse': patch
---

Fix `jsdoc-tag-coverage` reading past the end of a function. When a function's
body opened on the same line as its signature, the scanner lost track of where
the body started. It then blamed the function for any `throw` or `return` later
in the file, even one outside every function. Arrow functions had the opposite
problem: a block body was read as a one-line expression. So an arrow that threw
went unflagged, and one that returned nothing was asked for a `@returns`.
