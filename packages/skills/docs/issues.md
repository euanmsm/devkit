# issues

Teaches Claude how to write and organise issues on Linear, GitHub or both: the
titles, the two issue templates, the writing style, where plans live, and how
status moves. Claude loads it before it creates, edits or plans any issue.

It never creates an issue itself. It is the rulebook Claude follows when you ask
for one.

## What it covers

- **Two kinds of issue.** A leaf is one PR, with everything needed to build it:
  Problem, End State, Implementation Steps, Deletions and Testing. A parent is
  never a PR; it says why its leaves belong together and what is true once they
  have all merged. Both templates are written into the skill, with a worked
  example leaf.
- **Metadata stays in fields.** Parent, sub-issues, blocked-by, labels, project,
  status and priority are set on the issue, never written into its description,
  where they go stale.
- **Writing style.** One plain opening sentence per section, every real file and
  function named in backticks, and short snippets that show shapes rather than
  implementations.
- **Titles** of two to four words.
- **Status.** Every issue Claude creates starts in Backlog, so nothing it wrote
  enters the work queue before you have read it. Claude never closes an issue or
  marks it Done.
- **Plans.** Design work is argued out in an architecture document on the
  parent, written with you, before the work is split into leaves by layer, each
  blocked by the one before.

## Linear and GitHub

The writing rules are the same on both; the mechanics differ, and each tracker
has its own section:

| What                  | Linear                          | GitHub                                                                             |
| --------------------- | ------------------------------- | ---------------------------------------------------------------------------------- |
| Fields and relations  | `save_issue` on the Linear MCP  | `gh issue create` and `gh issue edit`, plus `gh api` for sub-issues and blocked-by |
| Status and priority   | The issue's own fields          | A GitHub project's fields, when the issue is on one; otherwise only open or closed |
| Architecture document | A Linear document on the parent | The parent's first comment, headed `## Architecture`, edited in place by its ID    |
| Finishing             | Never set Done                  | Never close; the PR's `Closes #<number>` closes it on merge                        |

A repository that only uses one tracker sets `trackers`, and the other's
sections are left out of the skill.

## Options

| Option         | Default                                               | What it is                                                                                     |
| -------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `name`         | `issues`                                              | The skill's folder and slash command: lowercase letters, digits and dashes                     |
| `trackers`     | `["linear", "github"]`                                | Which trackers the skill covers: one or both of `linear` and `github`                          |
| `layerOrder`   | migrations → data access → services → API routes → UI | The layers a feature is split into leaves by, first to last                                    |
| `testingRules` | none                                                  | Path to the repository's testing conventions. Without it, a generic rule matches test to layer |

The skill also uses the shared `skillsDir` and `baseBranch` settings.

## Files it writes

| File                          |
| ----------------------------- |
| `<skillsDir>/<name>/SKILL.md` |
