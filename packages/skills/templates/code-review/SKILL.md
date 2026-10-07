---
name: {{name}}
description:
  "Deep multi-agent review of named files, a module, or a branch diff. Reviews
  by bundle, adversarially verifies every finding,{{^githubReview}} and{{/githubReview}} writes one report to
  tmp/code-reviews/{{#githubReview}} and can post it as a pending GitHub review{{/githubReview}}.
  Use when asked to review code or a branch before a pull request. Not for a
  quick look at one function."
user-invocable: true
---

{{marker}}

# Code Review

Reviews code in depth. You resolve what is under review, start a background
prepass, and **run a Workflow** that does everything else: routes the lenses
from the file list, reads the target once, runs one agent per bundle, hands
every finding to a verifier whose job is to _disprove_ it as soon as its bundle
lands, and composes **one** finished report.

{{#githubReview}}Two things vary. Everything between them is identical, which is why this is one
skill rather than two:

- **What goes in** — a branch diff, or named files as they stand
- **What comes out** — a markdown report always, plus comments on the pull
  request when you asked for a PR review

```
/{{name}}                     # current branch vs its parent branch → report
/{{name}} <path> [<path>...]  # a file, files, or a module → report
/{{name}} pr                  # current branch's PR → report + pending GitHub review
/{{name}} pr 793              # a named PR, with its branch checked out
```

Its GitHub review stays **pending** until you submit, so nothing lands on the
pull request unasked.
{{/githubReview}}{{^githubReview}}One thing varies. Everything else is identical:

- **What goes in** — a branch diff, or named files as they stand

```
/{{name}}                     # current branch vs its parent branch → report
/{{name}} <path> [<path>...]  # a file, files, or a module → report
```

The report is a markdown file on disk. Nothing is posted anywhere.
{{/githubReview}}
---

## 1. Resolve the input

No arguments{{#githubReview}}, or `pr`, or `pr <number>`{{/githubReview}} → **diff mode**. Any path → **target
mode**.

### Both, first

```bash
BRANCH="$(git branch --show-current)"          # empty on a detached HEAD
if [ -n "$BRANCH" ]; then
  BRANCH_LEAF="${BRANCH#*/}"                   # euanmadhar/add-invoices → add-invoices
else
  BRANCH_LEAF="detached-$(git rev-parse --short HEAD)"
fi
SCRATCH_DIR="tmp/code-reviews"
mkdir -p "$SCRATCH_DIR"
```

`SCRATCH_DIR` is relative to the current folder, which is where you and the
reviewers read it. The prepass works from the repository root, so every folder
handed to it below is prefixed with `$PWD` to land in the same place.

Shell variables do not carry over from one Bash call to the next. Run each
block below in the same call as the lines that set what it uses, or write
those values out literally.

### Diff mode
{{#githubReview}}
**`pr` first reads the PR**, so the review is of its head against its own base:

```bash
# `pr` alone reads the current branch's PR; `pr <n>` names one
read -r PR_NUMBER PR_HEAD PR_BASE <<< "$(gh pr view <n> --json number,headRefName,baseRefName \
  --jq '"\(.number) \(.headRefName) \(.baseRefName)"')"
```

Abort if there is no open PR — offer to run without `pr` instead. Abort if
`PR_HEAD` is not `BRANCH`:
`PR #<n> is on <PR_HEAD>, but <BRANCH, or a detached HEAD> is checked out.` Offer
to run `gh pr checkout <n>` and start again — otherwise the review would read
one branch and post to another PR. Then use `PR_BASE` as the base below, so a
stacked PR is diffed against the branch it merges into.
{{/githubReview}}
`TARGET` is the current branch, or `HEAD` when detached. The base is the
branch's **parent**, never `{{baseBranch}}` by default: a stacked branch is
reviewed against the branch below it, so its parents' changes stay out of the
review. `skills base` finds it — {{#githubReview}}`PR_BASE` in `pr` mode (left empty otherwise, which means "find
it"), else {{/githubReview}}the base of the
branch's open PR, the branch below it in a `gh stack`, or the parent git
recorded when the branch was created, and `{{baseBranch}}` only when none of
those answers. It compares against the local copy or `origin/`, whichever the
branch left later, so a copy that was never pulled does not add every commit
that landed upstream since:

```bash
TARGET="${BRANCH:-HEAD}"
BASE_VARS="$(npx --no-install skills base{{#githubReview}} --base "${PR_BASE:-}"{{/githubReview}})" && eval "$BASE_VARS" && BASE="$FORK"
echo "base: $BASE_BRANCH ($BASE_SOURCE) · ref: $BASE_REF · fork: $BASE"
```

It prints `BASE_BRANCH`, `BASE_REF` (the copy compared against), `FORK` (the
commit the branch left it at) and `BASE_SOURCE` (how it was found). If it exits
non-zero, stop and show the user what it printed: it names the problem, such as
being on `{{baseBranch}}` itself or a parent branch that is gone. Pass on any
`warning:` line it prints.

**Tell the user the base before going on**, for example
`Reviewing against cur-1722-login (PR #992)`. A wrong base is the one mistake
that makes a whole review wrong, so it must be visible before any agent starts.

**Check for uncommitted changes.** Diff mode reviews the commits, but the
agents and the tools read the files on disk, so edits not yet committed make
the patch, the file reads and the tool output disagree:

```bash
TREE_STATE="commit $(git rev-parse --short "$TARGET")"
DIRTY="$(git status --porcelain --untracked-files=all -- ":/" ":(exclude)$SCRATCH_DIR" | wc -l | tr -d ' ')"
if [ "$DIRTY" -gt 0 ]; then
  TREE_STATE="$TREE_STATE; $DIRTY uncommitted file(s) left out"
fi
```

When `DIRTY` is above zero, tell the user before going on: the review covers
the last commit, and the uncommitted files are not in the diff. A dead-code
report run against the base reads the working tree, so it does count them. Pass
`TREE_STATE` to the workflow, which prints it in the report header.

### Target mode

Parse the arguments into `TARGETS`. A directory expands to every source file
under it ({{targetGlobs}} where relevant) and sets `MODULE_TARGET`.

Write every target as a path from the repository root, the way `git diff` names
files in diff mode, since the prepass reads the list from there. A path typed
in a subfolder takes the prefix `git rev-parse --show-prefix` prints, which is
empty at the root.

Abort if: a path does not exist (name it); `TARGETS` is empty after expansion;
`TARGETS` is over 40 files — list what was found and ask the user to narrow.
**Never silently sample.**

## 2. Compute the diff (diff mode only)

Diffing from the merge base means the result is `TARGET`-only commits and
ignores anything landed on the base after the branch forked. `quotePath=false`
keeps a non-ASCII path as it is rather than quoted:

```bash
git -c core.quotePath=false diff --name-only "$BASE" "$TARGET"   # → CHANGED_FILES
git diff --stat "$BASE" "$TARGET"                                  # → DIFF_STAT
```

Abort if `CHANGED_FILES` is empty: `Branch has no changes vs <BASE_BRANCH>.`

**Split the patch per file.** Reviewers each need three files out of the diff,
so handing every agent one giant patch means loading it a dozen times over.
The prepass does it with one `git diff` rather than one per file:

```bash
PATCH_DIR="$SCRATCH_DIR/_patch/$BRANCH_LEAF"
npx --no-install skills prepass split --base "$BASE" --target "$TARGET" --out "$PWD/$PATCH_DIR"
```

It prints one line of JSON:
`{ patchDir, files, unnamed, patchLines, largeDiff }`. Each patch mirrors the
file tree — `src/a/b.ts` is at `$PATCH_DIR/src/a/b.ts.patch`. Take `LARGE_DIFF`
from `largeDiff` — it is the >4000-line test, already applied.

This runs in the **foreground**, because Recon reads `PATCH_DIR` the moment it
starts.

## 3. Launch the prepass — in the background

The configured tools ({{toolNames}}) and the import graph are independent of
each other and **nothing in Recon waits for any of them** — only the review agents do, and they do not start
for several minutes. So they run all at once, in the background, and disappear
into Recon's shadow instead of delaying it. Recon uses the import graph only
if it has already landed.

First clear the last run's sentinel and reports, so nothing can read them as
this run's. Then write the file list, launch, and **do not wait**:

```bash
rm -f "$SCRATCH_DIR/_prepass.done.json"
find "$SCRATCH_DIR" -maxdepth 1 -name '_*.tmp.*' -delete

cat > "$SCRATCH_DIR/_files.tmp.txt" <<'EOF'
<CHANGED_FILES in diff mode, TARGETS in target mode, written out one per line>
EOF

npx --no-install skills prepass tools --scratch "$PWD/$SCRATCH_DIR" --files-from "$PWD/$SCRATCH_DIR/_files.tmp.txt" --base "$BASE"
```

Run that line as it is in both modes. `BASE` is never set in target mode, and
an empty `--base` counts as none. In diff mode it lets a dead-code check
report what the branch newly left dead anywhere in the repository, not only in
the files it touched. A file the diff deleted is dropped from the list before
any tool sees it.

Use `run_in_background: true`. Then go straight to step 4 — **do not poll for
it, and do not read its output.** The review agents wait on it themselves.

The reports land in `$SCRATCH_DIR`: {{reportFiles}}. Each is renamed into place
only once its tool exits, so a file that exists is complete.
`_prepass.done.json` lands last and names each tool's `status` and `exitCode` —
that is the sentinel the reviewers block on, and it is why nothing here needs a
`sleep` in this session.

A tool exiting non-zero because it **found** something is the normal case, and
counts as `ok`. It is `failed` when the shell could not find or run it (exit
126 or 127), npm has no such script or package, it exits with a code the tool
reserves for its own errors, or a JSON tool exits non-zero without printing
JSON, and `timedOut` when it ran past 170
seconds — it is stopped and its report says so, so the sentinel always lands
before the reviewers' three-minute wait runs out.

A JSON tool's report is the JSON on its stdout, kept even when the tool failed,
so its own account of what went wrong reaches the reviewers. Its stderr goes in
its sentinel entry as `stderr`.

## 4. Run the Workflow

**Use the `Workflow` tool. Do not dispatch review or verification agents with
individual `Agent` calls.** Invoking this skill is the explicit opt-in the
`Workflow` tool requires, so do not stop to ask.

```
Workflow({
  scriptPath: "{{skillsDir}}/{{name}}/review.workflow.js",
  args: {
    mode: "diff" | "target",

    // diff mode
    target: TARGET, base: BASE,
    baseBranch: BASE_BRANCH, baseSource: BASE_SOURCE,   // printed in the report header
    changedFiles: CHANGED_FILES, diffStat: DIFF_STAT,
    patchDir: PATCH_DIR, largeDiff: LARGE_DIFF,
    treeState: TREE_STATE,          // printed in the report header

    // target mode
    targets: TARGETS, moduleTarget: MODULE_TARGET,

    // both
    branchLeaf: BRANCH_LEAF,
    scratchDir: SCRATCH_DIR,        // the script cannot shell out
    today: "<today's ISO date>",    // the script cannot call new Date()
    agentCap: AGENT_CAP,            // see below
    toolReports: {
{{toolReportArgs}}
      importGraph: `${SCRATCH_DIR}/_import-graph.tmp.md`,
      sentinel: `${SCRATCH_DIR}/_prepass.done.json`,
    },
  },
})
```

**`AGENT_CAP` is what lets the fat bundles split.** The workflow's concurrency
limit is `min(16, cores - 2)`, and the script cannot read the core count itself:

```bash
CORES="$(sysctl -n hw.ncpu 2>/dev/null || nproc)"
AGENT_CAP=$(( CORES - 2 > 16 ? 16 : CORES - 2 ))
```

Pass it and the fat bundles run as two agents each instead of one long
sequence of passes. Omit it and the script assumes 12.

It returns
`{ markdown, prBody, stats, bundlesRun, bundlesSkipped, bundlesSplit, bundlesDied, routingDecisions, lensesRun, lensesSkipped, packPath, suggestedPath }`.

`markdown` is the full report for disk.{{#githubReview}} `prBody` is the four-line PR review body
— see step 6.{{/githubReview}}

The workflow script is generated by `@euanmsm/skills` from
`{{configPath}}` — the bundle roster, the lens briefs and the repository's
prompt wording live there. Change the config and run
`npx --no-install skills sync`; never edit the script by hand. To re-run after a bad Recon call, pass
`resumeFromRunId` alongside the same `scriptPath`, optionally with
`args.areaOverrides: [{ key, note?, files?, lenses?, skip? }]` to patch one
bundle without forcing a full re-recon.

If the session's workflow size cap is below what the target needs, say so in
the summary rather than silently dropping bundles.

## 5. Write the report

`Write(result.markdown, result.suggestedPath)`.

Reports live under `tmp/code-reviews/`, never beside the code they review:

```
tmp/code-reviews/<branch>.tmp.md              # diff mode
tmp/code-reviews/<branch>-<target>.tmp.md     # target mode
```

Overwrite any existing report for the same target — a review is point-in-time,
not a log. Keep `tmp/` gitignored so it never reaches a commit.
{{#githubReview}}
## 6. Deliver to GitHub (PR mode only)

The report is on disk before anything is posted. A rate-limited or failed post
then costs you the delivery, never the review.

**Follow `{{rulesDir}}/pr-reviews.md`.** It holds the pending-review protocol
and it was learned expensively — one REST `POST` to create the review with its
first batch, `event` omitted so it stays `PENDING`, then every later comment
appended one at a time via `addPullRequestReviewThread`. Never
delete-and-repost. **Never submit** — the review waits until the user says so.

**Only "This branch" and "Carried over" findings go on the PR.** The report's
"Not this branch" section is for the author, not the PR: those problems predate
the branch, and posting them asks the PR to fix what it never touched. The
workflow's `prBody` already says how many there are.

Two constraints belong to this step:

- **A comment can only anchor to a line that appears in the diff.** A finding on
  an unchanged line rejects the whole `POST` with a 422. So split the findings:
  those on changed lines become inline comments, the rest go into the review
  body as one line each (see below). This is also why `/{{name}} <path>`
  never posts to a PR — a target review is not diff-scoped, so most of its
  findings sit on untouched lines.
- **Large reviews fail to submit** past roughly ninety comments. Cap inline
  comments at 60 and roll the overflow into the body the same way, rather than
  discovering the limit with the review already built.

### The review body is short

Every finding is already argued twice — once in its own inline comment, once in
the report on disk. The body is not a third copy. It exists to tell a reviewer
opening the PR how big this is and where to start, in the ten seconds before
they scroll to the comments.

**The workflow already wrote it.** Post `result.prBody` verbatim — four short
lines: the scale of the review, the severity counts, the `Read this first`
paragraph, and the report path. Do not rewrite it, do not expand it, do not
reword the paragraph it carries.

Nothing else goes in the body. Specifically banned:

- **The summary table.** It lives in the report. Listing the findings above the
  findings is the single worst thing you can do to a PR page.
- **Per-finding detail** — no quoting a comment, no restating its argument, no
  "the one to read properly is…". If a finding needs emphasis it gets it inline.
- **A themed walkthrough** grouping findings by shared cause. `Read this first`
  is that sentence, already written and already verified. Paste it; do not
  extend it.
- **Verification and lens statistics.** They go in the report and in what you
  tell the user in chat (step 7), never on the PR page.

The only permitted addition is the findings with no inline home — those that
could not be anchored, and those past the 60-comment cap. Append them to
`result.prBody`, **one line each**, under a bolded heading naming which case it
is:

```markdown
**Findings that could not be anchored** — these lines are not in the diff.

- **low · `path/to/file.ts:66`** — one sentence, then stop.
```
{{/githubReview}}
## {{presentStep}}. Present to the user

```
Code review complete — <n> files, <result.stats.reviewAgents> review agents, <result.stats.verifyAgents> verifiers.

Base: <BASE_BRANCH> (<BASE_SOURCE>)
Findings: This branch <n> · Carried over <n> · Not this branch <n><, n coverage gaps>   (from result.stats.byScope)
          <C critical / H high / M medium / L low> across all of them
Verification: <n> sent, <n> confirmed/amended, <n> refuted and dropped.

Report: <result.suggestedPath>
Context pack: <result.packPath>

Bundles run: <result.bundlesRun><, split: result.bundlesSplit>
Lenses that did not fire: <result.lensesSkipped>
```

If `result.stats.splitVerdicts` is above zero, add a line: that many findings
came back with two different verdicts because two bundles raised them, each was
kept unless every verifier refuted it, and the report says so at each one. Do not average that away in the summary
— a split verdict is the one place the review disagreed with itself.

If the report's **Not this branch** section has **Suggested Linear issues**,
list their titles and offer to create them as Linear issues, one per finding,
so each gets its own PR. Create them only if the user says yes, through the
Linear tools if they are connected (otherwise give the user the text to
paste). Never create them unasked.

If `result.bundlesDied` is not empty, add a line naming those bundles: their
reviewer returned nothing, so their lenses were not reviewed. If `DIRTY` was
above zero, say the review covers the last commit and left the uncommitted
files out.
{{#githubReview}}
In PR mode add the review URL and `Pending — not submitted.` When the user
later says to submit, ask which event — see `{{rulesDir}}/pr-reviews.md`.
{{/githubReview}}
If `result.stats.findings === 0` and `result.stats.coverage === 0`, lead with
`Clean — every finding was refuted under verification.` and say what was
checked.

**Read the lens table** in the report before presenting. If a lens shows
`Not reported back`, its bundle skipped that pass — say so rather than implying
the review covered it.

---

## Bundle Roster

**This section is generated from `{{configPath}}`**, the same config the
workflow script is built from, so the two cannot disagree.

### Routing is JS, not a prompt

Nearly every lens trigger is a path pattern, and a model evaluating path
patterns is both slower than JS and quietly fallible — a missed lens looks
exactly like a lens with nothing to say. So each lens carries a `route`, and
the workflow decides the whole mechanical half before Recon starts.

{{judgmentSection}}

Recon returns `addLenses` and `removeLenses` rather than the whole roster. Both
are logged and printed in the report under **Routing changed by Recon**, so a
lens switched off is a decision on the record rather than a silent gap.

**A lens with `coverage` paths fires on production code too**, in diff mode
only. A changed file with no test beside it fires the test lens, and the
absence of the test file is that lens's first finding.

### One agent per bundle, not per lens

A **lens** is one review domain. A **bundle** is a set of lenses sharing one
file scope, reviewed by one agent as sequential passes over the same code.

One agent per lens meant every lens re-read the same files. Bundling cuts the
number of reviewers to one per bundle, and it reads better: one agent holding
several briefs files each finding once, under the right lens, where separate
agents cannot see each other.

### …but the fat bundles split again when there is room

Bundling makes work **serial**, so the fattest bundle becomes the longest pole
in the run. A bundle carrying a `split` is broken into two agents, in split
order, but **only while slots remain**.

Reviewers get 60% of `agentCap`, not all of it. Verification runs alongside
review rather than after it, so both compete for the same slots — fill them all
with reviewers and the verifiers queue behind, which gives back most of what
pipelining bought.

{{splitTable}}

**Splitting is a scheduling decision and it does not leak into the report.**
The two halves report into one lens table under one bundle title; only
`result.bundlesSplit` says it happened.

### The bundles

A bundle never mixes cross-cutting lenses, which read the whole target, with
layer-scoped ones, which read their own slice — doing so either truncates a
cross-cutting lens to one layer's files or drags a layer lens across the whole
tree.

{{bundleTables}}

**Lenses stay individually conditional.** A bundle fires when any of its lenses
does, and loads only the skills for the lenses that fired.

### How conventions reach the agent

Every bundle runs `agentType: "general-purpose"`. **Each lens with a skill loads
it** through the FIRST ACTION line the script writes into the reviewer's
prompt. Without it the agent reviews from general knowledge.

{{noSkillLine}}

### Verifiers

**Opus by default, sonnet when nothing in the batch is severe.** Verification is
the last gate before a human reads anything, and its two errors do not cost the
same: a wrong `confirmed` is noise you spot while reading, a wrong `refuted`
deletes a real issue silently. So a file's verify batch drops to sonnet only
when every finding in it is `low` or `medium` severity.

### Verification runs alongside review, not after it

A bundle's findings go to a verifier the moment that bundle returns, while the
other bundles are still reading. Dedup runs afterwards, with three
consequences:

- **A cross-bundle twin is verified twice.** Twins are findings from different
  bundles on the same file within two lines of each other, whichever lens
  raised them (or under the same lens only, with `dedupe: { by: 'lens' }`).
  Two findings from one reviewer are never merged. The report says how
  many twins there were, so the cost is measured rather than guessed.
- **Each verdict applies to its own finding.** A twin is dropped only when
  every verifier refuted it, so a refuted nit can never take a confirmed
  critical down with it. The report shows the most severe finding that
  survived. A disagreement is never hidden — the finding is marked **Split
  verdict** wherever it appears, and `result.stats.splitVerdicts` counts them.
- **The verify cap is per bundle.** Twelve findings per bundle in severity
  order, with `outside` findings last so they never crowd out the branch's
  own. Anything over the cap is kept and marked unverified.

### Diff mode adds three things

**Scope.** Every finding says whose problem it is: `branch` (the branch caused
it), `carried` (it was already there, in code the branch rewrote or moved) or
`outside` (it was already there, in code the branch left alone). Reviewers
still report what they find outside the branch, and verifiers relabel a wrong
scope rather than refuting an old problem, so nothing real is lost. The report
gives each scope its own section, and only the branch's own findings can lead
it.

**Coverage analysis.** The test lenses each get a second job: find what the
branch should have covered and did not. A coverage gap only means something
measured against what a change added, which is why target mode has none.

**Diff-only lenses** ({{diffOnlyLenses}}). Compatibility is a property of a
change, not of code as it stands.
{{rosterNotes}}
---

## Edge cases

- **On the base branch, or an empty diff** → abort with the one-line reason.
- **Detached HEAD** → the review runs on `HEAD`, and the report is named
  `detached-<sha>`.
- **Uncommitted changes** → warn, review the last commit, and let the report
  header say so. Commit first for a review of what is on disk.
- **Docs-only target** → only the lenses that read docs fire. Say so rather
  than running every bundle against a README.
- **Migration-only diff** → only the lenses routed on migrations and `.sql`
  fire. There is no TypeScript, so there is nothing for the code lenses to read.
- **Test-only diff** → the test lenses plus the cross-cutting bundles, and the
  coverage half has nothing to find since the branch adds no production
  behaviour.
- **Large diff (>4000 lines)** → `largeDiff: true` makes Recon work file by file
  from `patchDir` rather than loading the patch whole.
- **A review agent returns `null`** (skipped, or dead after retries) → its
  bundle contributes nothing. `result.bundlesRun` still lists it, and
  `result.bundlesDied` names it; the report's lens table says so under its
  title. Say in the summary which bundles produced nothing rather than implying
  they never ran.
- **A lens missing from `lensesRun`** → that pass did not happen. It shows as
  `Not reported back` in the report's lens table. Surface it; do not average it
  away.
- **A verifier returns nothing, or no verdict for a finding** → the finding is
  kept and marked unverified, with a note saying which. Never silently promoted
  to confirmed.
- **30+ findings from one bundle** → likely padding. Findings past the
  12-per-bundle verify cap are kept and marked unverified rather than dropped.
  `result.stats.unverified` counts every finding left unverified, for any of
  the three reasons.
- **The prepass has not finished when reviewers start** → expected on a slow
  typecheck, and handled: each report is renamed into place only once its tool
  exits, and reviewers wait on `_prepass.done.json` for up to three minutes. If
  it never lands, the agent says so under the lens that wanted it and reviews
  without it. **A reviewer must never run {{toolNames}} itself** — that is the
  cost the prepass exists to avoid.
- **A bundle appears twice in the agent list** (`craft-1`, `craft-2`) → it was
  split for concurrency. One bundle to the reader; `result.bundlesSplit` names
  which ones.
- **A finding marked "Split verdict"** → two bundles raised it and their
  verifiers disagreed. At least one did not refute it, so it stayed. Say so
  when presenting; it is the one place the review contradicted itself.
- **Nothing survives** → the workflow still returns a full report, summary table
  empty, verification section listing what was refuted and why.
{{#githubReview}}- **A 502 on the GitHub review `POST`** → the review was probably created. Check
  before retrying; a blind retry makes a second review and only one can be
  pending. See `{{rulesDir}}/pr-reviews.md`.
{{/githubReview}}- **The workflow dies mid-run** → do not restart from scratch. Re-invoke with
  `{ scriptPath, resumeFromRunId }`. If the result looks empty or wrong, read
  `<transcriptDir>/journal.jsonl` before diagnosing — it records what each stage
  actually returned, including Recon's bundle decisions.
