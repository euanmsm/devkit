# code-review

A deep review of a branch or of named files, run by many agents at once. Each
agent reviews one group of concerns. Every finding then goes to a second agent
whose job is to disprove it, and only what survives reaches the report.

This page explains exactly how a review runs, then every setting that changes
it.

- [Running it](#running-it)
- [The words this page uses](#the-words-this-page-uses)
- [How a review runs](#how-a-review-runs)
- [Configuring it](#configuring-it)
- [The review config, key by key](#the-review-config-key-by-key)
- [The built-in lenses and bundles](#the-built-in-lenses-and-bundles)
- [Prompt wording](#prompt-wording)
- [The prepass](#the-prepass)
- [Posting to GitHub](#posting-to-github)
- [Errors sync can give you](#errors-sync-can-give-you)

## Running it

```
/code-review                     # this branch against the base branch
/code-review <path> [<path>...]  # named files or a directory, as they stand
/code-review pr                  # this branch's PR, posted as a pending review
/code-review pr 793              # a named PR, with its branch checked out
```

The `pr` forms exist only when `githubReview` is on. The command name is the
skill's `name` option, so a repository that sets `"name": "review"` types
`/review`.

The first form is **diff mode**: it reviews what the branch changed. The second
is **target mode**: it reviews files as they are, whatever changed them.

The result is a markdown report written to `tmp/code-reviews/`, named after the
branch (and the target, in target mode).

## The words this page uses

- **Lens** — one thing the review checks for, such as `security` or `dead-code`.
  A lens has a paragraph saying what it judges, a `route` saying which files
  switch it on, and optionally the name of the repository's skill holding its
  conventions.
- **Bundle** — a group of lenses one reviewer agent covers together, as separate
  passes over the same files. A bundle is either **cross-cutting**
  (`scope: 'target'`, reads every file under review) or **layer-scoped**
  (`scope: 'slice'`, reads only the files that switched its lenses on).
- **Recon** — the first agent. It reads the code, writes a map for the others,
  and makes the routing calls a file path cannot.
- **Verifier** — an agent that tries to disprove findings about one file.
- **Prepass** — the typecheck, lint and similar tools, run once in the
  background so no reviewer runs them itself.

## How a review runs

The skill does a little work in the shell, then hands everything else to one
script run by Claude Code's Workflow tool: `review.workflow.js`, which `sync`
generates from your config.

### 1. The skill resolves what to review

- **Diff mode**: the changed files between the base branch and the current
  branch, diffed from their merge base so commits landed on the base afterwards
  do not count. It stops if you are on the base branch or nothing changed.
  - The base is `baseBranch` or `origin/<baseBranch>`, whichever the branch left
    later, so a local copy that was never pulled does not add commits that
    landed upstream since.
  - On a detached HEAD it reviews `HEAD`, and names the report
    `detached-<short sha>`.
  - It reviews commits, but agents and tools read files from disk. So with
    uncommitted changes it warns you, reviews the last commit, and the report
    header says
    `State reviewed: commit <sha>; <n> uncommitted file(s) left out`.
  - `pr <n>` reads the PR's head and base branches first. If the PR's head is
    not the branch you have checked out, it stops and offers
    `gh pr checkout <n>`, rather than reviewing one branch and posting to
    another PR. It diffs against the PR's own base, so a stacked PR is reviewed
    against the branch it merges into.
- **Target mode**: the paths you named. A directory expands to every file under
  it with one of the `files.targetExtensions` extensions. It stops if a path
  does not exist, or if there are more than 40 files — it asks you to narrow the
  target rather than sampling.

### 2. The prepass splits the diff (diff mode)

`npx --no-install skills prepass split` writes one patch file per changed file,
at `<patch folder>/<path>.patch`, so each reviewer loads only the patches for
its own files. It also reports whether the diff is large (over 4000 lines), in
which case Recon works through it file by file.

### 3. The prepass runs the tools, in the background

`npx --no-install skills prepass tools` starts every tool in `prepass.tools`,
the built-in comment and dead-code checks when terse and `@euanmsm/dead-code`
(or knip) are installed, and the import graph, all at once. In diff mode the
skill passes the merge base as `--base`, so the dead-code check reports what the
branch newly left dead. The skill's one command line adds `--base` only when the
base is set, so it runs unchanged in target mode, and an empty `--base` counts
as none. The skill first deletes the last run's reports and sentinel, so nothing
reads them as this run's, and then does not wait. Recon never waits for them: it
uses the import graph only if it has already landed. The reviewers wait for them
only when they start, several minutes later. See [The prepass](#the-prepass) and
[`prepass`](#prepass).

### 4. Routing decides which lenses fire

Before any agent starts, the script decides which lenses fire, from the file
list alone. For each lens, its `route` adds files:

| Route field            | Adds                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| `always: 'code'`       | Every file under review, if any of them is code (matches `files.code`)                           |
| `always: 'codeOrDocs'` | Every file under review, if any of them is code or docs (`files.docs`)                           |
| `paths`                | Each file matching one of the patterns                                                           |
| `coverage`             | Diff mode only: each changed **non-test** file matching one of the patterns (see coverage below) |

A lens fires when it has at least one file. A lens marked `diffOnly` never fires
in target mode.

Then each bundle fires if any of its lenses did. A cross-cutting bundle reviews
every file; a layer-scoped bundle reviews the files its fired lenses matched.

### 5. Recon reads the code and adjusts the routing

Recon (on Opus) receives the file list, the routing already decided, and the
patches. It:

- **Writes a context pack** to the scratch folder: every file with its layer and
  purpose, the import graph with corrections (or its own call-site map, when the
  graph has not landed yet), and where each file's neighbours live (its tests,
  its migrations, its config). Every reviewer reads this first so none of them
  spends its time searching.
- **Makes the judgment calls.** Every lens whose route has a `judgment` sentence
  is listed for Recon with that sentence, and Recon adds the ones the code calls
  for. It can give an added layer-scoped lens its own file list.
- **Can switch a lens off** when its files turn out to have nothing for it.
- **Writes a note per bundle** naming the concrete thing worth checking in this
  code.
- **Flags gaps**: it lists `skillsDir` and names any skill no lens covers.

Every lens Recon adds or removes is printed in the report under **Routing
changed by Recon**. If routing and Recon leave no bundle at all, every
cross-cutting bundle runs over every file, so the review is never empty.

### 6. Fat bundles split when there are spare agents

A bundle's lenses run one after another inside one agent, so a big bundle is the
slowest part of the run. A bundle with a `split` can run as two agents instead:

- The script is given `agentCap`, the number of agents that can run at once (the
  skill passes `min(16, cores − 2)`; the script assumes 12 without it).
- Reviewers get 60% of that, rounded down. The rest is left for verifiers, which
  run at the same time.
- Bundles split in `splitOrder`, one at a time, while the number of reviewer
  agents is under that 60%.
- A split only happens if both halves still have a lens that fired.

Splitting changes nothing in the report — both halves report under their
bundle's name.

### 7. One reviewer per bundle

Each reviewer gets a prompt holding:

- **A FIRST ACTION line** telling it to load the skill of every lens it covers
  that has a `skill`. This is how the repository's conventions reach the
  reviewer. A lens without a skill is reviewed against its `judges` paragraph
  alone.
- Its files, Recon's summary, the context pack path and Recon's note for this
  bundle.
- In diff mode, the patch folder and a rule: report only what this branch adds,
  changes or breaks.
- The tool reports, with an instruction to wait for the prepass to finish and
  never to run the tools itself.
- Reading instructions: the whole file, its callers, what it calls across a
  layer boundary, its tests, and its migrations.
- One pass per lens, in order, each with that lens's `judges` paragraph.

Reviewers run on their bundle's `model` (or their split half's). They report
findings with a file, a line, a severity (`critical`, `high`, `medium`, `low`),
what is wrong, why it matters and the evidence. They also report every lens they
ran, even the ones that found nothing, so a skipped pass shows up.

**Coverage.** In diff mode, a lens with `coverage` patterns has a second job:
list the behaviour the branch added that has no test. Those findings are
reported separately as coverage gaps.

### 8. Verifiers try to disprove every finding

As soon as a bundle's reviewer finishes — without waiting for the others — its
findings go to verification:

1. A finding with no line number is dropped; it cannot be placed in the report.
2. The rest are sorted by severity, and the first 12 are verified. Any beyond 12
   are kept in the report, marked unverified.
3. Findings are grouped by file. One verifier checks up to 8 findings on one
   file.
4. A verifier runs on Opus if any of its findings is `critical` or `high`, and
   on Sonnet otherwise.

The verifier re-reads the file, checks every citation is real, re-runs any
experiment the finding claims, traces the claim through the code, and challenges
the severity. It returns `confirmed`, `amended` (with corrections) or `refuted`
for each finding. A correction may only change a finding's own fields, and a
severity outside `critical`, `high`, `medium` and `low` is ignored.

A finding with no verdict is kept and marked unverified, with a note saying why:
it was over the cap, its verifier returned nothing, or the verifier gave no
verdict for its id. `stats.unverified` counts all three, after merging.

### 9. Findings are merged

- Two findings from different bundles, under the same lens, on the same file,
  with lines within 2 of each other are treated as one. Two findings from the
  same reviewer are never merged.
- Each verdict applies to its own finding. A merged finding is dropped only when
  every verifier refuted it, and the report shows the most severe finding that
  survived. If the verifiers disagree, the finding is marked **Split verdict**
  so the disagreement is visible.

### 10. The report is written

If anything survived, one more agent (on Sonnet) writes a "Read this first"
paragraph naming the single most important thing. The report then holds:

- a summary table of every surviving finding, most severe first
- one section per lens with each finding in full
- coverage gaps, last
- what was refuted and why, and every routing change Recon made
- a table per bundle of what each lens checked — any lens that never reported
  back says so, and a bundle whose reviewer returned nothing says that under its
  title (the result lists those bundles in `bundlesDied`)
- in diff mode, the state reviewed: the commit, and how many uncommitted files
  were left out

The script also returns a four-line summary for a GitHub review body, used only
in PR mode.

## Configuring it

Two files:

1. **`.devkit/skills.json`** switches the skill on and sets four options.
2. **`.devkit/code-review.mjs`** says everything about how your repository is
   reviewed. It is optional — without it, the review runs on the built-in
   lenses, bundles and wording.

### Options in `skills.json`

```json
{
  "skills": {
    "code-review": {
      "name": "code-review",
      "config": ".devkit/code-review.mjs",
      "githubReview": false
    }
  }
}
```

| Option         | Default                   | What it does                                                                                  |
| -------------- | ------------------------- | --------------------------------------------------------------------------------------------- |
| `name`         | `code-review`             | The skill's folder name and slash command: lowercase letters, digits and dashes               |
| `config`       | `.devkit/code-review.mjs` | Path to the review config                                                                     |
| `githubReview` | `false`                   | Adds the `pr` modes, the "Deliver to GitHub" step, and writes `pr-reviews.md` into `rulesDir` |

The skill also uses the shared `skillsDir`, `rulesDir` and `baseBranch`
settings.

### Files it writes

| File                                    | When                |
| --------------------------------------- | ------------------- |
| `<skillsDir>/<name>/SKILL.md`           | Always              |
| `<skillsDir>/<name>/review.workflow.js` | Always              |
| `<rulesDir>/pr-reviews.md`              | With `githubReview` |

`review.workflow.js` is the shared engine with your resolved config written in
as a constant at the top. **Change `code-review.mjs` and run `sync`** — the
script has to be regenerated to see the change, and `skills check` fails until
it is.

The `SKILL.md` includes a **Bundle Roster** section built from the same config:
which lenses Recon decides, how bundles split, every bundle with its lenses,
model and the patterns that fire it, and which lenses have no skill. It can't
drift from the script, because both come from one config.

## The review config, key by key

`.devkit/code-review.mjs` is a JavaScript module exporting one object. It is a
module rather than JSON so that file patterns are real regular expressions and
long paragraphs can be written as template strings.

```js
export default {
  files: { … },
  prepass: { … },
  lenses: { … },
  bundles: [ … ],
  splitOrder: [ … ],
  prompts: { … },
  rosterNotes: `…`,
};
```

Every key is optional. Any key not listed here is an error.

No regex may use the `g` or `y` flag. Routing calls `.test()` on the same regex
for file after file, and those flags make each call start where the last match
ended, so files would be skipped at random. `sync` names the key.

### `files`

What routing treats as code, docs and tests.

| Key                | Default                                          | Used for                                                                                   |
| ------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `code`             | `/\.(ts\|tsx\|mts\|js\|mjs)$/`                   | `always: 'code'` routes, and the `'code'` shorthand in a route                             |
| `docs`             | `/\.mdx?$/`                                      | `always: 'codeOrDocs'` routes                                                              |
| `tests`            | `/\.(test\|spec)\.[cm]?[jt]sx?$/`                | Never counted as production code by a `coverage` route; the `'tests'` shorthand in a route |
| `targetExtensions` | `['ts', 'tsx', 'mts', 'js', 'mjs', 'sql', 'md']` | Which files a directory expands to in target mode                                          |

### `prepass`

```js
prepass: {
  tools: [
    { key: 'tsc', label: 'TypeScript errors', command: 'npx --no-install tsc --noEmit' },
    { key: 'lint', label: 'ESLint output', command: 'npm run lint' },
  ],
  graph: {
    sources: /\.(ts|tsx|mts)$/,
    searchGlobs: ['*.ts', '*.tsx', '*.mts', '*.js', '*.mjs'],
  },
  comments: 'auto',
  knip: 'auto',
  deadCode: 'auto',
},
```

**`tools`** — the commands run in the background. Giving the list replaces the
default two (the built-in checks below are added on top either way). The default
`tsc` runs only when `typescript` is a dependency, so a JavaScript-only
repository gets no typecheck report rather than a wrong one. Each tool has:

| Field                  | Required | What it is                                                                                                                                                             |
| ---------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `key`                  | yes      | A plain name. The report is written to `_<key>.tmp.txt`, and the reviewers see it under this name                                                                      |
| `label`                | yes      | How the report is described to reviewers, for example `ESLint output, including the import law`                                                                        |
| `command`              | yes      | A shell command, run from the repository root                                                                                                                          |
| `json`                 | no       | `true` when the tool prints JSON with other lines around it (npm banners, say). Keeps only the JSON on stdout, and names the report `_<key>.tmp.json`                  |
| `appendFiles`          | no       | `true` to add the files under review to the end of the command, each as its own argument. Files the diff deleted are left out. With no files left, the tool is not run |
| `onlyFilesUnderReview` | no       | `true` for a JSON report shaped like knip's. Keeps only the entries for files under review, and records how many other files had entries as `filesOutsideReview`       |
| `baseCommand`          | no       | A command to run instead in diff mode, with the diff's base commit added to the end, quoted. The files are not added. Without a base, `command` runs as usual          |
| `errorExitCodes`       | no       | Exit codes the tool keeps for its own errors, such as `[2]`. The tool is then `failed` rather than `ok`, and its report is its JSON if it printed any, else its output |

The keys `importGraph`, `sentinel` and `files` are taken, and each key may
appear once.

**The built-in checks: `comments`, `deadCode` and `knip`.** These checks are
added to the tool list without you listing them, whenever the repository has the
tool installed. "Installed" means the package is in `dependencies` or
`devDependencies` of the root `package.json` or of any workspace it or
`pnpm-workspace.yaml` lists, so the answer is the same on every machine. A
package declared but not yet installed, as in a fresh CI checkout, makes the
check `failed` rather than a report of npm's error.

| Setting    | Installed when                       | Report               | What it runs                                                                                                                                                                                             |
| ---------- | ------------------------------------ | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `comments` | `@euanmsm/terse` is a dependency     | `_comments.tmp.txt`  | `npx --no-install terse scan <files under review>` — every line of those files against the comment rules (terse 0.3.0 or newer)                                                                          |
| `deadCode` | `@euanmsm/dead-code` is a dependency | `_deadCode.tmp.json` | Diff mode: `npx --no-install dead-code branch --json <base>`, only what the branch newly left dead, anywhere in the repository. Target mode: `npx --no-install dead-code --json -- <files under review>` |
| `knip`     | `knip` is a dependency               | `_knip.tmp.json`     | `npx --no-install knip --reporter json`, then keeps only the files under review. Left out when `deadCode` runs                                                                                           |

Each setting takes:

- `'auto'` (the default) — add the check when the tool is installed.
- `true` — always add it.
- `false` — never add it, even if it is installed or listed in `tools`.

**`deadCode` or `knip`, not both.** They report the same dead code, so when
`deadCode` runs, `knip` on `'auto'` is left out, even when it is listed in
`tools`. `knip` stays for repositories that have knip but not
`@euanmsm/dead-code`. Set `knip: true` to run both.

The dead-code report sets the repository's known false positives apart, each
with the reason recorded in `.devkit/dead-code.json`, and the `dead-code` lens
tells reviewers never to report those. Its workspaces and issue types come from
that file too, so a monorepo does not need to override the command: put
`workspaces` in `.devkit/dead-code.json` instead. Exit `1` means it found
something and is `ok`; exit `2` means it could not run (a bad config, a missing
base, or knip failing) and is `failed`. When knip failed part of the way, the
report is still dead-code's JSON, whose `errors` say what went wrong. The branch
report reads the working tree, so uncommitted edits count in it although the
diff leaves them out; the lens tells reviewers so. Files `@euanmsm/skills`
generates, such as this skill's `review.workflow.js`, are loaded by path, and
dead-code lists them as known rather than unused. See
[`@euanmsm/dead-code`](../../dead-code/README.md).

To change how a built-in check runs, list a tool with its key in `tools`. The
fields you give replace the built-in's, and the rest — including `appendFiles`,
`baseCommand` or `onlyFilesUnderReview` — are kept. Replacing the `command` of a
check that has a `baseCommand` is an error unless you give `baseCommand` too, or
`null` to run `command` in both modes, since diff mode would otherwise still run
the built-in's. For example, a monorepo where knip belongs to one workspace:

```js
prepass: {
  tools: [
    { key: 'tsc', label: 'TypeScript errors', command: 'npx --no-install tsc --noEmit' },
    { key: 'lint', label: 'ESLint output', command: 'npm run lint' },
    { key: 'knip', command: 'npx --no-install knip --workspace apps/main --reporter json' },
  ],
},
```

Why the raw knip report is limited to the files under review: a reviewer is only
judging those files, and a whole-repository dead-code report buries them in
hundreds of unrelated entries. The trade-off is that in diff mode, an export the
branch left unused **in a file it did not touch** is not in the knip report; the
dead-code lens catches it only through the import graph. The `deadCode` check
closes that gap: its branch mode compares the repository at the fork point with
the working tree, so it reports exactly what the branch newly left dead, in any
file, and nothing that was already dead. In target mode it keeps only findings
in the targets.

**`graph`** — how the import graph is built:

| Key           | Default                                       | What it is                                       |
| ------------- | --------------------------------------------- | ------------------------------------------------ |
| `sources`     | `/\.(ts\|tsx\|mts)$/`                         | Files under review whose exports go in the graph |
| `searchGlobs` | `['*.ts', '*.tsx', '*.mts', '*.js', '*.mjs']` | Files searched for places those exports are used |

### `lenses`

An object keyed by lens name. Each entry does one of three things:

- **Changes a built-in lens.** Name a built-in and give only the fields to
  change; the rest keep their built-in values. `security: { skill: 'security' }`
  keeps the built-in paragraph and route, and adds your skill.
- **Removes a built-in lens.** `ci: false`. It disappears from the default
  bundles too.
- **Adds a lens of your own.** Any other name. It needs at least `judges`, and
  must end up in a bundle.

Lenses are listed in reports in the order you write them, followed by any
built-ins you did not mention.

A lens's fields:

| Field      | What it is                                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `judges`   | The paragraph the reviewer is given for this pass. Required. Say what the lens looks for, concretely                                        |
| `skill`    | The name of a skill in `skillsDir` holding the conventions for this lens. The reviewer loads it before reading code. `null` for none        |
| `route`    | Which files switch the lens on. See below                                                                                                   |
| `title`    | The heading used in the report. Without it, the name is title-cased: `api-routes` becomes `Api Routes`                                      |
| `diffOnly` | `true` for a lens that only makes sense against a change, like `backwards-compat`. It never fires in target mode                            |
| `bundle`   | The key of an existing bundle to add this lens to, instead of listing it in `bundles`. If that bundle splits, the lens joins its first half |

`route` fields — combinable, and **at least one is required**: `always`, a
non-empty `paths` or `coverage`, or a `judgment`. A route with none of them
could never fire, so `sync` refuses it:

| Field      | What it is                                                                                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `always`   | `'code'` or `'codeOrDocs'`. Fires on every file under review when any is code (or docs)                                                                    |
| `paths`    | A list of regexes. Fires on each matching file. The strings `'code'` and `'tests'` stand for `files.code` and `files.tests`                                |
| `coverage` | A list of regexes, used in diff mode only. A changed production file matching one fires the lens, which then also looks for missing tests. Same shorthands |
| `judgment` | A sentence for Recon saying when to switch this lens on by reading the code, because no path can tell. Recon sees it as `- **<lens>** — <sentence>`        |

A lens with a `route` you give replaces the built-in route entirely — routes are
not merged field by field.

Example — a repository lens that fires on its own folders and asks Recon to add
it elsewhere when it spots an event being written:

```js
lenses: {
  events: {
    skill: 'events',
    route: {
      paths: [/^packages\/service\/src\/(core|steps|verbs)\//],
      judgment:
        'fires on `core/`, `steps/` and `verbs/` already. ADD it if any file under review writes an event or adds a kind to the registry.',
    },
    judges:
      'The event vocabulary and the payload envelope. A kind invented inline instead of taken from the registry, a status change and its event in separate transactions.',
    bundle: 'correctness',
  },
},
```

### `bundles`

A list of bundles. **Giving a list replaces the built-in bundles entirely**, so
it must place every lens. Leave it out to use the built-ins, and use a lens's
`bundle` field to add your lenses to them.

| Field    | What it is                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------- |
| `key`    | The bundle's name                                                                                 |
| `title`  | The heading in the report's lens table                                                            |
| `scope`  | `'target'` reads every file under review; `'slice'` reads only the files its fired lenses matched |
| `model`  | `'opus'`, `'sonnet'` or `'haiku'` — the model the reviewer runs on                                |
| `lenses` | The lens names this bundle covers, in the order the reviewer works through them                   |
| `split`  | Optional. Two or more `{ lenses, model }` parts it can split into when agents are spare           |

Rules `sync` enforces:

- Every lens is in exactly one bundle.
- Every lens a bundle names exists.
- A `split` is a list of parts. Every part has a model and a list of lenses.
- The parts together name every lens in the bundle, each in exactly one part. A
  lens left out would stop running whenever the bundle splits.

Keep cross-cutting and layer-scoped lenses in separate bundles. A layer lens in
a cross-cutting bundle reads every file; a cross-cutting lens in a layer-scoped
bundle sees only one layer's files.

### `splitOrder`

The order bundles split in when there are spare agents. Every entry must be a
bundle with a `split`. Without it, bundles split in the order they appear in
`bundles`. Put the bundle with the most lenses first — it is the slowest.

### `prompts`

Replacement wording for the passages of the agents' instructions that depend on
how your repository is built. Every one has a generic default. Change only the
ones that read wrong for your repository. See [Prompt wording](#prompt-wording).

### `rosterNotes`

A markdown string appended to the Bundle Roster section of the generated
`SKILL.md`, under **Notes for this repository**. Use it for anything a reader
needs to understand your bundles — why two lenses share a bundle, where two
overlapping lenses draw their line. It is documentation for people; the agents
never see it.

## The built-in lenses and bundles

Every built-in has `skill: null` until you name one. The one exception is
`dead-code`: when the [`dead-code` skill](dead-code.md) is enabled in
`skills.json`, the lens loads it by default.

| Lens               | Route                                       | Notes                   |
| ------------------ | ------------------------------------------- | ----------------------- |
| `bugs`             | always, on code                             |                         |
| `error-handling`   | always, on code                             |                         |
| `security`         | always, on code; plus migrations and `.sql` |                         |
| `performance`      | always, on code                             |                         |
| `dry`              | always, on code or docs                     |                         |
| `readability`      | always, on code or docs                     |                         |
| `typing`           | always, on code                             |                         |
| `comments`         | always, on code or docs                     |                         |
| `dead-code`        | always, on code                             |                         |
| `database`         | migrations and `.sql` files                 |                         |
| `backwards-compat` | migrations; plus Recon's judgment           | Diff mode only          |
| `testing`          | test files; coverage on changed code        | Runs the coverage check |
| `ci`               | `.github/workflows/*.yml`                   |                         |

"Migrations" means any path with a `migration/` or `migrations/` folder in it.
The `judges` paragraph for each is in
[`src/review/defaults.mjs`](../src/review/defaults.mjs).

| Bundle        | Scope         | Model  | Lenses                                        | Splits into                                                    |
| ------------- | ------------- | ------ | --------------------------------------------- | -------------------------------------------------------------- |
| `correctness` | cross-cutting | opus   | bugs, error-handling                          | bugs (opus) + error-handling (opus)                            |
| `security`    | cross-cutting | opus   | security                                      |                                                                |
| `performance` | cross-cutting | opus   | performance                                   |                                                                |
| `craft`       | cross-cutting | opus   | dry, readability, typing, comments, dead-code | dry, readability, dead-code (opus) + typing, comments (sonnet) |
| `database`    | layer-scoped  | opus   | database, backwards-compat                    |                                                                |
| `tests`       | layer-scoped  | sonnet | testing                                       |                                                                |
| `ci`          | layer-scoped  | sonnet | ci                                            |                                                                |

## Prompt wording

Each slot is a phrase dropped into a sentence the engine already writes. The
table shows the sentence around it, so you can see what your wording has to fit.

### Recon

| Slot                | Sentence it completes                                                                                  | Default                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `graphUnderReports` | The import graph "over-reports lookalikes and under-reports **\___**". Also used in the graph's header | `dynamic references`                                                                                            |
| `fileRoles`         | "Note which layer each file belongs to (**\___**)."                                                    | `route handler, service, data-access function, component, page, hook, type or schema, migration, config, test`  |
| `readNote`          | A whole paragraph after the reading step. Empty means none                                             | empty                                                                                                           |
| `neighbours`        | The pack says, for each area, "where its neighbours are: **\___**"                                     | `the tests beside it, the migrations behind any table it reads, the config it depends on, the errors it raises` |
| `removalExample`    | "If the routing fired a lens whose files turn out to have nothing for it to judge — **\___**, say — …" | empty (no example)                                                                                              |
| `concernExample`    | "Name the concrete concern — "**\___**" beats "review for N+1"."                                       | `this function runs one query per row inside a loop instead of a single batched query`                          |

### Reviewers

| Slot                | Sentence it completes                                                                       | Default                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `toolCost`          | "one agent running **\___** is exactly the cost the prepass exists to avoid"                | `` `tsc` or the full lint ``                                                                |
| `layerChain`        | "Read downstream too — … especially across a layer boundary (**\___**)."                    | `route -> service -> data access`                                                           |
| `databaseReading`   | "For anything touching the database, read **\___**."                                        | `the migration that created the table and the columns the code assumes`                     |
| `extraReadingSteps` | A list of extra numbered reading steps, each a full sentence, added after the database step | none                                                                                        |
| `whyItMatters`      | Each finding's `whyItMatters` is "the concrete consequence — **\___**"                      | `the failed request, the wrong number on screen, the record a user can read but should not` |

### Coverage (test lenses, diff mode)

| Slot               | Sentence it completes                                            | Default                                                                                        |
| ------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `coverageUnits`    | List every behaviour the conventions require covered — **\___**. | `new functions, branches, error paths, edge cases`                                             |
| `coverageLocation` | "Find and read **\___**, in full."                               | `the corresponding test files at their conventional locations`                                 |
| `coverageExamples` | `issue` is the missing coverage in one line (**\___**).          | `"no test for the error branch of createInvoice", "parseDate has no test for an empty string"` |
| `coverageSeverity` | "Severity reflects the gap: **\___**."                           | `an untested error path on a write is high, a missing test for a formatting helper is low`     |

### Verifiers

| Slot                 | Sentence it completes                                                                                    | Default                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `coverageFiles`      | A coverage finding is verified by "searching for the covering file (**\___**)"                           | `a test file at its conventional location beside the code`                            |
| `errorIdentifier`    | "Check every citation is real — each file, line, migration, quoted convention and **\___**."             | `error code`                                                                          |
| `authCheck`          | "If it claims a missing auth check, find whether **\___** already applies one." Empty drops the sentence | `middleware or a wrapping layer`                                                      |
| `deadCodeReferences` | "If it claims dead code, grep the whole repo — including **\___**."                                      | `dynamic references, string-keyed lookups and tests, none of which look like imports` |
| `blastRadius`        | "Establish blast radius from the actual **\___**."                                                       | `code and data — whether the path runs at all, whether a write path even exists`      |

Every slot is a string except `extraReadingSteps`, which is a list of strings. A
slot name not in these tables is an error.

## The prepass

The skill runs these itself. They are documented so you know what your `prepass`
config controls.

### `skills prepass split --base <commit> --target <branch> --out <folder>`

Runs `git diff` once and writes one `.patch` file per changed file into the
folder, mirroring the file tree: `src/a/b.ts` is at `<folder>/src/a/b.ts.patch`.
The folder is emptied first. It prints
`{ patchDir, files, unnamed, patchLines, largeDiff }`: `files` counts the
patches written, `unnamed` the chunks it could not name, and `largeDiff` is true
over 4000 lines.

The diff runs as
`git -c core.quotePath=false diff --no-ext-diff --no-color --src-prefix=a/ --dst-prefix=b/`,
so your own git settings (`diff.noprefix`, colour, an external diff tool) cannot
change what it parses. A deleted file is named by its old path, a rename by its
new one, and a binary file from its header.

### `skills prepass tools --scratch <folder> --files-from <list> [--base <commit>]`

The list holds one path per line, from the repository root. `./src/a.ts`, or an
absolute path inside the repository, is read as `src/a.ts`, the way tools name
it.

1. Deletes any report left from an earlier run, so an old file can never pass
   for a finished one.
2. Starts every tool — those in `prepass.tools` plus the built-in checks — and
   the import graph at the same time. Each tool runs through the shell from the
   repository root, with colour output switched off and no input, so nothing can
   wait on a prompt. A tool with `appendFiles` gets the files under review added
   to its command as separate arguments, leaving out any the diff deleted. A
   list too long for the system to start the command with fails that tool alone.
   With `--base`, a tool with a `baseCommand` runs that instead, with the base
   added. The skill passes an empty `--base` in target mode, which counts as
   none.
3. Writes each report as it finishes — to a temporary file first, then renamed
   into place, so **a report that exists is complete**.
4. Writes `_prepass.done.json` last. It gives each tool's
   `{ status, exitCode }`, plus `importGraph` and the file count. A JSON tool's
   report is the JSON on its stdout alone, and anything it wrote to stderr is in
   its entry as `stderr`. Reviewers wait up to three minutes for this file
   before reading any report.

A tool's `status` is one of:

- `ok` — it ran. Exiting with an error because it **found** problems is the
  normal case, and still `ok`.
- `failed` — the shell could not find or run it (exit 127 or 126), npm has no
  such script, npx found no such package it may use (`--no-install`), it exited
  with one of its `errorExitCodes`, or a `json` tool exited non-zero without
  printing JSON.
- `timedOut` — it ran for 170 seconds, just under the reviewers' wait, and was
  stopped along with everything it started. Its report says so and keeps the
  output so far, so the sentinel always lands in time.

### `skills prepass graph --files-from <list>`

Prints the import graph. The `tools` command builds the same graph into
`_import-graph.tmp.md`:

- It reads every file in the list matching `graph.sources` and collects each
  exported name.
- It drops names under 3 characters (they match everything) and searches for at
  most 400 names.
- It runs one [ripgrep](https://github.com/BurntSushi/ripgrep) search over files
  matching `graph.searchGlobs` for whole-word uses of those names.
- For each export it lists the files that mention it, up to 40, and lists
  exports nobody else mentions under **No call sites found**.

The graph matches names, not imports, so it is a lead for reviewers, never a
verdict. **It needs `rg` installed.** Without it, the graph report says the
generator failed and reviewers search for callers themselves.

## Posting to GitHub

With `githubReview: true`, `/code-review pr` reviews the branch as normal, then
posts the findings as a **pending** GitHub review — visible only to you until
you submit it. The skill:

- writes the report to disk before posting anything, so a failed post never
  loses the review
- posts findings on changed lines as inline comments, and lists findings on
  unchanged lines in the review body, one line each — GitHub rejects the whole
  review if one comment points at a line outside the diff
- caps inline comments at 60, since large reviews fail to submit
- uses the four-line summary the script returns as the review body, set when the
  review is created, and nothing more
- never submits the review. When you say submit, it asks which event — request
  changes, comment or approve — and leaves the body as it is

How to post without tripping GitHub's rate limits — create the review with one
request, then add each later comment one at a time — is in the generated
`<rulesDir>/pr-reviews.md`, which the skill follows.

## Errors sync can give you

`sync` and `check` refuse to run, naming the file and the problem, when:

| Problem                                                         | Fix                                                                              |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| A lens names a skill that has no `<skillsDir>/<skill>/SKILL.md` | Create the skill, fix the name, or set `skill: null`                             |
| A lens sits in no bundle                                        | Add it to a bundle's `lenses`, set its `bundle` field, or remove it with `false` |
| A lens is in two bundles                                        | Take it out of one                                                               |
| Two bundles use the same key                                    | Rename one, or merge their lenses into one bundle                                |
| A bundle or split names a lens that does not exist              | Fix the name, or define the lens                                                 |
| A split names a lens outside its bundle                         | Add the lens to the bundle's `lenses` too                                        |
| A split leaves a bundle's lens out, or names one lens twice     | Put each of the bundle's lenses in exactly one part                              |
| A lens route that could never fire                              | Give it `always`, a non-empty `paths` or `coverage`, or a `judgment`             |
| A regex with the `g` or `y` flag                                | Drop the flag                                                                    |
| `splitOrder` names a bundle without a `split`                   | Remove it from `splitOrder`, or give the bundle a `split`                        |
| An unknown key anywhere                                         | The message lists the allowed keys                                               |
| A value of the wrong type                                       | Routes take regexes, prompts take strings, `false` only removes built-in lenses  |
| A prepass tool reuses a key, or uses a reserved one             | Rename it                                                                        |

A skill this package writes on the same `sync`, such as `dead-code`, counts as
present. The skill-exists check matters most. Without it, a mistyped skill name
would mean the reviewer quietly reviews from general knowledge instead of your
conventions, and nothing would tell you.

## A complete example

```js
export default {
  files: {
    code: /\.(ts|tsx|js|mjs)$/,
    tests: /\.test\.tsx?$/,
    targetExtensions: ['ts', 'tsx', 'sql', 'md'],
  },

  prepass: {
    tools: [
      {
        key: 'tsc',
        label: 'TypeScript errors',
        command: 'npx --no-install tsc --noEmit',
      },
      { key: 'lint', label: 'ESLint output', command: 'npm run lint' },
    ],
  },

  lenses: {
    security: { skill: 'security' },
    'dead-code': { skill: 'dead-code' },
    ci: false,
    'api-routes': {
      skill: 'api-routes',
      title: 'API Routes',
      route: { paths: [/^src\/app\/api\/.*\/route\.ts$/] },
      judges:
        'Route handlers as thin adapters — auth first, then validation, then one service call, returning the standard envelope.',
      bundle: 'database',
    },
  },

  prompts: {
    layerChain: 'route -> service -> data access',
    coverageLocation: 'the `.test.ts` file beside each source file',
  },
};
```

The configs that reproduce Curricular's and Sales harness's reviews in full are
in [`test/fixtures/review/`](../test/fixtures/review/) — the most complete
examples of custom lenses, bundles and splits.
