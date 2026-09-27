---
name: pr
description:
  'MANDATORY: Invoke this skill BEFORE creating ANY pull request. NEVER run gh
  pr create directly — always use /pr. Runs the pr-qa workflow to write the
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
means, and every step is checked against the code until it would genuinely
observe what it claims. Every gap either becomes a step or is published
alongside the checklist — never dropped.

**Test coverage is NOT this skill's job.** The workflow reads the automated
suite only to decide what the backend section may skip and how human steps are
prioritised.

## Usage

```
/pr
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

It explores the branch once into a shared context pack, inventories every
changed behaviour, audits the inventory for what is missing, then drafts each
section and verifies every step against the code as soon as its draft lands,
up to eight steps to a checker. Verification only reads code; it never runs a
step or touches the local stack. It returns
`{ summary, checklist, gaps, unresolved, stats }`.

Wait for the completion notification. If the workflow fails, re-run it with
`resumeFromRunId` and the same `scriptPath`; finished agents return their
cached results.

### 3. Publish

The completion notification names an `<output-file>`; it holds the result.

```bash
npx --no-install skills pr publish --result <output-file> --base <base from the prepass> --head <headSha from the prepass>
```

It fills `{{template}}` with the summary, creates the PR as a draft or edits the
open one (setting its base), and writes the checklist into the Manual QA
comment — editing the existing one, so its place in the timeline and everyone's
notifications stay put. A checklist longer than one GitHub comment is split
across numbered comments. It prints the PR's `url`, whether it was `created`,
how many comment `parts` it wrote, and the `unresolved` units.

It refuses, changing nothing on the PR, when the PR's head commit on GitHub is
not `headSha`: the checklist would describe code GitHub does not have. It also
refuses a result with an empty summary.

### 4. Report

Give the PR URL, and say:

- **The checklist arrives unticked**, and that is correct: its steps have
  never been run against this commit.
- **Each unresolved unit**, by name. It failed verification four times, or its
  checker gave no verdict for it, so it was left out of the steps and listed
  under "Not covered by these checks"; shipping a step that never passed is
  not an option.
- **A boot block that failed verification**, if the checklist opens with a
  warning. Every step relies on it, so it is published with the warning rather
  than dropped.
{{#qaGate}}- **The gate:** `.github/workflows/pr-manual-qa.yml` un-ticks every box on each
  push, and the `Manual QA` status stays red until they are ticked again.
{{/qaGate}}{{^qaGate}}- **There is no reset gate** in this repository, so the tester has to notice a
  stale commit stamp on the checklist themselves.
{{/qaGate}}
## Edge cases

- **Branch not pushed**, or publish says to push first: tell the user to run
  `git push -u origin HEAD`, then run only the publish command again — the
  workflow's result is still in its output file.
- **No `gh` CLI or no auth**: publish fails naming the command. Print the
  summary and checklist from the output file so the user can open the PR by
  hand.
- **No runtime surface touched**: the workflow writes only a summary and a
  checklist of the line `_No manual checks needed — no runtime surface
  touched._` plus the Local CI boxes. Publish both as normal.
- **Commits land while the workflow runs**: publish refuses with "commits
  landed on GitHub since then, so re-run /pr". Run the skill again once the
  branch is settled.
- **Publish says the summary is empty**: the summary agent returned nothing.
  Run the skill again.
- **A tester finds a bad step after the PR is open**: fix the step, and **add
  the trap to [`{{traps}}`]({{trapsLink}})**. Every verifier reads that file,
  so updating it is part of fixing the step, not optional follow-up.
{{#qaGate}}- **Fork PR**: the gate skips it, because a fork's token is read-only, so its
  `Manual QA` check stays pending. Post the checklist anyway and say the gate
  cannot run.
{{/qaGate}}
