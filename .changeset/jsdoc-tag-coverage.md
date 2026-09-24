---
'@euanmsm/terse': minor
---

Rule 2 now covers unexported functions, and a new rule 20 checks that a JSDoc
block says something.

`jsdocScope` defaults to `"all"`, so a top-level function the file keeps to
itself needs JSDoc as well as everything it exports. Plain values, classes,
types and interfaces still need it only when exported. Set `jsdocScope` to
`"exported"` for the old behaviour. `jsdocScopeExclude` defaults to `.test.` and
`.spec.`, where the `describe` and `it` names are the documentation and only
exports are covered.

Rule 20, `jsdoc-tag-coverage`, reads what is inside the block: a `@param` for
every parameter, a `@returns` when the function returns a value, a `@throws`
when it throws, and a finding for a `@param` naming a parameter the signature no
longer has. It requires only the tags `allowedTags` permits.

Both are on by default, so an existing repository will see new findings the next
time `terse` runs. The CI check still fails only on violations a branch adds, so
the backlog is reported rather than blocking. `terse-docs --check` will fail
until you re-run `terse-docs` and commit the result.
