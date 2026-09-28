# @euanmsm/dead-code

Finds dead code with [knip](https://knip.dev), keeps the false positives you
have decided to live with apart from the real findings, and can report only what
a branch newly left dead.

Knip is a dependency of this package, so the repository does not install it
separately. Your own `knip.json` or `knip.jsonc` is picked up as usual.

## Installing

Needs Node 22.12 or later, as knip does.

```sh
npm i -D @euanmsm/dead-code
npx --no-install dead-code init
```

`init` writes a starter `.devkit/dead-code.json`. Replace its example entries
with your own.

## Using it

```sh
npx --no-install dead-code                     # the whole project
npx --no-install dead-code src/features        # only findings under these paths
npx --no-install dead-code branch              # only what this branch left dead
npx --no-install dead-code branch origin/dev   # against another base
npx --no-install dead-code why src/lib/date.ts formatDate
```

| Command                         | What it does                                                                                                                                                      |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dead-code [paths…]`            | One knip run over the configured workspaces. Paths are files or folders, and keep only the findings inside them. A path holding the whole project is a whole run. |
| `dead-code branch [base]`       | Only findings the branch introduced. Compares the fork point with the working tree, so uncommitted changes count. The default base is below.                      |
| `dead-code why <file> [export]` | Knip's trace for a file, or for one export in it. A file knip analyses but nothing imports is explained as "Nothing reaches <file>". A folder is a usage error.   |
| `dead-code init [--force]`      | Writes `.devkit/dead-code.json` from the example.                                                                                                                 |

### Paths

Every path printed, in text and JSON, is relative to the git root. Known entries
match those same paths.

A path you type is tried against the current folder first, then against the git
root, so a path copied out of a report works from any folder. Symlinks are
followed, and on a filesystem that ignores case the path is read in the case the
file is stored in. A named path outside the project folder (below) has no
findings, and says so in `warnings`.

The one exception is the trace `why` prints, which is knip's own, with paths
from the project folder.

### Options

- `--json` prints the report as JSON (below).
- `--include <types>` replaces the configured knip issue types, comma-separated.
  An empty list or a name knip does not know is a usage error.
- `--workspace <ws>` replaces the configured workspaces. Repeat it for more. A
  value naming a folder from the current folder, such as `.` inside a package,
  is that folder. Anything else goes to knip as it is: a folder from the project
  folder, a package name, or a glob. `why` only uses the workspaces given here,
  never the configured ones.

### Exit codes

- `0` when there is nothing beyond the known false positives
- `1` when there are findings
- `2` for a usage error, a config that does not validate, knip failing to run,
  or knip reporting errors (such as a plugin config that would not load, which
  leaves the findings unreliable). `why` also exits 2 when the export it was
  given is not in the file.

A known false positive never fails the run. `why` otherwise exits 0, whatever
the trace shows.

A path named `branch`, `why`, `init` or `help` needs a `./` in front of it, or a
`--` before it: every argument after `--` is a path. A word that is neither a
command nor a path, but close to a command, is reported with the command it
probably meant.

## The project folder

Knip runs in the folder holding the project's package.json. By default that is
the outermost folder with a package.json on the way from the current folder up
to the git root: in a monorepo, the monorepo's root, even when run inside one of
its packages; in a repository whose JavaScript lives in `web/`, `web/`, when run
from inside `web/`.

Run from anywhere else, such as the git root of that repository, dead-code stops
and asks for `directory` in `.devkit/dead-code.json`, the project folder
relative to the git root. With it set, every command works from any folder.

`workspaces` and knip's own config are read from the project folder. The
`.devkit/dead-code.json` config itself always lives at the git root.

## Branch mode

Without a base, `dead-code branch` compares with the first of these that exists:
the branch `origin/HEAD` points at, `origin/main`, `origin/master`, `main`,
`master`. The report's `base` names the one used.

It finds the fork point with `git merge-base <base> HEAD`, then runs knip twice,
at the same time:

1. at the fork point, in a temporary `git worktree` under the system temp
   folder;
2. on the working tree.

A finding is reported when the working tree has it and the fork point did not.
Findings match on type, file and name. Line numbers are ignored, because
unrelated edits move them. Known false positives are applied after the
subtraction.

- A file the branch renamed carries its old findings across. Renames come from
  `git diff -z --find-renames=20% -l0` between the fork point and the working
  tree, so a move not yet staged counts too, however many files moved.
  (Untracked files are marked intent-to-add in a throwaway copy of the index for
  this; your index is not touched.)
- A dead export that left a file the branch deleted or renamed, and turns up
  under the same name and type in a file the branch added or renamed, has moved.
  This catches moves git does not pair, such as near-identical files or a file
  rewritten around the export.
- A file that was wholly unused at the fork point already held all its dead
  exports, so importing one of them does not make the rest new.
- A workspace the branch added is left out at the fork point, and a project the
  branch created has no findings there: everything in them is new.
- When HEAD is the fork point and nothing has changed, the fork point is not
  checked out at all.

So an export left dead in a file the branch never touched is reported, and debt
that was already there is not.

### The temporary worktree

- It is checked out with hooks switched off and without smudge filters, so
  git-lfs neither downloads nor fails on files knip never reads.
- Submodules are filled in at the commits the fork point records, from their
  checkouts in the repository. One that cannot be is named in `warnings`, and
  findings under it are left out.
- It gets its own `node_modules`, built one link per installed package, so
  plugins and configs load. Workspace packages are pointed at the worktree's own
  copies, found by name from the fork point's package.json files (the project's
  `workspaces` and `pnpm-workspace.yaml`), so the fork point is never analysed
  with today's code. Scoped packages and each package's own `node_modules`, as
  pnpm lays them out, are handled the same way. On Windows the links are
  junctions, which need no special rights.
- It is removed afterwards, even when knip fails or the run is stopped with
  Ctrl-C or SIGTERM. Only this worktree is removed: `git worktree prune` never
  runs. A worktree left by a run that was killed outright is removed by the next
  run.

### In CI

The fork point has to be in the clone. A shallow clone, the default in GitHub
Actions, holds too little history, and dead-code says so. Use `fetch-depth: 0`
on `actions/checkout`, or run `git fetch --unshallow`.

## Config

`.devkit/dead-code.json`. Every key is optional.

```json
{
  "directory": "web",
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

| Key              | Default                         | Meaning                                                                          |
| ---------------- | ------------------------------- | -------------------------------------------------------------------------------- |
| `directory`      | found from the current folder   | The project folder knip runs in, relative to the git root (see above)            |
| `workspaces`     | `[]`, every workspace           | One knip `--workspace` each: a folder from the project folder, or a package name |
| `include`        | `["files", "exports", "types"]` | Knip's issue types                                                               |
| `known[].path`   | required                        | A regex string matched against the git-root path of each finding                 |
| `known[].names`  | every name                      | Limits the entry to these names, exactly as the report prints them               |
| `known[].reason` | required                        | Why it is kept. A keeper only counts if it is written down                       |

Keys starting with `_` are notes and are ignored. Any other unknown key, a regex
that does not compile, an empty `include` or `names`, a name in `include` that
is not a knip issue type, or a missing reason is an error naming the key.

A finding covered by several known entries takes the first one's reason.

A file whose head says `Generated by @euanmsm/skills`, such as a skill's
`.workflow.js`, is loaded by a tool by its path, so knip never sees it imported.
Its findings are known without an entry, with that as the reason, and never make
an entry stale.

A known entry that matched nothing in a whole-repo run is listed as stale, so
the list cannot rot silently. So is a name in `names` that matched nothing,
listed on its own. An entry that matches only findings an earlier entry already
covers is not stale. Stale entries do not fail the run. They are only worked out
when nothing narrows the run: no paths, no `branch`, no `--include`, no
`--workspace`, and no knip errors.

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

Unresolved imports (1), not counted
  src/index.ts:3  @/utils/date

Configuration hints (1)
  src/index.ts  knip.json  Remove the redundant entry pattern

Warnings
  1 import could not be resolved, so the files they point to may be reported unused when they are not. Fix the path alias, or install the missing package.

3 findings in 2 files. 12 known, not counted.
```

When knip reports errors, a `Knip reported errors` section comes first, the
summary says the result cannot be trusted, and the run exits 2.

Imports knip cannot resolve are always looked for. A broken path alias makes the
files behind it look unused, so they are listed apart as a warning rather than
counted, unless `--include` or `include` names `unresolved`. When most files
come back unused, knip's "unconfigured" hint is shown, with a warning.

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
  "unresolved": [],
  "errors": [],
  "warnings": [],
  "mode": "branch",
  "directory": ".",
  "base": "origin/main",
  "fork": "3e79cdd8b0e7c9d4d5b0f2a3c1e4f6a7b8c9d0e1"
}
```

- `findings`: what fails the run. Each is `{ type, file, name, line }`, sorted
  by file and line.
- `type` is `file`, `export`, `type`, `enumMember`, `namespaceMember`,
  `duplicate` or `dependency`. Any other knip issue type asked for with
  `--include` keeps knip's own name, such as `unlisted`.
- `file` is relative to the git root. `line` is null for a whole file or a
  dependency without a line.
- `name` is the export's name, the file's path for a `file`, `Enum.Member` or
  `Namespace.member` for a member, and every name joined with `, ` for a
  duplicate.
- `known`: the same shape plus the `reason` of the entry that matched.
- `stale`: known entries that matched nothing, `{ path, names?, reason }`. For
  an entry with some names matched, `names` holds only the unmatched ones.
- `hints`: knip's configuration hints,
  `{ type, identifier, workspace, file, message }`, `file` from the git root.
- `unresolved`: imports knip could not resolve, in the findings' shape, `name`
  being the import specifier. Not counted.
- `errors`: what knip printed when it ran but failed part of the way. Any entry
  means exit 2. In branch mode, fork-point errors start with
  `At the fork point`.
- `warnings`: sentences on why the findings may be off, such as unresolved
  imports or an unconfigured knip.
- `mode`: `repo`, `paths` or `branch`. `directory` is the project folder from
  the git root, `.` for the root. `base` and `fork` (the fork point's full hash)
  are present only in `branch` mode; `base` is the base given, or the default
  picked.
