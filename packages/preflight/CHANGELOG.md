# @euanmsm/preflight

## 0.2.0

### Minor Changes

- ef61a5e: Gate any tool call by name with a `tools` block in
  `.devkit/preflight.json`, so calls that write no file, such as Linear MCP
  saves, can require a skill too.

## 0.1.0

### Minor Changes

- b2a712d: First release. Extracted from the Curricular repository, with every
  repo-specific value moved into a `.devkit/` config file.

### Patch Changes

- 615d781: Raise the Node floor to 22.11, which is what changesets v3 supports.
- Updated dependencies [615d781]
- Updated dependencies [b2a712d]
  - @euanmsm/devkit-core@0.1.0
