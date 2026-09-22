# @euanmsm/terse

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
