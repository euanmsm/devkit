# pr

Opens a pull request with two things written for it: a short summary, and a
**Manual QA checklist** whose every step has been checked against the code by an
agent trying to prove it wrong. The checklist goes in a PR comment, not the
body, so a push can clear it.

This page explains exactly how a run works, then every setting that changes it.

- [Running it](#running-it)
- [The words this page uses](#the-words-this-page-uses)
- [How a run works](#how-a-run-works)
- [Why it is faster than the hand-written copies](#why-it-is-faster-than-the-hand-written-copies)
- [Configuring it](#configuring-it)
- [The PR config, key by key](#the-pr-config-key-by-key)
- [The QA gate](#the-qa-gate)
- [Experiments](#experiments)
- [Errors sync can give you](#errors-sync-can-give-you)

## Running it

```
/pr
```

It takes no arguments. The PR's title is always the branch name, new PRs are
always opened as drafts, and an open PR is edited rather than duplicated. The
skill is called `pr` unless the `name` option says otherwise; this page writes
`/pr` for whatever it is called.

## The words this page uses

- **Section** — one part of the checklist. Every repository has the **backend**
  section: terminal checks an agent could run, such as SQL and curl. A
  repository adds **human** sections for what needs a person, such as Frontend
  (a browser) or TUI (a terminal UI). A human section can be **split**: steps an
  agent can run in a browser go under one heading, and only the steps that need
  a person's judgement stay under the other.
- **Layer** — a group of paths, such as migrations or API routes. Each layer
  belongs to one section; a changed file in that layer switches the section on.
- **Entry** — one behaviour the branch changes, found by the inventory. Every
  entry ends up as a step, as a claim that an automated test already covers it,
  as a gap, or as a report note saying why it went. None are dropped silently.
- **Unit** — anything that gets verified: a step, a claim, a section's setup, a
  deploy check, the boot block, or a Storybook item.
- **Checker** — one verifying agent. It is handed up to 8 units at once and
  gives a verdict for each.
- **Claim** — "entry X is covered by test Y". Each is checked. One that holds is
  cited on the section's Covered by line; one that does not is reported to the
  author as a test gap for code review, not turned into a manual step.
- **Triage** — the first, cheap look at the diff: whether it is a pure move,
  tooling only or a behaviour change, how big it is, what it needs running, and
  what it depends on outside the repository.
- **Traps file** — the repository's own list of ways a manual step can look
  right and test nothing. Every verifier reads it.

## How a run works

The skill does three things, and the model only thinks in the middle one.

### 1. The prepass — `npx --no-install skills pr prepass --scratch <dir>`

A script, not an agent. It:

1. Finds the base branch: `--base <branch>` when given, otherwise the branch's
   parent. That is the base of its open PR, the branch below it in a `gh stack`,
   or the parent git recorded when it was created, and `baseBranch` only when
   none of those answers. A stacked PR is never opened against `baseBranch`, and
   its checklist never covers its parents' changes.
   [How the base branch is found](base-branch.md) has every rule. It fetches the
   base, then diffs against the local copy or `origin/<base>`, whichever the
   branch left later. It prints `base`, `baseSource` (how the base was found)
   and `baseWarnings`, and the skill tells you the first two before it goes on.
2. Stops with `"ahead": 0` when the branch has no commits over its base.
3. Writes the diff, one patch file per changed file, and a **facts file** to the
   scratch folder. The facts file lists:
   - the changed files sorted into layers, and the files in no layer
   - deleted files, and moved files with both paths and git's similarity score;
     a moved file also counts in its old path's layer, marked with where it
     moved to
   - the tests beside each changed file — same folder or a `__tests__` folder
     beside it, same name stem
   - the files importing each changed module (at most 30 per module), found with
     one ripgrep pass over the repository. A match counts only when its path
     leads to the file: a relative import must resolve to it, and an aliased or
     package import (`@/lib/utils`) must end in its folder and name, so one
     `utils` module does not collect every other module's importers
   - the stories for changed components and their `title:`, when Storybook is
     on. A story counts when it imports a changed file, wherever it sits, or
     when it sits beside the file with the same name stem; `storyMatch` picks
     one or both. Without ripgrep only the name match is left
   - the seed, fixture and env files matching `boot.read`
   - triage hints: what the touched layers need running (from their `touches`),
     whether every change is a near-identical move or an import rewired by one,
     and the `outsideRepo` questions a changed path answers yes
4. Prints the workflow's arguments as JSON: which layers and sections the branch
   touches, the triage hints, the paths above, the `headSha` it diffed, and how
   many agents may run at once.

Every agent reads the facts file, so none of them spends its first minutes
rediscovering these lists.

### 2. The workflow — `pr-qa.workflow.js`

`sync` generates this script with the repository's config written into it. The
Workflow tool runs it. It never runs a step and never touches the local stack:
every agent only reads code.

A branch touching no section gets a summary and a checklist of the line
`_No manual checks needed — no runtime surface touched._` plus the Local CI
boxes, and nothing else runs. The boxes are there so the gate's reset still
leaves something to tick after a push. The exception is a changed path the
prepass matched to an `outsideRepo` question, such as `vercel.json`: that branch
is triaged too, and keeps its deploy checks.

Otherwise a Sonnet triage agent runs first, beside the summary. It can only add
to the prepass hints: what the diff touches and which outside-the-repo questions
are yes. It answers the questions by number, so a reworded question still
counts. A `move` or `tooling` label must agree with the prepass's pure-move and
tooling hints; one they contradict is overruled to a behaviour change, with a
`triage` report note. A **tooling-only** diff then gets the same summary-only
checklist, plus any deploy checks. A **pure move** gets a sized boot block, at
most `budget.move` smoke steps (checked as steps that must behave as they do on
main), any deploy checks, and a Local CI box for the type check and build; none
of the stages below run. A **behaviour change** runs them all:

| Stage           | Agents                                                                                                  | Starts when               |
| --------------- | ------------------------------------------------------------------------------------------------------- | ------------------------- |
| Summary         | one, Sonnet                                                                                             | at once                   |
| Triage          | one, Sonnet                                                                                             | at once                   |
| Surfaces        | one per touched human section: every place a person can see the change                                  | the triage is in          |
| Storybook draft | one, Sonnet, when Storybook is on and the branch has stories                                            | the triage is in          |
| Context pack    | one: a map of the branch every later agent reads                                                        | the triage is in          |
| Boot draft      | one, when the diff needs anything started or derived: only that; verified as soon as it is drafted      | the pack is written       |
| Deploy draft    | one, when the triage found anything outside the repo; verified as soon as it is drafted                 | the pack is written       |
| Inventory       | one for the backend, one per human section with a visible change, one for cross-cutting dimensions      | the pack is written       |
| Audit           | two: every hunk has an entry; every dimension is explored                                               | the inventory is in       |
| Prune           | one: merges entries that differ only by input or page, drops what main or a test already covers         | the audit is in           |
| Backend drafts  | one per group of up to 8 entries, grouped by file                                                       | the prune is in           |
| Human drafts    | one per group of up to 8 entries in each touched human section, grouped by file                         | the prune and boot are in |
| Verify          | one checker per 8 units of a draft, setup and claims included; later rounds re-check failures on Sonnet | **that draft is in**      |
| Duplicates      | one per section with two or more passing steps, Sonnet                                                  | every group is verified   |
| Traps           | one, Sonnet, when 3 or more steps failed round 1                                                        | every group is verified   |

The bold row is what makes it fast. Nothing waits for an unrelated agent: a
human section is verified while the backend is still being drafted.

The prune is the pipeline's one step that removes entries: the inventory and the
audits only add. It merges entries that are one behaviour with different inputs,
or one shared component on several pages; drops entries the old code would
satisfy too; and drops entries a test asserts, as claims checked like any other.
Ids it makes up are ignored, and an entry it does not mention is kept.

Every drafter is given the verified boot block, its share of the step budget,
and told to read the traps file. It returns its steps, its claims, its gaps, and
one `setup` and `teardown` for its share of the section, so the same SQL is not
repeated on every step. A step may rely on the setup but never on another step,
since steps are deleted, merged, cut and reordered after they are checked. The
first drafter of a human section opens its setup with the section's `firstStep`,
which works the same on main and so is never a step. Several drafters of one
section name what their setups create apart. Each step also carries an **On
main:** line, what a tester would see with the PR reverted, unless it needs a
person's judgement. Most first-round failures in recorded runs were the same
environment mistake repeated across steps — a variable the boot block never
defines, a rate limiter, mail that never reaches the local inbox — so drafting
against the real boot block and the known traps saves a rewrite and a re-check
for each of them.

Before a step reaches a checker, a script checks its format — an `Expect:` line,
labels in order, a fenced command in a terminal step, no per-step `Teardown:`. A
step that fails gets a quick Sonnet fix first, so an Opus round is not spent on
formatting.

Verification works in groups: one drafter's setup, steps and "covered by test"
claims, the pruner's claims, the deploy checks, the Storybook items, and the
boot block on its own. A claim is checked by the same checker as its group's
steps, since it is already reading that code: it passes when the named test
genuinely asserts the behaviour, and otherwise it becomes a test gap in the
report. Besides checking a step is reachable and its Expect line is what the
code returns, a checker deletes a step that would pass on the old code or whose
On main line matches its Expect line, deletes one a listed test already asserts,
and sends back one proved by a count from seed data, a long wait, a race timed
by hand, `grep -c` or a throwaway test file. Before a group starts, the workflow
logs how many units it has and how many checkers it will use. Round 1 hands each
checker up to 8 units with the full checks. The checker answers with a verdict
per unit id: `PASS`, `FAIL` with a rewrite in the same shape, or `DELETE` when
there is no accurate version. Round 2 takes only the units that failed, batch
them again up to 8 at a time, and use a narrower prompt: is every problem the
last round found fixed, and is nothing new unconfirmed? Round 2 always runs on
Sonnet, as do Storybook items; round 1 runs on Opus.

A unit's fate is one of:

- **pass** — it goes in the checklist. A step's priority and title are read back
  from its verified title line, so a checker that demotes or renames a step is
  heard. Storybook items render from their verified text.
- **deleted** — vacuous, covered by a test, or with no accurate version.
- **exhausted** — still failing after two rounds.
- **unverified** — the checker returned nothing, or its answer left the unit's
  id out.
- **duplicate** — the duplicate pass, seeing the whole section's passing steps
  at once, found it repeats another.
- **cut** — an if-time step cut to fit the budget.

Only passing steps reach the checklist. The others become `reportNotes`, each
with a `kind` and the reason, and exhausted and unverified ones are also named
in `unresolved`. The boot block and a section's setup are the exception: the
steps after them rely on them, so one that did not pass is published under a
visible warning instead.

After the duplicate pass, the budget is applied. The cap is `budget.small` or
`budget.large`, by the size the triage found, and the target is
`budget.minutes`. If-time steps are cut, longest first, until both fit. Blocking
steps are never cut; when they alone exceed the budget, a report note says by
how much.

When 3 or more steps failed round 1, a Sonnet agent reads the findings and the
traps file and returns `trapCandidates`: each mistake that broke at least 3
steps and the traps file does not already cover, with why it fails and what to
write instead. Publish prints them, and the skill offers to add them to the
traps file, so the next run's drafters avoid them.

An entry that lands in no drafted section, which happens when the backend
section is off and the entry is not visible, becomes a report note and is
logged, so nothing is dropped silently.

`gaps` holds only what a tester needs to know, such as a check that needs
production; each is published as one line under the checklist. Everything about
how the workflow got there goes in `reportNotes`, which publish prints and the
skill relays to the author, never to the PR.

The workflow returns
`{ summary, checklist, gaps, reportNotes, unresolved, trapCandidates, stats }`.
The checklist is laid out as: the triage line (kind, what it needs running,
estimated minutes), the boot block, the Deploy and Config Checks, the backend
section, each human section, Storybook items, the one-line gaps, how to stop the
stack, and the Local CI boxes. Each section opens with a timing line built from
the drafters' minute estimates, then its setup, its steps, its teardown and its
Covered by line.

#### Split sections

A human section with an `agent` half is still drafted and verified as one
section, but it is published under two headings. The drafter marks each step
`agent` or `human`:

- **agent** — every action and result is something an agent can do and read for
  itself. That means opening pages, clicking and typing, reading the page, its
  toasts and URL, and reading network requests and the console. It also covers
  running JavaScript in the page, and SQL or shell commands.
- **human** — the step needs a person's judgement: how it looks, how a flow
  feels, a real screen reader or device.

A step that needs both is split into two steps. The checker also checks each
step's runner, and it can move a step to the other half without failing it. A
step that comes back with no runner stays with the person.

The agent half comes first, with a timing line that opens with its `runs` text
(`_Claude in Chrome runs these. About 40 minutes; 14 of 16 steps are blocking. Paste what you observed under each step._`),
and then its `note`, when one is given, as a `> [!NOTE]` block. The human half
follows. Numbering runs on across the two headings, so with 14 agent steps the
first human step is `Frontend 15`. When one half has no steps, it says so in a
line rather than disappearing.

### 3. Publishing — `npx --no-install skills pr publish --result <file> --base <branch> --head <sha> [--set-base]`

A script again. `<file>` is the workflow's output file from its completion
notice; the bare result works too. `<sha>` is the `headSha` the prepass printed.
It:

1. Refuses a result whose summary is blank.
2. Puts the summary into the PR template where `<!-- pr-qa:summary -->` is.
3. Creates the PR as a draft against the base, or edits the open one. It leaves
   an open PR's base alone unless given `--set-base`, since one wrong base
   lookup would otherwise move a mid-stack PR. When the open PR's base differs
   from `--base`, it says so as `baseMismatch`, and the skill asks the user
   before moving it.
4. Reads the head commit from GitHub — not local git, because the gate checks
   the commit GitHub has — and refuses when it is not `<sha>`: with "push first"
   when the branch has commits GitHub lacks, or "commits landed on GitHub since
   then, so re-run /pr" otherwise. On an open PR this happens before the edit,
   so nothing changes.
5. Writes the checklist comment, editing the existing one so it keeps its place
   in the timeline. Only a comment whose author can push to the repository
   counts as the existing one. A checklist over 60,000 characters is split
   between sections into numbered comments (GitHub's limit is 65,536); parts no
   longer needed are deleted.

It prints the PR's URL, whether it was created, how many comment parts it wrote,
the unresolved units, the trap candidates, the number of tester gaps, the report
notes, and `baseMismatch`.

### The comment

```markdown
<!-- pr-qa:manual-checklist -->
<!-- pr-qa:sha=<40-character head commit> -->
<!-- pr-qa:banner:start -->
<!-- pr-qa:banner:end -->

## Manual QA — `<short commit>`

<the checklist>
```

The first marker must open the comment: a "Quote reply" copies the markers with
`> ` in front, and must never count as the checklist. A continuation comment
opens with `<!-- pr-qa:manual-checklist:part=2 -->` instead.

## Why it is faster than the hand-written copies

Across the recorded runs, the hand-written copies took a median of 23 minutes in
one repository and up to 54 in another. Almost all of it was agents waiting on
agents they did not need:

- Failed claims were converted one at a time, and only after every step had
  finished verifying — up to 22 minutes on its own.
- Nothing was verified until the one backend drafter finished, which took up to
  12 minutes while the other drafts sat ready.
- Every agent ran on Opus, and every agent rediscovered the test files and
  importers itself.

Replaying the 54-minute run's recorded agent times through both scripts, under
the same 12-agent cap, gives 51 minutes for the old ordering and 23 for this one
— with the same 33 steps, 6 conversions and 1 unresolved unit. That replay
counts no saving from the Sonnet agents or the facts file, and predates batched
verification.

### What verification costs

Verification used to start one Opus agent per unit per round, so a 40-step
checklist meant 40 checkers in round 1 and up to 160 over four rounds (the limit
then), each re-reading the traps file, the diff and the pack. With up to 8 units
a checker, the same 40 steps take one checker per drafter group, 6 in the test
fixture, plus one for the boot block. Later rounds cost one checker per 8
failing units, not one per unit. The count for each group is logged before it
starts, and the total is in `stats.checkerAgents`.

## Configuring it

In `.devkit/skills.json`:

```json
{ "skills": { "pr": { "name": "pull-requests", "qaGate": true } } }
```

| Option   | Default          | What it does                                                                                                        |
| -------- | ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| `name`   | `pr`             | The skill's folder and slash command: lowercase letters, digits and dashes                                          |
| `config` | `.devkit/pr.mjs` | Where the PR config lives                                                                                           |
| `qaGate` | `false`          | `true`, or an object of settings, also writes `.github/workflows/pr-manual-qa.yml`; see [The QA gate](#the-qa-gate) |

It also uses the shared `skillsDir` and `baseBranch` settings.

`sync` writes:

| File                                                      | When                                                 |
| --------------------------------------------------------- | ---------------------------------------------------- |
| `<skillsDir>/<name>/SKILL.md`                             | always                                               |
| `<skillsDir>/<name>/pr-qa.workflow.js`                    | always                                               |
| the traps file (`<skillsDir>/<name>/TRAPS.md` by default) | only when it does not exist — it then belongs to you |
| `.github/workflows/pr-manual-qa.yml`                      | with `qaGate`                                        |

The traps file is the one file `sync` never overwrites, never deletes and never
reports as edited: its value is the traps your testers have hit, which only the
repository knows. `check` reports it only when it is missing.

It also needs the PR template, `.github/pull_request_template.md` by default,
with a `<!-- pr-qa:summary -->` line where the summary goes.

## The PR config, key by key

`.devkit/pr.mjs` is a JavaScript module, so path patterns stay real regexes.
Only `layers` is required. Start from [`pr.example.mjs`](../pr.example.mjs);
fuller configs are in [`test/fixtures/pr/`](../test/fixtures/pr/).

### `layers` (required)

```js
layers: [
  { key: 'api', title: 'API', paths: [/^src\/app\/api\//], section: 'backend' },
  { key: 'ui', title: 'Frontend', paths: [/^src\/app\/\(app\)\//, 'src/components/'], section: 'frontend' },
],
```

A path is a regex, or a string matched as a prefix. A file may match several
layers — a package both sides depend on can switch on the backend and a human
section at once. Files matching no layer are listed in the facts file but switch
nothing on.

A layer may also say what a change in it needs running to test, with `touches`:
any of `database`, `api` and `page`. The triage starts from these, and the boot
block starts only what they need. A layer without `touches` is taken to need
what its section tests with: `database` and `api` for the backend section,
`page` for a human one.

```js
{ key: 'ui', title: 'Frontend', paths: ['src/components/'], section: 'frontend', touches: ['page'] },
```

### `sections`

The human sections, by key, plus optional overrides for the built-in backend
section. Every human section needs a layer pointing at it.

| Field            | Default                                                 | What it is                                                      |
| ---------------- | ------------------------------------------------------- | --------------------------------------------------------------- |
| `title`          | required                                                | The section heading, e.g. `Human Frontend Checks`               |
| `label`          | the key, capitalised                                    | What each step is numbered with, e.g. `Frontend 3`              |
| `where`          | `the running product`                                   | Where the person is: `a rendered page`, `a running terminal UI` |
| `audience`       | `a person using the product`                            | Who notices a change: `a signed-in user`                        |
| `surface`        | a place in the product, and the state it must be in     | What one surface is, for the surfaces agent                     |
| `surfacesBrief`  | none                                                    | Extra instructions for the surfaces agent                       |
| `inventoryBrief` | every noticeable surface, copy, states and interactions | The inventory agent's scope                                     |
| `firstStep`      | getting to the product as one seeded user               | What the section's setup opens with                             |
| `stepNames`      | where it happens and how to get there                   | What every step must name                                       |
| `coveredBy`      | `an end-to-end test`                                    | The automated tests a step there may be cited as covered by     |
| `agent`          | none                                                    | Splits the section in two, below                                |

`agent` is an object:

| Field   | Default                       | What it is                                                                               |
| ------- | ----------------------------- | ---------------------------------------------------------------------------------------- |
| `title` | required                      | The agent half's heading, e.g. `Agent-Runnable Frontend Checks`                          |
| `runs`  | `Claude in Chrome runs these` | Opens the agent half's timing line                                                       |
| `note`  | none                          | Shown as a `> [!NOTE]` under that line: how an agent runs these steps in this repository |

With `agent` set, `title` names the human half, e.g. `Human UI / UX Checks`.
[Split sections](#split-sections) covers how steps are divided.

The backend section's fields are `title`, `label`, `tools` (what its checks may
use), `scope` (its inventory scope) and `gapExamples` (why an entry may be out
of reach).

### `base`

No longer used; it is still accepted so older configs load, and you can delete
it. The base is always the branch's parent, `gh stack` included — see
[How the base branch is found](base-branch.md).

### `actors`

Who can act in the system; every entry names one or more. The default is a
signed-in user, an admin, an API caller and a background job.

### `dimensions`

The cross-cutting questions asked of every behaviour, by name. The built-ins are
`authorisation`, `regression`, `failure paths`, `data volume`, `concurrency` and
`configuration`. `regression` asks about behaviour the diff removes or changes
that a caller relied on, never for old behaviour that still passes on main. Add
your own, reword a built-in by giving its name, or remove one with `false`.

### `verify`

Three lists the verifier checks every step against, each added to the built-ins:

- `preconditions` — what changes a step's outcome (auth state, seeded rows,
  flags, cache, timing…)
- `masking` — what could intercept a step first (middleware, a guard, a cache, a
  retry, a rate limiter)
- `identifiers` — what must be confirmed to exist in the repository (account,
  route, env var, table, column…)

### `boot`

```js
boot: {
  start: [
    { run: 'npm run db:up', when: ['database'] },
    { run: 'npm run migrate', when: ['database'] },
    { run: 'npm run dev', when: ['api', 'page'] },
  ],
  stop: { run: 'docker compose down', when: ['database'] },
  variables: {
    PORT: { from: 'from .env', when: ['api', 'page'] },
    TOKEN: { from: 'a bearer token for the seeded admin', when: ['api'] },
  },
  read: ['supabase/seed*', '.env.example'],
},
```

`start` is the boot block's command list, and `stop` the line closing the
checklist. `variables` are what the boot block derives for the steps. Each may
be a plain string, which always applies, or carry `when`: the `touches` it is
needed for, with `when` left out meaning always. The triage decides what the
diff touches, and the boot block holds only what that needs; a variable that
applies gets a boot block even when no command does, and when nothing applies
there is no boot block at all. The older `backendOnly: true` still works on a
variable and means `when: ['database', 'api']`. `read` lists globs for the seed,
fixture and env files agents read real values from.

### `outsideRepo`

The questions every diff is asked about what it depends on outside the
repository. Each yes becomes a check in the Deploy and Config Checks section,
for someone with dashboard access, marked pre-merge or post-deploy. A
post-deploy check has no box: the gate holds the merge until every box is
ticked, and it cannot be done before merging.

```js
outsideRepo: [
  { ask: 'Does it change vercel.json or a Vercel project setting?', paths: [/(^|\/)vercel\.json$/] },
  { ask: 'Does it add an env var that needs a production value?', paths: ['src/lib/env/'] },
  { ask: 'Does it call an external service it did not call before?' },
],
```

A question with `paths` is answered yes by the prepass whenever a changed file
matches, and the triage cannot overrule that; the triage answers the rest from
the diff. Your list replaces the defaults, which ask about hosting config, new
env vars, hosted auth settings, migrations on production data and new external
services. `[]` asks nothing.

### `budget`

```js
budget: { move: 2, small: 8, large: 20, minutes: 30 },
```

The most steps a checklist carries for a pure move, a small change and a large
one, and the minutes a tester should need for all of it. Any key you leave out
keeps its default. Deploy checks and Storybook items do not count against it.

### `tests`

Regexes for test files. The default matches `*.test.*`, `*.spec.*` and anything
under `__tests__/`.

### `storybook`

`'auto'` (the default) turns the Storybook section on when `storybook` or any
`@storybook/*` package is installed. `true` or `false` forces it.

### `storyMatch`

Which stories count for a changed file: `'imports'`, a story that imports it
wherever the story sits; `'stem'`, a story beside it with the same name stem; or
`'both'` (the default).

### `localCi` and `localCiNote`

The Local CI boxes closing the checklist, and an optional line under them where
`{{branch}}` becomes the branch name.

### `traps` and `template`

The traps file (default `<skillsDir>/<name>/TRAPS.md`) and the PR template
(default `.github/pull_request_template.md`).

### `prompts`

Wording for passages that depend on the repository:

| Slot           | Used in                            | Default                                                                                          |
| -------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| `testKinds`    | the context pack's test inventory  | `unit, integration and end-to-end tests`                                                         |
| `exploreSteps` | extra bullets for the context pack | none                                                                                             |
| `auditCallers` | the hunk audit                     | every caller of changed code, and every surface a changed file shows up on                       |
| `bootCaveats`  | the boot block                     | a feature flag forced on in development, a setting seeded on boot, a production-build difference |
| `gating`       | the boot block                     | feature flags or settings gating the touched code                                                |

### `experiments`

See [Experiments](#experiments).

## The QA gate

With `qaGate` on, `sync` writes `.github/workflows/pr-manual-qa.yml`. It keeps
the checklist honest about which commit was tested:

- **On every push** it un-ticks every box outside a code block, restamps the
  comment with the new head commit, and writes a banner saying how many boxes
  the previous pass had ticked and against which commit. It keeps only the
  latest `> **Observed**` or `> **Failed**` note under each step, with any
  fenced output pasted under an older one going too. It also asks GitHub which
  files differ from the stamped commit, a force-push included, and the banner
  names every step citing one of them in backticks as possibly stale, with a
  suggestion to re-run the skill. A step stays named after later pushes until
  the skill redrafts the checklist.
- **On a push to a checklist with no boxes at all**, it leaves the stamp on the
  old commit and posts red with `checklist predates <sha>, re-run /pr`, so new
  code is never passed on a checklist nobody could tick.
- **On every tick** (an edit to the comment), and when a checklist comment is
  deleted, it recomputes the `Manual QA` commit status: red while any box is
  unticked or the stamp is not the head commit, green when every box is ticked
  against it.
- **By hand**, `workflow_dispatch` with a PR number re-evaluates a stuck check.

Only a checklist comment whose author can push to the repository counts: the
gate asks GitHub for each author's permission and trusts `write`, `maintain` and
`admin`. Anyone else who can comment could otherwise post a marked, pre-ticked
checklist and turn the gate green. It does not use the comment's
`author_association`, because with the workflow's `GITHUB_TOKEN` a private
organisation member shows there as `CONTRIBUTOR`.

Make `Manual QA` a required status check in the branch ruleset for it to block
merges. Drafts are not skipped, since `/pr` opens drafts. A fork's PR gets a
read-only token, so its reset is skipped and its check stays pending.

By default the jobs run
`npx --yes @euanmsm/skills@<version> qa-gate reset|status` on Node 22, with the
version pinned to the one that wrote the file. They need no checkout and no
install, and upgrading the package then re-running `sync` moves the pin. The
status messages name the skill by its `name`.

`qaGate` also takes an object, for a repository with its own Node setup or one
that does not run packages in CI from outside its lockfile:

```json
"pr": { "qaGate": { "nodeVersionFile": ".nvmrc", "install": "lockfile" } }
```

| Setting           | Default | What it does                                                                                                                                       |
| ----------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nodeVersion`     | `22`    | The Node version to set up                                                                                                                         |
| `nodeVersionFile` | none    | A file to read the version from instead, such as `.nvmrc`. Not with `nodeVersion`                                                                  |
| `install`         | `npx`   | `lockfile` checks out the default branch, runs `npm ci --ignore-scripts`, and runs the installed `skills` binary. The package must be a dependency |

Either setting that needs the repository's files checks out its default branch,
so a pull request cannot change what the gate runs.

#### Upgrading from a hand-written gate

A stale checklist with no boxes at all now fails with
`checklist predates <sha>, re-run /pr` instead of being restamped and passed.
This only shows up on old "no manual checks needed" comments from before the
switch: re-run the skill on those PRs.

## Experiments

One change that could affect quality ships switched off, to be measured side by
side before it becomes the default:

```js
experiments: { dropCrossCutting: true },
```

- **`dropCrossCutting`** — removes the cross-cutting inventory agent. The
  dimensions audit asks the same questions straight afterwards, and can only add
  entries.

## Errors sync can give you

| Message                                                        | Fix                                                     |
| -------------------------------------------------------------- | ------------------------------------------------------- |
| `layers must be a non-empty list`                              | Add at least one layer                                  |
| `layers[i] points at section "x", which does not exist`        | Add `sections.x`, or point the layer at an existing one |
| `section "x" has no layer pointing at it`                      | Point a layer at it, or remove the section              |
| `two layers use the key "x"`                                   | Give each layer its own key                             |
| `layers[i].paths[j] must not use the g or y flag` (or `tests`) | Drop the flag; the message gives the fixed regex        |
| `sections.x needs a title`                                     | Add a `title`                                           |
| `dimensions.x is false, but there is no built-in of that name` | Check the spelling                                      |
| `boot.variables.x must be an upper-case shell variable name`   | Rename it, e.g. `PORT`                                  |
| `….when must be a non-empty list of database, api, page`       | Use only those names, or leave `when` out for always    |
| `boot.variables.x sets both when and backendOnly; keep when`   | Delete `backendOnly`                                    |
| `budget.x must be a whole number above 0`                      | Give a positive whole number                            |
| `The PR template … does not exist`                             | Create it, or point `template` at yours                 |
| `The PR template … has no <!-- pr-qa:summary --> line`         | Add the line where the summary should go                |
| `unknown key "x" in …`                                         | Check the spelling against this page                    |
