---
name: {{name}}
description:
  'MANDATORY: Invoke this skill BEFORE creating ANY pull request. NEVER run gh
  pr create directly — always use /{{name}}. Runs the pr-qa workflow to write the
  summary and a verified Manual QA checklist ({{sectionNames}}), then opens the
  PR as a draft titled with the branch name. Test-coverage analysis belongs to
  code review, not here.'
user-invocable: true
---

{{marker}}

# PR QA Skill

Creates a pull request with verified QA artifacts. Three commands do the work:
a prepass gathers the branch's facts, the **pr-qa workflow** writes and
verifies the summary and checklist, and a publish step opens the PR and posts
the checklist.

**The manual checklist is the deliverable that can silently lie.** A vague
summary gets questioned; a wrong test step gets ticked. The workflow keeps it
honest: a behaviour inventory plus an adversarial audit define what _complete_
means, a pruner cuts it back to what could actually break, and every step is
checked against the code until it would genuinely observe what it claims.
A step that would pass with the PR reverted, or repeats a test, does not
ship. Every gap is either one line on the checklist or a note in your report
— never dropped.

**The checklist is short on purpose.** It aims for under 30 minutes: what
only a live run or a person can check, plus what the diff needs outside the
repository. A behaviour a test already proves is cited on a Covered by line,
not repeated as a step.

**Test coverage is NOT this skill's job.** The workflow reads the automated
suite only to cite it; a coverage claim that does not hold is reported as a
test gap for code review.

## Usage

```
/{{name}}
```

The skill has no flags. The PR title is always the branch name, and new PRs
are always drafts; the author marks one ready once QA passes.

{{baseRule}}

## Steps

### 1. Prepass

```bash
SCRATCH_DIR=<session scratchpad directory>
npx --no-install skills pr prepass --scratch "$SCRATCH_DIR"
```

It fetches and resolves the base (preferring `origin/<base>`, which is what
GitHub diffs against), writes the diff, per-file patches and a facts file to the
scratch folder, sorts the changed files into layers, and prints the workflow's
args as JSON, including the `headSha` it diffed. When it prints `"ahead": 0`,
the branch has no commits over its base: tell the user there is nothing to open
a PR for, and stop.

