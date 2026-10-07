# dead-code

Finds dead code, checks each finding before calling it dead, and removes it when
removing it is the task. It keeps the false positives the repository has decided
to live with out of every report.

It needs [`@euanmsm/dead-code`](../../dead-code) installed in the repository.
That package wraps [knip](https://knip.dev), which does the finding, and reads
`.devkit/dead-code.json`, where the known false positives are recorded.

## Installing

```sh
npm i -D @euanmsm/dead-code
npx --no-install dead-code init    # writes a starter .devkit/dead-code.json
```

Then enable the skill in `.devkit/skills.json` and run
`npx --no-install skills sync`:

```json
{ "skills": { "dead-code": {} } }
```

**The package is checked in three places**, because the skill does nothing
useful without it:

- **`skills sync`** prints a warning on stderr when `@euanmsm/dead-code` is not
  in the `dependencies` or `devDependencies` of the root `package.json` or of
  any workspace it or `pnpm-workspace.yaml` lists. It still writes the skill.
  `skills check` never prints the warning, so its output stays the list of
  drifted files.
- **The skill's first step** runs `npx --no-install dead-code --help`. When that
  fails, it stops and tells you to install the package, rather than running knip
  by hand without the known list.
- **This page and the package README.**

## Running it

```
/dead-code                   # the whole repository
/dead-code <path> [<path>…]  # only findings in these files and folders
/dead-code branch            # only what this branch newly left dead
```

The skill loads on its own whenever an agent is about to hunt for, report or
delete dead code, or run knip.

## What it does

It works in one loop, the same for one file or a whole branch:

1. **Runs the CLI once, as JSON.** `npx --no-install dead-code --json`, with
   paths after `--` to filter the result, or `dead-code branch <base> --json`
   for what the branch newly left dead. The base is the commit where the branch
   left its parent branch, so a stacked branch is checked for its own dead code
   only. See [How the base branch is found](base-branch.md). Knip always
   analyses the whole workspace; paths only filter what comes back. Every path
   in the report is from the repository root, and a path typed from any folder
   is tried against the current folder, then the root, so a report's `file`
   works anywhere. An exit 2 with a JSON report means knip failed part of the
   way: the skill reports its `errors` rather than findings it cannot trust.
2. **Keeps to the targets.** A finding outside what it was asked about is not
   reported. `branch` findings are the exception: an export the branch left dead
   in a file it never touched is still the branch's doing.
3. **Leaves the `known` list alone.** Each entry there is a recorded false
   positive with its reason.
4. **Traces, then searches.** `npx --no-install dead-code why <file> [export]`
   names who imports each export, and a repository-wide search finds the
   references knip cannot see.
5. **Judges** whether the code is dead, or kept on purpose and should be
   recorded as a keeper.

Along the way it covers:

- **What knip cannot see**: dynamic imports with a computed path, registries
  looked up by a string key, names in SQL, YAML or JSON, files a framework loads
  by name or a tool loads by path, and references only in gitignored files. A
  file `skills sync` generated, such as a skill's `.workflow.js`, is never
  deleted; dead-code lists it as known without an entry. Tests and stories count
  as entry points, so code only they reach is never reported.
- **Barrel entries against definitions**: an unused export in an `index.ts`
  means the module publishes something nobody outside wants, not that the
  definition is dead. `dead-code why <barrel> <export>` tells them apart.
- **How a fix lands**: delete a file with its tests and stories, drop an
  `export` keyword when the symbol is used in its own file, or delete one barrel
  line. Deletions cascade, so it re-runs the report until it stops growing, then
  typechecks, and lands the cleanup as one commit.
- **Never `--fix`**: knip's own fixes act on the known false positives too, and
  edit across the whole workspace.
- **Configuration hints**: knip reporting that its own config has drifted, kept
  apart from the code findings.

## Recording a keeper

Code kept on purpose is recorded as a `known` entry in `.devkit/dead-code.json`,
never in a file header:

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

`path` is a regex matched against each finding's repo-root path, `names` limits
the entry to those exports, and `reason` is required. The skill adds an entry
only when the user agrees the code is kept on purpose. An entry that matched
nothing in a whole-repository run is listed as `stale`, and the skill offers to
remove it. The package README has [every key](../../dead-code/README.md#config).

## With the code review

When the skill is enabled, the [code review](code-review.md)'s `dead-code` lens
loads it by default, so the reviewer works from these rules. Set
`'dead-code': { skill: null }` in `.devkit/code-review.mjs` to stop that.

With `@euanmsm/dead-code` installed, the review's prepass runs it in place of
raw knip. In diff mode it runs `dead-code branch --json <merge base>`, so the
reviewer sees what the branch newly left dead in any file, with the known false
positives already set apart. That report reads the working tree, so uncommitted
edits count in it although the review's diff leaves them out. A finding it lists
in a file the diff did not touch is the branch's: the verifier checks the report
before refuting one as pre-existing. See
[the built-in checks](code-review.md#prepass).

## Options

| Option      | Default | What it is                                                                                     |
| ----------- | ------- | ---------------------------------------------------------------------------------------------- |
| `typecheck` | none    | The command run after a deletion. Without it, the skill says to run the repository's typecheck |

The skill also uses the shared `skillsDir` and `baseBranch` settings.

## Files it writes

| File                             | When   |
| -------------------------------- | ------ |
| `<skillsDir>/dead-code/SKILL.md` | Always |
