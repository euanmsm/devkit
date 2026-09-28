# @euanmsm/devkit-core

## 0.1.1

### Patch Changes

- b89d81c: Patch the low-severity findings from the deep review.

  - core: `loadConfig` reads a file saved with a byte order mark, and a lone
    string pattern counts as one pattern.
  - vouch: a malformed allowlist names the config instead of crashing.
  - preflight: a skill loaded with a slash command counts as loaded, and path
    rules match on Windows.
  - shellgate: blocks `>&` redirects, BSD `sed -I`, `ruby -i` and more `perl -i`
    and `gawk` forms, and stops blocking read-only `git apply` flags, quoted
    `tee`, `\EOF` heredocs and `>` inside `(( ))`.
  - secure: config files in gitignored folders are skipped, `.gitignore` lines
    with CRLF or trailing spaces match, and the launcher reports errors in one
    line.
  - terse: TypeScript overloads share their JSDoc, one-line bodies are held to
    tag coverage, a logic comment at the end of a file is checked, git colour
    settings no longer hide changes, and `terse-watch` stays quiet on a bad
    config.
  - dead-code: branch mode no longer crashes when a workspace was a plain folder
    at the fork point, and only a real generated-file marker hides findings.
  - wt: refuses a locked worktree or an out-of-range port up front, validates
    `supabase.link` entries, and reads env files as dotenv does.
  - skills: `skills help` exits 0, a config module with no default export is an
    error, sync handles `agentsDir` and `rulesDir` naming one folder, reused
    finding ids no longer overwrite each other's verdicts, the import graph
    survives unreadable files and `$` in names, and the PR gate catches a
    missing continuation comment and a reset racing a re-publish.

## 0.1.0

### Minor Changes

- b2a712d: First release. Extracted from the Curricular repository, with every
  repo-specific value moved into a `.devkit/` config file.

### Patch Changes

- 615d781: Raise the Node floor to 22.11, which is what changesets v3 supports.
