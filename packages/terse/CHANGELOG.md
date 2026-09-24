# @euanmsm/terse

## 0.2.0

### Minor Changes

- a3a2bc0: Add a `sectionBanners` setting, so a repository can welcome inline
  banners instead of only permitting them past a line count. Set it to `always`
  and a banner is never a finding, and the generated contract gains a section on
  what a banner should separate. `off` bans them outright; the default
  `large-files` keeps today's `bannerMinCode` threshold.
- 023a796: Rule 2 now covers unexported functions, and a new rule 20 checks that
  a JSDoc block says something.

  `jsdocScope` defaults to `"all"`, so a top-level function the file keeps to
  itself needs JSDoc as well as everything it exports. Plain values, classes,
  types and interfaces still need it only when exported. Set `jsdocScope` to
  `"exported"` for the old behaviour. `jsdocScopeExclude` defaults to `.test.`
  and `.spec.`, where the `describe` and `it` names are the documentation and
  only exports are covered.

  Rule 20, `jsdoc-tag-coverage`, reads what is inside the block: a `@param` for
  every parameter, a `@returns` when the function returns a value, a `@throws`
  when it throws, and a finding for a `@param` naming a parameter the signature
  no longer has. It requires only the tags `allowedTags` permits.

  Both are on by default, so an existing repository will see new findings the
  next time `terse` runs. The CI check still fails only on violations a branch
  adds, so the backlog is reported rather than blocking. `terse-docs --check`
  will fail until you re-run `terse-docs` and commit the result.

## 0.1.0

### Minor Changes

- b2a712d: First release. Extracted from the Curricular repository, with every
  repo-specific value moved into a `.devkit/` config file.
- 758680b: Generate the written contract from the config. A new `terse-docs`
  command assembles one prose chunk per rule, including only the rules a
  repository switches on and writing its caps into the prose. `--check` fails
  when the document drifts from the config. Five prose-only rules join the
  registry so the contract can carry them.
- 9aa415d: Name every rule, report the name in findings, and let a repo switch
  rules off individually. A new `terse-init` command writes a complete config
  with every rule and cap spelled out.
- edfd164: Catch comments written by any route. A new `terse-watch` PostToolUse
  hook compares the working tree against the last commit, so a file written with
  a Bash heredoc, `sed -i` or a script no longer bypasses the contract. It
  reports each violation once per session.

### Patch Changes

- 615d781: Raise the Node floor to 22.11, which is what changesets v3 supports.
- e79c748: Generate the contract's scope section from the config, so the
  document names the extensions it covers and the paths it skips.
- bf0f746: Tell the user, not only the agent. `terse-watch` now returns a
  one-line `systemMessage` alongside the findings it hands the agent, so the
  terminal shows that it fired.
- Updated dependencies [615d781]
- Updated dependencies [b2a712d]
  - @euanmsm/devkit-core@0.1.0
