# clean-comments

Fixes comments that break the repository's comment rules — file headers, JSDoc,
property docs and `//` lines — across a set of files. **It changes comments
only. It never changes code**, so the result can be reviewed as a pure comment
cleanup.

It needs [`@euanmsm/terse`](../../terse) installed in the repository. terse is
the scanner that finds the rule breaks, and its config decides which files the
rules apply to.

## Running it

```
/clean-comments                     # changed files, else the branch's files
/clean-comments <path> [<path>...]  # named files or directories
```

## What it does

### 1. Loads the convention skills first

Before anything else, it loads the skills listed in `preloadSkills` (by default,
just `comments`). Two reasons:

- They hold the rules and the examples the agents match.
- If the repository runs the [`@euanmsm/preflight`](../../preflight) hook, edits
  to governed files are blocked until those skills are loaded. The hook's check
  covers the whole session, so loading them once here lets every agent it spawns
  later edit freely.

### 2. Works out which files to clean

The first rule that matches wins:

1. **Paths given** — those files. A directory expands to every file git tracks
   under it.
2. **No paths, uncommitted changes** — the changed files, including files inside
   new folders.
3. **No paths, clean working tree** — the files the branch changed since it left
   `baseBranch`.
4. **Nothing either way** — it says so and stops. It never goes looking for
   comment problems elsewhere in the repository.

### 3. Finds the problems

It runs `npx --no-install terse scan` over those files. The scan keeps only the
files terse's rules apply to, using terse's own `governs()` check against
`.devkit/terse.json`, and lists the rest as skipped. Each finding is one line:
`path:line  [rule-name]  message`.

Two rules can't be checked by a script — whether a `//` comment should exist at
all, and whether a comment says _what_ instead of _why_ — so a clean scan still
gets a read-through.

### 4. Does the work itself, or splits it up

| How much there is             | What happens                                     |
| ----------------------------- | ------------------------------------------------ |
| Up to 3 files, or 40 findings | It fixes them itself                             |
| More than that                | It hands batches to `comments-specialist` agents |

When it splits the work:

- A file belongs to exactly one batch, so two agents never edit the same file.
- Batches are balanced by number of findings, not number of files.
- At most 8 agents run, all started at once.

Each agent gets its file list and its share of the scanner output, nothing more.
The agent already has the comment skills loaded.

### 5. Checks the result

- Runs the scanner again over every file.
- Reads the diff to confirm every changed line is a comment.
- If `typecheck` is set, runs it — a broken block comment can swallow code.

### 6. Reports

It lists findings before and after, what it deleted outright, anything left
unfixed and why, and any bugs the agents noticed and left alone. Then it
suggests a commit message and stops. It never stages or commits.

## The comments-specialist agent

Installing `clean-comments` also writes an agent,
`<agentsDir>/comments-specialist.md`. It runs on Sonnet with Bash, Read, Edit,
Grep and Glob, and has the `preloadSkills` loaded before it starts. Its whole
job is one batch of files:

1. Re-run the scanner on its files.
2. Fix each mechanical finding.
3. Read every remaining `//` comment and delete the ones that add nothing.
4. Re-run the scanner, which must report zero, and confirm only comments
   changed.
5. Report back.

It is told never to touch files outside its batch, never to change code, and
never to get round a blocked edit with `sed` or a shell command.

## Options

Under `skills["clean-comments"]` in `.devkit/skills.json`. It also uses the
shared `baseBranch` and `agentsDir` settings.

| Option          | Default        | What it does                                                                                                   |
| --------------- | -------------- | -------------------------------------------------------------------------------------------------------------- |
| `preloadSkills` | `["comments"]` | Skills loaded at the start, and preloaded into the agent. List every skill a preflight gate requires for edits |
| `typecheck`     | none           | A command run after the cleanup to catch a comment that broke the code. Without it, that step is left out      |

### Where the comment rules come from

Not from this config. The skill and the agent point at the rules file named by
`rulesDoc` in the repository's `.devkit/terse.json`. When `rulesDoc` is unset,
they point at `.devkit/comment-rules.md`, which is where `npx terse-docs` writes
the rules by default.

Change `rulesDoc` and the generated files change, so run `sync` afterwards.

### Example

```json
{
  "skills": {
    "clean-comments": {
      "preloadSkills": ["comments", "readability"],
      "typecheck": "npx -w apps/main tsc --noEmit"
    }
  }
}
```

## Files it writes

| File                                  |
| ------------------------------------- |
| `<skillsDir>/clean-comments/SKILL.md` |
| `<agentsDir>/comments-specialist.md`  |
