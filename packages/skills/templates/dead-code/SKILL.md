---
name: dead-code
description:
  'MANDATORY: Invoke this skill BEFORE hunting for, reporting, or deleting dead
  code — an unused file, export or type, a barrel entry nobody imports, or code
  a branch just orphaned. Also invoke before running knip or dead-code at all.
  Covers running the dead-code CLI over the repo, a set of paths or a branch,
  reading its report, what knip cannot see, and how a deletion lands. Never call
  code dead without loading this skill first.'
user-invocable: true
---

{{marker}}

# Dead Code

**This skill needs `@euanmsm/dead-code`.** Every command below runs its CLI, a
wrapper around [knip](https://knip.dev) that sets the repository's recorded
false positives apart from the real findings. Check it is installed before
anything else:

```bash
npx --no-install dead-code --help
```

If that fails, **stop** and tell the user to install it:

```bash
npm i -D @euanmsm/dead-code
npx --no-install dead-code init    # writes a starter .devkit/dead-code.json
```

Do not fall back to running knip by hand: the known false positives live in
`.devkit/dead-code.json`, and only the CLI reads them.

```
/dead-code                   # the whole repository
/dead-code <path> [<path>…]  # only findings in these files and folders
/dead-code branch            # only what this branch newly left dead
```

**The report is evidence, not a verdict.** Knip sees `import` statements. It
does not see a file a framework loads by its name, a handler looked up by a
string key at runtime, or an export kept on purpose for work that has not
landed. Every finding gets traced and searched for before it is called dead.

---

## 1. What counts as dead code

**Dead code is code nothing reaches**: a file no entry point pulls in, an export
no other file imports, a type nothing annotates. It costs nothing to run and a
lot to read. It turns up in searches, gets copied as an example, and gets
updated by mistake during a refactor.

| Shape                      | Example                                                |
| -------------------------- | ------------------------------------------------------ |
| Unused file                | A component nothing renders                            |
| Unused export              | A helper exported from a module nothing imports        |
| Unused exported type       | A type or interface nothing annotates                  |
| Stale barrel entry         | An `index.ts` re-exports a symbol nobody outside wants |
| Orphaned by this branch    | The branch deleted the only caller and left the callee |
| Unreachable branch         | A condition that cannot be true, a `default` never hit |
| Unused parameter or import | The linter reports these rather than knip. Same area   |

The first four come from the report. The rest come from reading the code: knip's
graph works at the level of files and exports, so it cannot see inside a
function.

Two questions, answered separately:

| Question                     | Answered by                                          |
| ---------------------------- | ---------------------------------------------------- |
| Is it genuinely unreachable? | The report, then a trace, then a search for the name |
| Should it be deleted?        | Judgement. Some unreachable code is kept on purpose  |

The report only ever answers the first.

## 2. The loop

The same for one file or a whole branch. Skipping steps 4 and 5 is where wrong
findings come from.

1. **Run it once**, as JSON (step 3)
2. **Keep to your targets.** Never report a finding in a file you were not asked
   to look at. `branch` mode is the one exception: an export the branch left
   dead in a file it never touched is still the branch's doing
3. **Leave the known list alone.** Everything under `known` is a recorded false
   positive with its reason. None of it is a finding
4. **Trace, then search.** `dead-code why` names who imports each export; a
   repo-wide search catches the references knip cannot see (step 5)
5. **Judge**: genuinely dead, or kept for a reason that should now be written
   down (step 8)

Only a finding that survives all five is dead code.

## 3. Running it

Knip always analyses the whole workspace: nobody can tell whether a file is
reachable without walking every file that might reach it. Naming paths only
filters the result. A run takes seconds, so re-run after every edit rather than
reusing an old report.

```bash
npx --no-install dead-code --json                           # the whole repository
npx --no-install dead-code --json -- src/features/billing   # only findings under these paths
```

Only what this branch left dead, against `origin/{{baseBranch}}`, or the local
`{{baseBranch}}` when there is no origin copy:

```bash
BASE_REF="origin/{{baseBranch}}"
git rev-parse --verify --quiet "refs/remotes/$BASE_REF" >/dev/null || BASE_REF="{{baseBranch}}"
npx --no-install dead-code branch "$BASE_REF" --json
```

- A path you type is tried against the current folder, then against the
  repository root, so a `file` copied out of a report works from any folder.
  Every path the report prints is from the repository root
- Put `--` before the paths, as above: after it a path named `branch`, `why` or
  `init` is still a path, not a command
- `branch` compares the point where the branch left the base with the working
  tree, so uncommitted and untracked changes count. Debt that was already there
  is not reported, and neither is old debt carried across a rename. When
  neither base exists it exits 2 and says so: fetch the base, or name another
- `--include <types>` swaps the issue types for this run, comma-separated.
  `enumMembers` for a constants module, `duplicates` for a barrel,
  `dependencies` for `package.json`
- `--workspace <ws>` narrows the run to one workspace. Repeat it for more

Exit codes: `0` nothing beyond the known false positives, `1` findings, `2` the
command or the config is wrong, knip could not run, or knip reported errors.
**Exit 1 is the normal case**, not a failure. On exit 2, read what it printed:

- A message on stderr and no report means the command, the base or the config
  is wrong. Fix that and run it again
- A JSON report with entries in `errors` means knip ran but failed part of the
  way, such as a plugin config that would not load. The findings cannot be
  trusted until that is fixed, so report the errors, not the findings

### Reading the report

`--json` prints one object:

| Key          | What it holds                                                                                                                                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `findings`   | `{ type, file, name, line }` each. `type` is `file`, `export`, `type`, `enumMember`, `namespaceMember`, `duplicate` or `dependency`. `file` is repo-root-relative. A member's `name` is `Enum.Member` or `Namespace.member` |
| `known`      | The same shape plus a `reason`: the `.devkit/dead-code.json` entry's, or that the file is generated (step 5). Never a finding                                                                                               |
| `stale`      | Known entries that matched nothing in a whole-repo run. Offer to remove them: the thing they excused has gone                                                                                                               |
| `hints`      | Knip saying its own config has drifted, such as an entry point a plugin now finds by itself. A finding about the config, not the code                                                                                       |
| `unresolved` | Imports knip could not resolve, in the findings' shape with the specifier as `name`. Not counted, but a broken path alias makes the files behind it look unused                                                             |
| `errors`     | What knip failed on part of the way. Any entry means exit 2 and findings that cannot be trusted                                                                                                                             |
| `warnings`   | Sentences on why the findings may be off, such as unresolved imports or an unconfigured knip. Read them before the findings                                                                                                 |
| `mode`       | `repo`, `paths` or `branch`. `directory` is the project folder knip ran in, from the repository root. In `branch` mode, `base` is the base used and `fork` the fork point's commit                                          |

A `file` finding means the whole file is unreachable, so its exports are not
listed again one by one.

### Tracing a finding

```bash
npx --no-install dead-code why src/lib/dates.ts               # who imports each export of the file
npx --no-install dead-code why src/lib/dates.ts formatDate    # one export, through every re-export
```

Pass a finding's `file` as it is, from any folder. "Nothing reaches <file>" is
the answer, not an error: no entry point imports the file, directly or through
other files. `why` takes one file, never a folder, and exits 2 when the export
is not in the file: check the name against the report.

## 4. Barrel entries are not the definition

A module's `index.ts` re-exports its public surface, so an unused export there
means **the module publishes something nobody outside wants**. It says nothing
about use inside the module, which is common.

This is the most common way to get a finding wrong. Trace the export by name:

```bash
npx --no-install dead-code why src/features/billing/index.ts BILLING_LIMIT
```

When the definition has live importers inside the module and only the barrel
line is dead, the fix is one line out of `index.ts`. Deleting the definition
breaks the module. Trimming a barrel narrows the module's contract on purpose,
so say so in the commit.

## 5. What knip cannot see

Knip resolves `import` statements, so these real references are invisible to it
and only a search finds them:

| Shape                                 | Example                                                          |
| ------------------------------------- | ---------------------------------------------------------------- |
| Dynamic import with a computed path   | An `import()` whose path is built from a variable                |
| A registry keyed by string            | A handler, tool or renderer looked up by name at runtime         |
| A name in SQL, YAML or JSON           | A function named in a migration, a path in a CI workflow         |
| A file a framework loads by its name  | A route or config file the framework's knip plugin does not know |
| A file a tool loads by its path       | A `*.workflow.js` in a skill's folder, run by the Workflow tool  |
| A reference only in a gitignored file | Knip respects `.gitignore`, so scratch notes do not count        |

So search the whole repository, not only the source folder, before believing a
finding:

```bash
rg -n --hidden -g '!.git' -g '!node_modules' 'formatDate'
```

The last row cuts the other way in a review: a scratch note is not a consumer,
and code kept alive only by one is dead.

**A generated file is never dead code.** A file whose first line, or first line
after its frontmatter, says `Generated by @euanmsm/skills` is written by
`skills sync` and loaded by a tool, so never delete it. dead-code lists its
findings under `known` without an entry. A raw knip run does not, so check the
head of any unused file before calling it dead.

**A file header naming its consumer is not evidence the consumer exists.**
Search for the importer rather than taking the comment's word.

There is one blind spot in the opposite direction. **Tests and stories are entry
points**, so a component whose only importer is its own story, or a helper only
its own test calls, reads as reachable and is never reported. When a trace shows
the only importers are tests and stories, the production code is dead and those
tests are testing nothing.

Code behind a feature flag that is off is **not** dead. It is unfinished work
kept dark on purpose, and knip reaches it because its imports are real.

## 6. How knip decides what is reachable

Read the repository's `knip.json` or `knip.jsonc` when a finding surprises you.
It is the fastest way to see why something was or was not reported.

- **Workspaces** come from the root `package.json` `workspaces`, or from
  `pnpm-workspace.yaml` in a pnpm repository. Knip runs in the project folder,
  the report's `directory`
- **Plugins** switch on from each workspace's dependencies and add entry points,
  such as a framework's route files or a test runner's specs. Most of the
  framework knowledge lives here, not in the config
- **`entry`** lists the extra entry points the plugins miss
- **`project`** is the set of files knip considers at all
- **`ignore`** removes files from reporting entirely

A finding about a file a plugin should cover means the config has a gap. Report
the gap, not the file.

## 7. Acting on findings

**A review reports; a cleanup deletes.** In a review, a confirmed finding is a
comment naming the file, the symbol and the evidence that nothing reaches it.
Delete only when deleting is the task.

| Finding                          | Fix                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------ |
| Unused file                      | Delete the file, with its story and test files. Never a generated one (step 5) |
| Unused export, used in its file  | Drop the `export` keyword. The symbol stays; it stops being public             |
| Unused export, used nowhere      | Delete the symbol                                                              |
| Unused export in a module barrel | Delete the re-export line only (step 4)                                        |
| Unused exported type             | The same three cases as an export                                              |

### Deletion cascades

Removing a file removes its imports, which orphans whatever it was the last
importer of. So a cleanup is not one pass:

1. Delete the confirmed batch
2. Re-run `npx --no-install dead-code --json`. It finds what the deletion
   orphaned
3. Repeat until the report stops growing
4. Run {{#typecheck}}the typecheck, `{{typecheck}}`,{{/typecheck}}{{^typecheck}}the repository's typecheck,{{/typecheck}} which catches anything the graph missed

Land the cleanup as **one commit**, with ordered passes inside it, not one
commit per folder.

### Never `--fix`

Knip can edit the code it reports, and with `--allow-remove-files` delete files.
Never use either, and never call knip directly to do it. It acts on every
finding, the recorded false positives included, and it edits across the whole
workspace while the git index belongs to the user.

## 8. Recording a keeper

Code kept on purpose has to say so, or the next review deletes it. **A keeper
only counts if it is written down**, and it is written down in one place: a
`known` entry in `.devkit/dead-code.json`.

```json
{
  "known": [
    {
      "path": "^src/features/rooms/_queries/",
      "names": ["useRoomResourcesQuery"],
      "reason": "kept for the room resources work, issue #123"
    }
  ]
}
```

- `path` is a regex matched against the repo-root path of each finding
- `names` limits the entry to those exports, exactly as the report prints them.
  Leave it out to cover everything under the path, such as a vendored or
  deprecated folder
- `reason` is required. Say what will use the code and roughly when, or why the
  whole folder stays

Add an entry only when the user agrees the code is kept on purpose. Never add
one to make a finding go away. When `stale` lists an entry, the thing it excused
has gone: offer to remove it.

## 9. Boundaries

Raising these here means the same point arrives twice in one review.

| Not dead code                                   | Belongs to                    |
| ----------------------------------------------- | ----------------------------- |
| Two functions doing the same thing              | Duplication (`dry`)           |
| A comment describing code that no longer exists | Comments                      |
| A helper that should live one layer up          | Readability, file layout      |
| A feature behind a flag that is off             | Feature flags. Dark, not dead |

A duplicated helper is a duplication finding even when one copy has no callers,
because the fix is to converge on one implementation rather than delete an
orphan.

## Checklist

- [ ] `npx --no-install dead-code --help` ran before anything else
- [ ] Every reported finding was traced with `dead-code why` and searched for
      across the repository
- [ ] Nothing was reported outside the targets, except `branch` findings
- [ ] Nothing under `known` was reported
- [ ] Barrel findings separate the re-export from the definition
- [ ] Anything kept on purpose is a `known` entry with a reason, never a file
      header
- [ ] Deletions were followed by a re-run and the typecheck
- [ ] No generated file was deleted
- [ ] Nobody ran `--fix`
