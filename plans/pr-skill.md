# Plan: the PR skill in `@euanmsm/skills`

> **Built.** How it works now is in
> [`packages/skills/docs/pr.md`](../packages/skills/docs/pr.md). Two things
> changed from this plan: `base` takes `'branch'` or `'stack'`, and the gate
> workflow runs the pinned package with `npx` instead of checking out `main`.

## Goal

Curricular (`.claude/skills/pull-requests/`) and Sales harness
(`.agents/skills/pr/`) each keep their own copy of the PR skill. It creates the
pull request and a Manual QA checklist whose steps have been checked against the
code. This plan does two things:

1. **Makes it fast.** A full run currently takes about 23 minutes, and up to 54.
   The target is about 10 minutes for a typical Curricular branch, with the same
   checklist quality.
2. **Makes it shareable.** The skill moves into `@euanmsm/skills` and is set up
   per repository in `.devkit/pr.mjs`. It works the same way as the code review:
   the package holds the engine and all of the prompt wording, and a repository
   writes down only what belongs to it.

## What the two copies are today

Each copy has three files:

| File                | Job                                                                                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SKILL.md`          | The steps the main agent follows: resolve the base branch, save the diff, run the workflow, fill the PR template, open the PR, post the checklist comment |
| `pr-qa.workflow.js` | The multi-agent script that writes the summary and the checklist                                                                                          |
| `TRAPS.md`          | Hand-written ways a manual step can look right and test nothing. Every verifier reads it                                                                  |

Curricular also has `.github/workflows/pr-manual-qa.yml` and
`scripts/ci/manual-qa.mjs` (558 lines). Together they form the QA gate: every
push un-ticks the checklist, and a `Manual QA` commit status stays red until the
boxes are ticked again. Sales harness has no gate yet. It is the
`manual-qa-gate` item in that repository's own TODO.

**The two workflow scripts are the same engine.** After both files are formatted
the same way and compared line by line, every difference is data:

- layer names and path patterns
- who acts in the system (teacher and student, against the worker loop and the
  API caller)
- "user-visible" against "operator-visible"
- the cross-cutting dimensions
- the boot, reset and stop commands
- the Local CI tickboxes
- Curricular's extra Storybook section

The control flow, the output shapes and the assembly code are identical.

## How the workflow runs today

The workflow has five phases, and each phase waits for the one before it to
finish:

1. **Explore.** One agent writes a "context pack" to a file. The pack is a map
   of the branch that every later agent reads. A second agent lists the UI
   surfaces.
2. **Inventory.** Agents run in parallel, one per layer plus one "cross-cutting"
   agent. Each lists the behaviours the branch changes.
3. **Audit.** Two agents look for behaviours the inventory missed. One walks
   every hunk; the other checks every dimension.
4. **Draft.** Agents write the backend section, the frontend or TUI section, the
   Storybook section, the boot block and the summary.
5. **Verify.**
   - Every step goes to a verifier, which checks it against the code. A failed
     step is rewritten and verified again, up to four rounds.
   - Every "covered by test" claim is checked against the test it names.
   - A claim that fails is turned into a new step (a "convert"), and that step
     is then verified.

Every agent runs on Opus.

## Where the time goes

The timings come from real runs, taken from the session transcripts and from the
Workflow tool's per-agent records (`workflows/wf_*.json`).

| Repository    | Full runs | Median total | Range      | Share spent inside the workflow |
| ------------- | --------- | ------------ | ---------- | ------------------------------- |
| Curricular    | 12        | 23 min       | 10–46 min  | 88–96%                          |
| Sales harness | 2         | —            | 24, 54 min | 95%+                            |

A branch with no runtime changes runs only the summary agent and takes under 2
minutes, so it is not a problem.

Tool calls add up to about 10% of each agent's time. Verifiers only read and
search code, and no single tool call took more than 30 seconds. **Nearly all of
the wall-clock time is Opus thinking, in a chain where each agent waits for the
one before it.** So the fix is mostly about ordering, not about faster tools.

The biggest causes, largest first:

1. **Conversions run one at a time, and only at the very end.**
   - The script converts failed claims in a `for … await` loop. Each conversion
     waits for the previous one to finish, including all of its verify rounds.
   - Conversions also cannot start until every step has finished verifying, even
     though the claim checks themselves are done within about a minute.
   - Cost: 22 of the 52 workflow minutes in the Sales run of 26 Sep, and 20 of
     the 46 minutes in the worst Curricular run (`da991a79`).
   - This is a bug. Nothing depends on the conversions running in order.
2. **Rewrite chains.** Four rounds of verify, rewrite and verify again take 7–8
   minutes. The slowest single step decides how long the whole Verify phase
   takes.
3. **One agent drafts every backend step.**
   - It takes 2–12 minutes and up to 83 tool calls.
   - Nothing can be verified until it finishes. In one run the boot block, the
     summary and the TUI section had been ready for 7.7 minutes before it did.
   - In the Sales run it also ran commands against the live database and Docker,
     and started the service on port 3999. That breaks the rule that this
     workflow only reads code.
4. **The context-pack agent** runs alone for 1.5–8 minutes, and every later
   agent waits for it.
5. **Queueing.** Workflows are capped at 12 agents at a time. The largest runs
   spent up to 40 agent-minutes waiting in the queue.
6. **After the workflow.**
   - In 8 of the 12 Curricular runs, the main agent's first attempt to read the
     workflow's result failed, and it had to try again.
   - The Sales checklist came to 67,310 characters, over GitHub's
     65,536-character limit for a comment. The main agent had to cut it down by
     hand.

Critical path of the 52-minute Sales run: context pack 5 min → cross-cutting
inventory 2.6 min → audit 3.2 min → backend draft 9.8 min → one step's four
verify rounds 9 min → the serial conversions 22.5 min.

## Part 1 — Making it faster

Each change below either only changes the order agents run in, which cannot
lower quality, or is marked as an experiment to be measured before it becomes
the default.

### 1.1 Start conversions as claims fail, and run them together (ordering)

Each claim becomes its own short chain: check the claim; if it fails, draft a
step; verify that step. All of these chains run at the same time as the main
verification, rather than after it.

**Saves** 5–20 minutes on any run with a failed claim. The output is identical.

### 1.2 Verify each draft as soon as it lands (ordering)

The workflow's `pipeline()` helper replaces the Draft→Verify barrier, so each
draft's steps go to verifiers the moment that draft returns. The frontend and
TUI sections, the Storybook items and the boot block no longer wait for the
backend draft.

Verifiers are given the boot block as drafted, not as verified. That is what
happens today too.

### 1.3 Start the summary and the boot block early (ordering)

The summary needs only the diff and the pack. The boot block needs only the
pack. Neither uses the inventory, so both start as soon as the pack exists
instead of waiting for the Draft phase.

### 1.4 Split the backend draft (ordering)

After the audit, backend entries are split into groups of about 8. Entries for
the same file or layer stay together, so related steps are written by one agent.
Each group gets its own drafter, and all of them run in parallel.

Two parts that each drafter used to write by hand move into the script, so that
separate drafters cannot disagree:

- **The section timing line.** Each drafter returns a minutes estimate for each
  of its steps, and the script writes the line from their total.
- **Step numbering.** The script numbers every step, blocking steps first. It
  already does this today.

Every drafter prompt gains one explicit rule: **never run a command.** Drafting
and verification only read code.

### 1.5 A prepass for the facts that don't need a model

`npx skills pr prepass` runs before the workflow, just as `skills prepass` does
for code review. It writes these files to the scratch folder:

- one patch file per changed file
- the changed files, sorted into layers using the config's path patterns. This
  replaces the table the main agent currently matches paths against by hand.
- the test files that sit beside each changed file, found with the config's test
  globs
- the files that import each changed component, found with `rg`
- the paths to the seed, fixture and env files the config lists
- the story files for changed components, when Storybook is on

The context-pack agent is given these facts instead of rediscovering them. Its
job shrinks to reading and describing the code. That is where its 30–64 tool
calls currently go.

### 1.6 Use the right model for each job (small quality risk; measure it)

| Job                                                          | Model  |
| ------------------------------------------------------------ | ------ |
| Context pack, inventory, audit, drafting, first verify round | Opus   |
| Claim checks, Storybook items, summary, surfaces list        | Sonnet |

A claim check is one question: "does this test assert this?" The summary is
short prose with fixed rules. Neither needs Opus.

### 1.7 Check step format in code before a verifier sees it

Check 8 of the verifier's eight checks is format: Setup, command, Expect, If
wrong and Teardown, in that order, with commands in fenced blocks and no
rationale paragraphs. Most of that can be checked with plain code.

The script checks every step before each verify round, and passes any format
failures to the verifier as known findings. A step that fails _only_ on format
gets a quick Sonnet fix, not a full Opus round.

### 1.8 Queue order

When agents are queued, the ones on the critical path go first: drafters and
first-round verifiers before claim checks. Claim checks are quick and can stand
to wait.

### 1.9 Experiments, measured against the baseline

These change what agents do, not only when they run, so they ship behind config
switches. Each becomes the default only once a side-by-side comparison shows no
loss (see Verification):

- **Narrower rounds after the first.** Round 2 onwards checks only that the
  rewrite fixes the problems it was given and adds no new ones, rather than
  running all eight checks again. That makes Sonnet a possibility for those
  rounds. The four-round cap stays.
- **Drop the cross-cutting inventory agent.** It asks the same questions as the
  "dimensions" audit, which runs straight after it and can only add entries.
  Removing it takes the slowest inventory agent off the critical path.

### 1.10 A command that publishes the result

`npx skills pr publish <result.json>` does everything steps 3–6 of `SKILL.md` do
today as a chain of shell and Python snippets:

- fills the summary into the PR template, at its marker
- creates the PR as a draft, or edits the one that is already open
- reads the head commit from GitHub, not from local git
- adds or updates the checklist comment, found by the marker at the start of its
  first line
- deletes its temporary files

It also handles GitHub's 65,536-character comment limit. A checklist over about
60,000 characters is split at section boundaries into continuation comments,
each marked `<!-- pr-qa:manual-checklist:part=N -->`. The gate counts the boxes
in every part.

`SKILL.md` gives one exact command to save the workflow's result to a file, so
the main agent no longer has to guess how to read it. How the Workflow tool
exposes its return value needs checking during implementation.

### Expected effect

These are estimates, rebuilt from the recorded per-agent timings with each
change applied. The simulation in Verification will replace them with measured
numbers.

| Run                             | Today  | With 1.1–1.8 |
| ------------------------------- | ------ | ------------ |
| Curricular median               | 23 min | ~10 min      |
| Curricular worst (`da991a79`)   | 46 min | ~15 min      |
| Sales, 26 Sep (6 failed claims) | 54 min | ~20 min      |

## Part 2 — Making it shareable

### What a repository writes

`.devkit/skills.json` switches the skill on:

```json
"pr": { "config": ".devkit/pr.mjs", "qaGate": true }
```

The skill is always called `pr`, so it runs as `/pr` in every repository. There
is no option to rename it. When Curricular adopts the package, its
`pull-requests` folder is deleted, and every mention of `/pull-requests` changes
to `/pr`. That includes `.claude/CLAUDE.md`, the PR template's helper comment,
and the gate workflow's header.

| Option   | Default          | What it does                                                            |
| -------- | ---------------- | ----------------------------------------------------------------------- |
| `config` | `.devkit/pr.mjs` | The path to the JS module config                                        |
| `qaGate` | `false`          | Also writes the GitHub workflow that resets the checklist on every push |

`baseBranch` comes from the shared settings, as it does for the other skills.

`.devkit/pr.mjs` holds everything that belongs to the repository. Every key is
optional apart from `layers`. This is roughly Curricular's config:

```js
export default {
  // How the base branch is chosen: 'main', or 'stack' to target the branch
  // below this one in a `gh stack`.
  base: 'stack',

  // Changed paths sorted into layers. `section` is the checklist section a
  // layer's steps belong to; one path may match several layers.
  layers: [
    {
      key: 'dataModel',
      title: 'Data Model',
      paths: [/^supabase\/migrations\//],
      section: 'backend',
    },
    {
      key: 'dataAccess',
      title: 'Data Access',
      paths: [/services\/_data-access\//],
      section: 'backend',
    },
    {
      key: 'service',
      title: 'Service',
      paths: [/lib\/features\/[^/]+\/services\//],
      section: 'backend',
    },
    {
      key: 'api',
      title: 'API',
      paths: [/^apps\/main\/src\/app\/api\//],
      section: 'backend',
    },
    {
      key: 'frontend',
      title: 'Frontend',
      paths: [/\/app\/\((teacher|auth|public)\)\//, /\/_components\//],
      section: 'frontend',
    },
  ],

  // The checklist sections a person runs. The backend section is built in.
  sections: {
    frontend: {
      title: 'Human Frontend Checks',
      surface: 'a page and route, and the state it must be in',
      firstStep:
        'signing in with the one seeded account that reaches every page',
      coveredBy: 'an e2e spec or a story play function',
    },
  },

  // Who can act in the system. Inventory entries name one or more.
  actors: ['teacher', 'student', 'school admin', 'super admin'],

  // Dimensions added to the built-in list.
  dimensions: {
    tenancy: 'organisation-scoped data needs a cross-organisation negative',
    'production parity': 'dev against `npm run build`',
  },

  // Things a verifier must check can intercept a step first, and the
  // identifiers it must confirm exist, added to the built-in lists.
  verify: {
    masking: ['middleware', 'TanStack Query caching'],
    identifiers: ['story titles and exports'],
  },

  boot: {
    start: ['npm run supabase:start', 'npm run supabase:reset', 'npm run dev'],
    stop: 'npm run supabase:stop',
    variables: {
      PORT: 'the dev server port, from the worktree scripts',
      DB_CONTAINER: 'the Supabase database container',
      TOKEN: 'a bearer token minted for the seeded teacher account',
    },
    read: ['supabase/seed*', 'apps/main/.env.example'],
  },

  tests: [/\.test\.tsx?$/, /\.api\.test\.ts$/, /\.spec\.ts$/],

  // 'auto' turns the Storybook section on when Storybook is installed.
  storybook: 'auto',

  localCi: [
    'Review agents (run locally before merge)',
    'Full test suite passes (unit, integration, API, e2e — run locally)',
  ],
  localCiNote:
    'Storybook tests are dispatch-only: `gh workflow run pr-main.yml --ref {{branch}}`.',

  traps: '.claude/skills/pr/TRAPS.md',
  template: '.github/pull_request_template.md',
};
```

Sales harness would set `base: 'main'` and its own layers (`packages/shared/`
matching both Service and TUI), with a `tui` section whose surface is "a screen,
the command that reaches it, and the API endpoint behind it". Its actors would
be the worker loop, API caller, TUI operator and inbound webhook, and it would
add the idempotency, events and error-classification dimensions. It would also
set `storybook: false`.

### What the package ships

- **The engine.** One `pr-qa.workflow.js`, taken from the shared structure of
  both copies with the Part 1 changes applied. `sync` injects the resolved
  config the same way it does for the code review, so the Workflow tool still
  gets one self-contained file at a fixed path.
- **Every prompt, in generic wording:**
  - the step format
  - the eight verifier checks
  - the audit angles
  - the summary rules
  - the drafter and verifier prompts

  Config values are filled in where a prompt names repository things: actors,
  layer names, what a surface is, and boot variables. The small pieces of
  wording a repository might want to change are named prompt slots, as in the
  code review.

- **The built-in dimensions:** callers who must be rejected, regression of the
  old behaviour, failure paths, data volume, concurrency, configuration read at
  use. A repository adds to the list, or turns one off with `false`.
- **The built-in backend section:** terminal-only checks, and the only section
  that can resolve an entry with a "covered by test" claim.
- **The built-in Storybook section:** one item per story, giving its title, the
  exports worth opening and one line on what to eyeball. It is detected from
  `storybook` in `package.json`, the way code review detects knip.
- **`SKILL.md` from a template.** The base-branch step is chosen by `base`, with
  the `gh stack` detection only when it is `stack`. The skill runs
  `npx skills pr prepass` and `npx skills pr publish`. With `qaGate` off, a line
  explains that the markers are there for a future gate.
- **A starter `TRAPS.md`**, written only when the file named by `traps` does not
  exist yet. `sync` never owns or overwrites it, because it is knowledge the
  repository earns over time.
- **The QA gate**, when `qaGate` is on:
  - `sync` writes `.github/workflows/pr-manual-qa.yml`.
  - Its jobs run `npx skills qa-gate reset` and `npx skills qa-gate status`.
    Curricular's 558-line `scripts/ci/manual-qa.mjs` moves into the package.
  - The workflow keeps Curricular's rule of checking out `main`, so a PR cannot
    change the script that gates it. With the script in the package, that
    becomes: the version comes from `main`'s lockfile.

### Validation

`sync` and `check` stop with a message naming the problem when:

- a layer names a section that does not exist
- a section has no layer pointing at it
- `traps` or `template` points at a file that is missing
- the PR template has no `<!-- pr-qa:summary -->` marker
- any key is unknown, or any value is a function

## Files

All paths are under `packages/skills/`.

| Path                                           | What it holds                                                                                   |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `src/pr/defaults.mjs`                          | Built-in dimensions, sections, verifier checks and prompt slots                                 |
| `src/pr/config.mjs`                            | Loading, merging and validating `.devkit/pr.mjs`                                                |
| `src/pr/prepass.mjs`                           | `skills pr prepass`                                                                             |
| `src/pr/publish.mjs`                           | `skills pr publish`                                                                             |
| `src/pr/gate.mjs`                              | `skills qa-gate reset\|status`, ported from Curricular                                          |
| `src/pr/cli.mjs`                               | Argument handling for the three commands                                                        |
| `src/skills.mjs`                               | The `pr` registry entry                                                                         |
| `templates/pr/SKILL.md`                        | The skill                                                                                       |
| `templates/pr/pr-qa.workflow.js`               | The engine                                                                                      |
| `templates/pr/TRAPS.md`                        | The starter traps file                                                                          |
| `templates/pr/pr-manual-qa.yml`                | The gate workflow                                                                               |
| `pr.example.mjs`                               | A small generic starting config                                                                 |
| `docs/pr.md`                                   | How the skill runs, and every option                                                            |
| `test/pr.test.mjs`                             | Config, prepass, publish, gate and the generated workflow                                       |
| `test/fixtures/pr/curricular.mjs`, `sales.mjs` | The configs that reproduce each repository's current skill, which become their adoption configs |

`sync.mjs`'s `generatedOnDisk` also scans `.github/workflows/` for generated
files when the gate is on.

## Verification

1. **Parity.** Use the stub harness from the code review (`test/workflow.mjs`).
   Run the old and the new engine for each repository on the same inputs, with
   canned agent results:
   - one branch touching both backend and frontend, one backend-only, and one
     with failed claims
   - check that the same agents run and that the checklist assembles the same
     way from the same results
   - compare prompt wording, and account for every difference
2. **Timing simulation.** Feed the recorded per-agent durations from the Sep 26
   Sales run and the Curricular runs `da991a79` and `832c3a1b` into the stub
   harness, respecting the 12-agent cap. Compare the simulated wall clock of the
   old order against the new one. This measures Part 1's ordering gain before
   any real run.
3. **Committed tests:**
   - config merging and every validation error
   - prepass layer sorting, test-file discovery and importer lists
   - publish:
     - template filling
     - the marker must start the comment
     - comments longer than the limit are split
     - it picks create or edit correctly, using a stubbed `gh`
   - gate reset and status counting boxes across comment parts
   - the generated workflow runs under the stub harness with each fixture
4. **Real runs.** Re-run the skill on two recently merged branches from each
   repository, one of them with failed claims. Compare old and new side by side:
   - wall-clock time
   - number of steps and gaps
   - which inventory entries were covered
   - reading every step for quality

   The experiments in 1.9 are judged the same way: on for one run, off for the
   other.

5. `npm test`, `npm run format:check` and `npx terse scan packages/skills`.

## Order of work

1. **Port and generalise with no change in behaviour.** Build the engine, the
   config, the fixtures and the `SKILL.md` template. Parity passes against both
   repositories' current scripts.
2. **The ordering fixes (1.1–1.4, 1.8).** Prove them with the timing simulation.
3. **Prepass, publish and model choice (1.5–1.7, 1.10).**
4. **The QA gate (`qaGate`).**
5. **Real runs and the 1.9 experiments.** Keep each experiment only if the
   side-by-side comparison holds up.
6. **Docs, changeset, and a TODO update.** Adoption in both repositories stays
   part of the existing adoption item.

## Open decisions

- **Rounds after the first (1.9).** Narrower checks on Sonnet are the one change
  that could let a bad step through. The plan measures it before deciding,
  rather than shipping it straight away.
- **Dropping the cross-cutting inventory agent (1.9).** The same approach:
  measure first.
- **Continuation comments over the limit (1.10).** The alternative is to fail
  and ask the author to split the PR. Splitting keeps the whole checklist, at
  the cost of a small change to the gate.