To use a different base, pass `--base <branch>`; it wins over everything
else.{{#stackBase}} If `gh stack view` fails or answers in a shape the prepass cannot
read, it stops rather than guess, and says to pass `--base`. Ask the user which
branch sits below this one, then re-run the prepass with it.{{/stackBase}}

The layers it sorts files into:

{{layerTable}}

### 2. Run the workflow

**Use the `Workflow` tool. Do not dispatch drafting or verification agents with
individual `Agent` calls.** Invoking this skill is the explicit opt-in the
`Workflow` tool requires, so do not stop to ask.

```
Workflow({
  scriptPath: "{{skillDir}}/pr-qa.workflow.js",
  args: <the JSON the prepass printed, passed as an object, unchanged>,
})
```

It triages the diff first: a pure move gets one smoke check, a tooling-only
change gets none, and the triage decides what the boot block starts and
whether the diff depends on anything outside the repo. Otherwise it explores
the branch once into a shared context pack, inventories every changed
behaviour, audits the inventory for what is missing, prunes duplicates and
anything a test or the old code already covers, then drafts each section and
verifies every step against the code as soon as its draft lands, up to eight
steps to a checker. A last pass per section drops steps repeating another,
and if-time steps are cut until the checklist fits its budget. Verification
only reads code; it never runs a step or touches the local stack. It returns
`{ summary, checklist, gaps, reportNotes, unresolved, trapCandidates, stats }`.

Wait for the completion notification. If the workflow fails, re-run it with
`resumeFromRunId` and the same `scriptPath`; finished agents return their
cached results.

### 3. Publish

The completion notification names an `<output-file>`; it holds the result.

```bash
npx --no-install skills pr publish --result <output-file> --base <base from the prepass> --head <headSha from the prepass>
```

Before publishing, read the summary in the output file. It must stay under
about 25 lines, lead paragraph and bullet sections together. If it has grown
diagrams, a module map or a file-by-file tour, rewrite it in the output file
first. Leave the checklist as the workflow wrote it; its budget is already
applied.

It fills `{{template}}` with the summary, creates the PR as a draft or edits the
open one, and writes the checklist into the Manual QA
comment — editing the existing one, so its place in the timeline and everyone's
notifications stay put. A checklist longer than one GitHub comment is split
across numbered comments. It prints the PR's `url`, whether it was `created`,
how many comment `parts` it wrote, the `unresolved` units, the
`trapCandidates`, and the `reportNotes`.

It never moves an open PR onto another base on its own. When the open PR's base
differs from the prepass's, it prints that base as `baseMismatch`. Tell the user,
and only if they want the PR moved, run publish again with `--set-base`.

It refuses, changing nothing on the PR, when the PR's head commit on GitHub is
not `headSha`: the checklist would describe code GitHub does not have. It also
refuses a result with an empty summary.

### 4. Report

Give the PR URL, and say:

- **The checklist arrives unticked**, and that is correct: its steps have
  never been run against this commit.
- **Each unresolved unit**, by name. It failed verification twice, or its
  checker gave no verdict for it, so it was left out of the checklist;
  shipping a step that never passed is not an option. The checklist itself
  holds only steps, so this report is the one place the author hears what
  was left out.
- **Each trap candidate**: a mistake that broke 3 or more drafted steps and
  that [`{{traps}}`]({{trapsLink}}) does not cover yet. List them, then ask the
  user whether to add them. On a yes, add each under the heading for its area,
  in the file's own shape: the trap, why the obvious step fails, and what to
  write instead. Every drafter reads that file, so each addition stops the
  same mistake costing a rewrite on the next PR.
- **The report notes**, grouped by `kind`, one line each. They never reach
  the PR: `test gap` (a coverage claim that did not hold — raise it in code
  review), `deleted` (a step the checker removed as vacuous, covered or
  unreachable), `left out` (a step that failed checking twice or got no
  verdict), `pruned`, `duplicate`, `cut for budget` and `over budget`,
  `triage` (a move or tooling label the prepass contradicted), `no surface`
  and `not drafted`. Skip the section when there are none.
- **A boot block or section setup that failed verification**, if the
  checklist carries a warning. The steps after it rely on it, so it is
  published with the warning rather than dropped.
{{#qaGate}}- **The gate:** `.github/workflows/pr-manual-qa.yml` un-ticks every box on each
  push, and the `Manual QA` status stays red until they are ticked again. It
  only counts a checklist posted by someone who can push to the repository.
{{/qaGate}}{{^qaGate}}- **There is no reset gate** in this repository, so the tester has to notice a
  stale commit stamp on the checklist themselves.
{{/qaGate}}
{{#splitSections}}## Who runs the checklist

{{splitSections}}

{{/splitSections}}## Edge cases

- **Merge conflicts with the base**: warn the user, but carry on. The PR can
  still be opened.
- **Branch not pushed**, or publish says to push first: tell the user to run
  `git push -u origin HEAD`, then run only the publish command again — the
  workflow's result is still in its output file.
- **No `gh` CLI or no auth**: publish fails naming the command. Print the
  summary and checklist from the output file so the user can open the PR by
  hand.
- **No runtime surface touched, or a tooling-only diff**: the workflow
  writes only a summary and a checklist saying no manual checks are needed,
  plus the Local CI boxes. Publish both as normal.
- **A pure move**: the checklist is one smoke check plus a Local CI box for
  the type check and build. That is correct, not a failed run.
- **Commits land while the workflow runs**: publish refuses with "commits
  landed on GitHub since then, so re-run /{{name}}". Run the skill again once the
  branch is settled.
- **Publish says the summary is empty**: the summary agent returned nothing.
  Run the skill again.
- **A tester finds a bad step after the PR is open**: fix the step, and **add
  the trap to [`{{traps}}`]({{trapsLink}})**. Every drafter and verifier reads that file,
  so updating it is part of fixing the step, not optional follow-up.
{{#qaGate}}- **Fork PR**: the gate skips it, because a fork's token is read-only, so its
  `Manual QA` check stays pending. Post the checklist anyway and say the gate
  cannot run.
{{/qaGate}}
