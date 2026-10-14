---
name: {{name}}
description:
  "MANDATORY: Invoke this skill BEFORE creating, updating, or planning any
  {{trackerNames}} issue — writing an issue description, splitting work into
  sub-issues, setting status, labels, parent or blocked-by relations, or
  drafting an architecture document for a parent issue. Covers titles, the leaf
  and parent templates, writing style, architecture documents, and the status
  lifecycle. Never write an issue without loading this skill first."
user-invocable: true
---

{{marker}}

# Issue Conventions

The following are the project's conventions for {{trackerNames}} issues. Use
these as your source of truth whenever you create, update or plan an issue.

{{#both}}The writing rules are the same on both trackers; only the mechanics — which
fields exist and which tool sets them — differ, and each has its own section.
Use whichever tracker the user names, or the one the work already lives in.

{{/both}}## Two Kinds Of Issue

Every issue is one of two kinds, and each has its own template, at the end of
this skill. Copy the template's headings exactly and replace the guidance under
each one with real content.

- **Leaf** — one issue, one branch, one PR, built from the
  [leaf template](#leaf-template). It carries everything an implementer needs to
  build it without asking a question.
- **Parent** — never a PR, built from the [parent template](#parent-template).
  It explains why its leaves exist together and what the system looks like when
  they have all merged. It carries no implementation steps, no testing section
  and no list of its own sub-issues. Deep design work goes in an architecture
  document attached to it — see [Where Plans Live](#where-plans-live).

If an issue would need two PRs, it is not a leaf. Make it a parent and split the
work into leaves.

## Metadata Lives In Fields, Never In The Description

The tracker already shows parent, sub-issues, blocked-by, blocks, project,
status, priority and labels. **Never restate any of them in the description.**
Set them on the issue and let the tracker display them.

That rules out these sections, which all go stale:

- **Delivery / Order** — "PR 32 of 59", "7th of Wave 5", branch names. Order is
  the blocked-by chain; the branch name comes from the issue
- **Relations / Depends / Related** — lists of blocks and blocked-by
- **Phases** on a parent — a list of links to its own sub-issues

If an ordering constraint carries a _reason_ the reader needs ("no feature can
move to the scoped client before this lands, or every write inherits the bug"),
that sentence belongs in **Problem**. The link itself goes in the relation
field.

{{#linear}}### Linear fields

Set them with `save_issue`: `parentId`, `blockedBy`, `blocks`, `relatedTo`,
`project`, `labels`, `priority` and `state`.

{{/linear}}{{#github}}### GitHub fields

`gh issue create` and `gh issue edit` set labels, assignees, the milestone and
the project (`--label`, `--assignee`, `--milestone`, `--project`). Write the
body to a file and pass `--body-file`, so backticks and code blocks survive the
shell.

Parent and blocked-by relations have no `gh issue` flag, so set them through
the API. Both take the issue's numeric `id`, not its number:

```bash
ID="$(gh api repos/{owner}/{repo}/issues/<number> --jq .id)"
# make <number> a sub-issue of <parent>
gh api -X POST repos/{owner}/{repo}/issues/<parent>/sub_issues -F sub_issue_id="$ID"
# mark <blocked> as blocked by <number>
gh api -X POST repos/{owner}/{repo}/issues/<blocked>/dependencies/blocked_by -F issue_id="$ID"
```

If a relation call is refused because the repository does not support it, tell
the user and leave the relation off. Never fall back to writing it into the
description.

Priority and status are fields on a GitHub project, not on the issue. When the
repository's issues belong to a project, add the issue with `--project` and set
those fields with `gh project item-edit`; `gh project field-list` gives the
field and option IDs it needs. When there is no project, the issue has no
status beyond open, and no priority.

{{/github}}## Writing Style

**Thin, plain and concrete.** A teammate with no session context should
understand the issue in one pass and be able to find every piece of code it
names.

- **Clarity beats brevity.** Cut filler, never cut the words that make the logic
  follow.
- **Lead each section with one plain sentence** saying what it is, then detail.
  Don't open straight into a bullet dump.
- **Full sentences for reasoning and decisions. Bullets for lists. Numbered
  `###` headings for steps.**
- **Say each fact once.** No overview section that previews the rest; no closing
  summary.
- **Explain project-specific terms in a clause** the first time they appear —
  an abbreviation, an internal name whose job its name does not make obvious.
  Ordinary engineering words need no explanation.

### Name real code in backticks

Every file, function, type, table, column, route and error code is written as it
appears in the codebase, in backticks — `removeMember`, `markMembershipRemoved`,
`TEAM_ERROR_CODES`, `teams/[teamId]/members/[memberId]/route.ts`. The reader
should be able to paste any backticked name into search and land on it. A
paraphrase ("the member removal service") sends them hunting.

Names that don't exist yet are backticked too, so the reader can tell a new
thing from a vague description of one.

### Show shapes with code snippets

**Problem, End State and Implementation Steps should each carry a snippet
wherever one makes the plan more tangible.** A snippet shows the _shape_ — a
signature, a type, a return value, a before/after call site, a SQL policy line,
a response body. It never shows the full implementation.

- **Problem** — the current code that is wrong, trimmed to the lines that matter
- **End State** — the new types, signatures or response shapes, and a file tree
  when files are added or moved
- **Implementation Steps** — the call site before and after, or the one line of
  SQL a step turns on

Steps are written as numbered `###` headings — `### 1. Write the helper` — with
the prose and snippet underneath, never as a numbered list. A list item can't
hold a snippet without awkward indenting, and headings let the reader jump
straight to a step.

Code names are backticked in prose but written plainly inside a snippet, where a
backtick would read as a template literal.

Keep snippets short: ideally under ten lines, with `// ...` for everything that
isn't the point. If a snippet needs a paragraph to explain it, it is too big.

## Titles

**2–4 words.** Fewest words possible.

- **Good:** "User Facing Changelog", "QR Auto-Verify", "Bulk Upload Pipeline"
- **Bad:** "Add a changelog component that fetches GitHub releases"

## Before Creating An Issue

Gather context first, so the issue lands in the right place. **Never add a
sub-issue to a similar-looking parent or a finished one** — match what the user
is working on now.

{{#linear}}### On Linear

1. **List projects** — find the correct project
2. **List existing issues** — find the parent and any blockers
3. **List statuses and labels** for the target team

Always set **status**, **priority**, **project**, **labels**, and **parent** and
**blocked-by** where they apply. No orphaned issues — every issue belongs to a
project and a hierarchy.

{{/linear}}{{#github}}### On GitHub

1. **List open issues** — `gh issue list --state open`, to find the parent and
   any blockers
2. **List labels and milestones** — `gh label list`, and
   `gh api repos/{owner}/{repo}/milestones`
3. **List projects** — `gh project list --owner <owner>`, to find whether the
   repository's issues live on one

Always set **labels**, and **parent**, **blocked-by**, **milestone** and
**project** where they apply.

{{/github}}## Status Lifecycle

**Never mark an issue finished.** Closing it, or setting it to Done, is the
user's job, or the merge's.

**Every issue Claude creates starts in Backlog** — set on the create call
itself, not created and then moved, however complete the plan looks. This is
about authorship, not plan maturity. Backlog signals that nobody has read the
issue yet. An issue Claude wrote sitting in Todo looks identical to one the user
wrote and approved, so it silently enters the work queue unreviewed. The user
promotes it once they have read it.

{{#linear}}### On Linear

Update status as work moves:

- No real plan → **Backlog**
- Planned → **Todo**
- Work started → **In Progress**
- Code complete → **In Review**
- **NEVER** set **Done**

{{/linear}}{{#github}}### On GitHub

When the issue is on a project with a status field, move it through that
field's options the same way: Backlog, then the planned, in-progress and
in-review options as work moves. When there is no project, the issue stays open
and carries no status; don't invent one with labels.

**NEVER** close an issue. A leaf closes when its PR merges, because the PR's
description says `Closes #<number>`.

{{/github}}## Where Plans Live

Project and feature plans go in the tracker. In-session implementation planning
stays in native plan mode — two different things.

A plan lives in one of three places, from deepest to thinnest:

| Where                     | Holds                                                                                  | Written by           |
| ------------------------- | -------------------------------------------------------------------------------------- | -------------------- |
| **Architecture document** | The top-level design, before the work is split: options weighed, trade-offs, the model | The user and Claude  |
| **Parent description**    | The thin summary, from the parent template — what the group solves and the end state   | Claude, from the doc |
| **Leaf description**      | Everything needed to build one PR, from the leaf template                              | Claude, from the doc |

Comments are for progress updates only. They never hold plan content.

### Architecture documents

An architecture document belongs to a **parent issue**. It is where the design
gets argued out before anyone decides how to split it into PRs, so it can run as
long as the design needs.

- **Parents only.** Never attach one to a leaf — a leaf small enough for one PR
  fits its plan in its description.
- **Written together.** The user and Claude author it in conversation. Draft it
  when the user asks for architecture planning, then refine it with them; never
  write one unprompted or treat a first draft as agreed.
- **Read before every update.** The user edits it too. Fetch the current version
  first and change only the part that moves, never by resending the whole
  content over their edits.
- **Same writing style as issues.** Real names in backticks and short snippets
  showing shapes, so the design stays tied to the code it changes.
- **Not a place for metadata.** No list of the leaves, no PR order — the
  parent's sub-issues and blocked-by relations already show that.

The parent description does not copy the document. The parent says _what_ and
the document says _why this way_.

{{#linear}}**On Linear**, the document is a Linear document created with `save_document`,
its `issue` field set to the parent. Never attach one to a project, team or
cycle unless the user asks. Update it with `patch`. The parent does not link to
it; Linear shows attached documents on the issue.

{{/linear}}{{#github}}**On GitHub**, issues cannot hold documents, so the document is the parent's
first comment, starting with the heading `## Architecture`. It is the one
comment that holds plan content. Read it with
`gh api repos/{owner}/{repo}/issues/<parent>/comments`, and edit it in place by
its comment ID, so the user's edits survive:

```bash
gh api -X PATCH repos/{owner}/{repo}/issues/comments/<comment-id> -F body=@architecture.md
```

{{/github}}### Workflow

For work that fits one PR, skip straight to a leaf. For anything bigger:

1. Create the parent issue from the parent template — Problem and End State can
   be rough at this point
2. Launch **Explore agents in parallel** for codebase context — you need real
   names and real snippets, not guesses
3. Draft the architecture document on the parent and work through it with the
   user until they agree the design
4. Tighten the parent description so it matches the agreed design
5. Split the work into leaves, each from the leaf template — see Splitting Work
6. Wait for user approval before implementing

If a leaf later changes a decision the document records, update the document
with the user so it stays true.

## Splitting Work

A new feature splits into leaves by **layer**: {{layerOrder}}. Skip layers the
work doesn't touch. Brand-new UI gets **UI mockups as the first leaf**.

**Always add blocked-by relations between leaves** so the phases chain in order.
That relation is the ordering — nothing in any description repeats it.

## Testing

**Every leaf needs a Testing section. Never omit it.**

- Tests are built **inside the leaf that adds the code**, not saved for later.
  {{testingStyle}}
- **End-to-end tests come last.** Under a parent, they are the final leaf,
  blocked by every implementation leaf
- The section states **what behaviour is covered, at which layer, under which
  config** — never just "add tests"

## Never Include

- Metadata sections — see above
- Architecture-level design in a parent description — it goes in the parent's
  architecture document
- "Modified Files" lists — use an annotated file tree in End State instead
- A "Brief Overview" that previews the sections below it
- Content copied verbatim between a parent and its leaves

---

## Leaf Template

````markdown
## Problem

One plain sentence on what is wrong or missing today. Then the detail: current
behaviour, why it matters, and any ordering constraint that has a reason behind
it. Show the code that is wrong, trimmed to the lines that matter.

```ts
// path/to/currentFile.ts
const { data, error } = await someQuery(...);
if (error) return failure(...);
return ok({ ok: true }); // ← wrong: also runs when nothing changed
```

## End State

One plain sentence on what is true once this PR merges. Then the new shapes —
types, signatures, response bodies — and a file tree if files are added or
moved.

```ts
export function newHelper(input: Input): Promise<Result>;

type Result = { ok: true; count: number } | { ok: false; reason: "denied" };
```

```
src/features/<feature>/
├── services/newThing.ts        # NEW
└── errors/errorCodes.ts        # CHANGED — adds `new_code`
```

## Implementation Steps

One sentence on the order the steps run in, if it matters. Then one numbered
`###` heading per step, naming the action. Under it, the detail in prose, with
every real function, file and column in backticks, and a snippet wherever the
step changes a signature or a call site.

### 1. Do the first thing

What it does and why, naming `realFunction` and `real/file.ts`.

```ts
export function realFunction(input: Input): Promise<Result>;
```

### 2. Change the call site

What changes for the code that calls it.

```ts
// before
await oldCall(id, client);
// after
await newCall(id, client, { expect: "one" });
```

### 3. Do the last thing

Detail. A step with nothing worth showing needs no snippet.

## Deletions

What this PR removes: files, exports, flags, dead branches, shims — each in
backticks. If nothing is removed, write "None" and one sentence on why, when a
reader would expect something to go.

## Testing

One sentence on which config the tests run under and why that layer. Then one
bullet per behaviour covered, phrased as the behaviour, not the test name.

- **Behaviour one** — the setup that proves it (`the test config it runs under`)
- **Behaviour two** — ...
- **The original bug** — a test that fails against `{{baseBranch}}`
````

## Parent Template

````markdown
## Problem

One plain sentence on the problem the whole group solves. Then the current
state, with a snippet of the code or data that shows it.

```ts
// today: every route builds its own client
const db = createClient(...);
```

## End State

One plain sentence on what is true once every leaf has merged. Then the shapes
that stay constant across the leaves — the shared type, the new module layout,
the contract every leaf builds towards.

```ts
// after: every route receives one from route()
handler: async ({ principal }) => principal.scopedClient;
```

## Decisions

Choices every leaf inherits, so no leaf re-argues them. One numbered `###`
heading per decision, naming it, with the reason underneath. Leave the section
out if there are none.

### 1. Name the decision

Why it was made, and what it rules out. A snippet if the decision is a shape.

```ts
// every leaf's data access takes the scoped client, never the admin one
client: AuthenticatedClient;
```

### 2. Name the next decision

Why.

## Out Of Scope

Work a reader might expect here that is deliberately not part of this group,
with one sentence on where it lives instead. Leave the section out if there is
none.
````

---

## Example Leaf

The example is TypeScript on Postgres, but the shape — a plain opening
sentence, real names, short snippets, steps as headings, behaviours as tests —
is the same in any stack.

````markdown
## Problem

A write that row-level security refuses looks exactly like a write that matched
no row, so the app reports success.

Postgres treats the two halves of a policy differently. A `USING` failure
returns `UPDATE 0` with no error; a `WITH CHECK` failure raises
`new row violates row-level security policy`. So a denied update comes back as
`{ data: null, error: null }`, and `removeMember` turns that into a success:

```ts
// services/teams/removeMember.ts
const { data, error } = await markMembershipRemoved(client, teamId, memberId, removedBy);
if (error) return { ok: false, reason: "member_remove_failed", ... };
if (!data) return { ok: true, removed: false }; // ← denied and absent look the same
```

Today this only bites `teams/[teamId]/members/[memberId]/route.ts`, the one
route that passes the scoped client down. Every feature that moves onto the
scoped client inherits it, which is why no feature moves before this lands.
Multi-row writes have a second version of the bug: `batchDeleteTeams` can
delete the permitted subset and report the whole batch as done.

## End State

Every scoped write says how many rows it must touch, and anything short of that
becomes the calling service's own typed error instead of a success.

```ts
// lib/db/requireRowsWritten.ts
export function requireRowsWritten<T>(
    result: { data: T | T[] | null; error: unknown }, // a write that used .select()
    options: { atLeast: number },
): RowsWrittenOutcome<T>;

type RowsWrittenOutcome<T> =
    | { ok: true; rows: T[]; written: number }
    | { ok: false; reason: "db_error"; error: unknown }
    | { ok: false; reason: "too_few_rows"; written: number; atLeast: number };
```

```
src/lib/
├── db/
│   ├── requireRowsWritten.ts                  # NEW
│   └── __tests__/requireRowsWritten.test.ts   # NEW
└── services/teams/removeMember.ts             # CHANGED — checks the row count
```

## Implementation Steps

The helper lands first, then its first caller.

### 1. Write `requireRowsWritten`

A pure function over the `{ data, error }` a scoped write already returns, so no
data-access function changes shape. It counts the rows the write's `.select()`
handed back and compares them to `atLeast`. The JSDoc explains the `USING` /
`WITH CHECK` asymmetry and that it is Postgres behaviour, not a client setting,
so nobody goes looking for a switch.

```ts
if (result.error) return { ok: false, reason: "db_error", error: result.error };
const rows =
    result.data == null ? []
    : Array.isArray(result.data) ? result.data
    : [result.data];
if (rows.length < atLeast)
    return { ok: false, reason: TOO_FEW_ROWS, written: rows.length, atLeast };
```

### 2. Let the caller say what zero means

A delete may be deliberately repeatable, so zero rows is fine; an update to a
row the route just resolved means a defect, since the route already cleared the
caller to touch it. The option is required, with no default, so every caller
decides.

```ts
requireRowsWritten(result, { atLeast: 1 }); // an update to a resolved row: zero = a defect
requireRowsWritten(result, { atLeast: 0 }); // a repeatable removal: zero = already gone
```

### 3. Report partial writes

`too_few_rows` carries `written` and `atLeast`, so a batch can say "3 of 5
applied" rather than "done".

```ts
{ ok: false, reason: "too_few_rows", written: 3, atLeast: 5 }
```

### 4. Move `removeMember` onto the helper

Removal is the repeatable case, so `removeMember` passes `atLeast: 0`, still
answers `{ ok: true, removed: false }` when `written` is 0, and maps any failed
outcome to its own `member_remove_failed` code. The helper's reasons never reach
the route.

```ts
// before
if (!data) return { ok: true, removed: false };
// after
const outcome = requireRowsWritten({ data, error }, { atLeast: 0 });
if (!outcome.ok) return { ok: false, reason: "member_remove_failed", ... };
if (outcome.written === 0) return { ok: true, removed: false };
```

## Deletions

None. The misleading success in `removeMember` is corrected rather than
removed.

## Testing

Unit tests for the helper, integration tests for the caller against a real local
database. A mocked client cannot reproduce a policy silently matching zero rows,
which is how this went unnoticed.

- **Every outcome of the helper** — `db_error` even when a row came back,
  `too_few_rows` for `null` and for `[]`, success at `atLeast: 0` with no rows
- **A write denied by `USING` returns `too_few_rows`** — another organisation's
  membership row, updated through a member's scoped client
- **A permitted write succeeds** and reports `written: 1`
- **A partly permitted batch reports the partial count** instead of succeeding
- **Removing an already-removed member still succeeds** — the `atLeast: 0`
  branch
- **The original bug** — the denied-write test fails against `{{baseBranch}}`
````
