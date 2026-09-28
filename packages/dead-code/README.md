# @euanmsm/dead-code

Finds dead code with [knip](https://knip.dev), keeps the false positives you
have decided to live with apart from the real findings, and can report only what
a branch newly left dead.

Knip is a dependency of this package, so the repository does not install it
separately. Your own `knip.json` or `knip.jsonc` is picked up as usual.

## Installing

```sh
npm i -D @euanmsm/dead-code
npx --no-install dead-code init
```

`init` writes a starter `.devkit/dead-code.json`. Replace its example entries
with your own.

## Using it

```sh
npx --no-install dead-code                     # the whole repo
npx --no-install dead-code src/features        # only findings under these paths
npx --no-install dead-code branch              # only what this branch left dead
npx --no-install dead-code branch origin/dev   # against another base
npx --no-install dead-code why src/lib/date.ts formatDate
```

| Command                         | What it does                                                                                                                                                   |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dead-code [paths…]`            | One knip run over the configured workspaces. Paths are files or folders, relative to the current folder, and keep only the findings inside them.               |
| `dead-code branch [base]`       | Only findings the branch introduced. The base defaults to `origin/main`. Compares the fork point with the working tree, so uncommitted changes count.          |
| `dead-code why <file> [export]` | Knip's trace for a file, or for one export in it. The path is relative to the current folder. A file nothing imports is explained as "Nothing reaches <file>". |
| `dead-code init [--force]`      | Writes `.devkit/dead-code.json` from the example.                                                                                                              |

Options:

- `--json` prints the report as JSON (below).
- `--include <types>` replaces the configured knip issue types, comma-separated.
- `--workspace <ws>` replaces the configured workspaces. Repeat it for more.

Exit codes:

- `0` when there is nothing beyond the known false positives
- `1` when there are findings
- `2` for a usage error, a config that does not validate, or knip failing

A known false positive never fails the run.

A path named `branch`, `why` or `init` needs a `./` in front of it.

## Branch mode

`dead-code branch` finds the fork point with `git merge-base <base> HEAD`, then
runs knip twice, at the same time:

1. at the fork point, in a temporary `git worktree` under the system temp
   folder, with every installed `node_modules` (the root's and each workspace's)
   symlinked in so plugins and configs load;
2. on the working tree.

A finding is reported when the working tree has it and the fork point did not.
Findings match on type, file and name. Line numbers are ignored, because
unrelated edits move them. A file the branch renamed carries its old findings
across, using `git diff --find-renames=20%`. An untracked file is not seen as a
rename. Known false positives are applied after the subtraction.

So an export left dead in a file the branch never touched is reported, and debt
that was already there is not. The temporary worktree is removed afterwards,
even when knip fails.

## Config

`.devkit/dead-code.json`. Every key is optional.

```json
{
  "workspaces": ["apps/main"],
  "include": ["files", "exports", "types"],
  "known": [
    {
      "path": "^apps/main/src/components/primitives/",
      "reason": "shadcn primitives, kept whole so `shadcn add` does not fight them"
    },
    {
      "path": "rooms/_queries",
      "names": ["useStudentRoomResourcesQuery"],
      "reason": "kept for the student rooms rework"
    }
  ]
}
```

| Key              | Default                         | Meaning                                                            |
| ---------------- | ------------------------------- | ------------------------------------------------------------------ |
| `workspaces`     | `[]`, every workspace           | One knip `--workspace` each                                        |
| `include`        | `["files", "exports", "types"]` | Knip's issue types                                                 |
| `known[].path`   | required                        | A regex string matched against the repo-root path of each finding  |
| `known[].names`  | every name                      | Limits the entry to these names, exactly as the report prints them |
| `known[].reason` | required                        | Why it is kept. A keeper only counts if it is written down         |

Keys starting with `_` are notes and are ignored. Any other unknown key, a regex
that does not compile, or a missing reason is an error naming the key.

A known entry that matched nothing in a whole-repo run is listed as stale, so
the list cannot rot silently. It does not fail the run. Stale entries are only
worked out when nothing narrows the run: no paths, no `branch`, no `--include`
and no `--workspace`.

## Output

```
src/lib.ts:5  [unused-export]  unused
src/lib.ts:9  [unused-type]  Unused

src/orphan.ts  [unused-file]

By type
  unused-export  1
  unused-file    1
  unused-type    1

Known, not counted (12)
  shadcn primitives, kept whole so `shadcn add` does not fight them  12

Stale known entries (1), matching nothing
  ^apps/main/src/old/  deprecated tree

Configuration hints (1)
  src/index.ts  knip.json  Remove the redundant entry pattern

3 findings in 2 files. 12 known, not counted.
```

### JSON

`--json` prints one object:

```json
{
  "findings": [
    { "type": "export", "file": "src/lib.ts", "name": "unused", "line": 5 }
  ],
  "known": [
    {
      "type": "file",
      "file": "src/components/ui/button.tsx",
      "name": "src/components/ui/button.tsx",
      "line": null,
      "reason": "shadcn primitives"
    }
  ],
  "stale": [{ "path": "^src/old/", "reason": "deprecated tree" }],
  "hints": [
    {
      "type": "entry-redundant",
      "identifier": "src/index.ts",
      "workspace": ".",
      "file": "knip.json",
      "message": "Remove the redundant entry pattern"
    }
  ],
  "mode": "branch",
  "base": "origin/main"
}
```

- `findings`: what fails the run. Each is `{ type, file, name, line }`, sorted
  by file and line.
- `type` is `file`, `export`, `type`, `enumMember`, `duplicate` or `dependency`.
  Any other knip issue type asked for with `--include` keeps knip's own name,
  such as `unlisted`.
- `file` is relative to the repository root. `line` is null for a whole file or
  a dependency without a line.
- `name` is the export's name, the file's path for a `file`, `Enum.Member` for
  an enum member, and every name joined with `, ` for a duplicate.
- `known`: the same shape plus the `reason` of the entry that matched.
- `stale`: known entries that matched nothing, `{ path, names?, reason }`.
- `hints`: knip's configuration hints,
  `{ type, identifier, workspace, file, message }`.
- `mode`: `repo`, `paths` or `branch`. `base` is present only in `branch` mode,
  and is the base as given.
