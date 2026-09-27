# @euanmsm/skills

Claude Code skills that several repositories share, written into each one from a
single config file.

Without this, every repository carries its own hand-written copy of the same
skill, and the copies drift apart. Here the skill is written once, and each
repository only says what is different about it — its base branch, where its
comment rules live, which command typechecks it.

Full documentation — exactly how each skill works and every option it takes:

- [How `skills sync` works](docs/how-sync-works.md) — the config file, what
  `sync` and `check` do, and what the generated files are
- [clean-commit-history](docs/clean-commit-history.md)
- [clean-comments](docs/clean-comments.md)
- [code-review](docs/code-review.md)
- [pr](docs/pr.md)

## Installing

```sh
npm i -D @euanmsm/skills
mkdir -p .devkit
cp node_modules/@euanmsm/skills/skills.example.json .devkit/skills.json
npx skills sync
```

Commit what `sync` writes. The skills then work for anyone who clones the
repository, with nothing to run first.

To fail CI when someone edits a generated file by hand, or changes the config
without re-running `sync`:

```json
{ "scripts": { "check:skills": "skills check" } }
```

If the repository runs Prettier, add the generated paths to `.prettierignore`.
Reformatting a generated file makes `skills check` report it as edited.

## The skills

| Skill                  | What it does                                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `clean-commit-history` | Regroups a branch's commits into a clean, layered sequence without changing a byte of the final tree                  |
| `clean-comments`       | Fixes comment debt found by [`@euanmsm/terse`](../terse), fanning out to parallel agents on a big change. Needs terse |
| `code-review`          | Deep multi-agent review of a branch or named files, every finding checked by a second agent trying to disprove it     |
| `pr`                   | Opens the PR with a summary and a Manual QA checklist whose every step is checked against the code                    |

`clean-comments` also writes the `comments-specialist` agent it hands each batch
of files to.

## The config

`.devkit/skills.json`. A skill is installed only when its name appears under
`skills`, and a name or option the package does not know is an error rather than
being ignored.

| Setting      | Default          | What it is                                  |
| ------------ | ---------------- | ------------------------------------------- |
| `skillsDir`  | `.claude/skills` | Where skills are written                    |
| `agentsDir`  | `.claude/agents` | Where agents are written                    |
| `rulesDir`   | `.claude/rules`  | Where rules are written                     |
| `baseBranch` | `main`           | The branch the skills compare a branch with |

A repository that keeps its skills in `.agents/skills`, with `.claude/skills` as
a symlink to it, sets `skillsDir` to `.agents/skills`.

### `clean-commit-history`

| Option        | Default                                    | What it is                                                              |
| ------------- | ------------------------------------------ | ----------------------------------------------------------------------- |
| `commitRules` | none                                       | Path to the repository's commit rules. Without it, Conventional Commits |
| `layerOrder`  | migrations → generated types → … → cleanup | The order commits are stacked in, bottom first                          |

### `clean-comments`

| Option          | Default        | What it is                                                                            |
| --------------- | -------------- | ------------------------------------------------------------------------------------- |
| `preloadSkills` | `["comments"]` | Skills loaded before any edit, so a `@euanmsm/preflight` gate lets the agents through |
| `typecheck`     | none           | Command run after the cleanup. Without it, the step is left out                       |

The comment rules come from `rulesDoc` in the repository's `.devkit/terse.json`,
or `.devkit/comment-rules.md` — where `terse-docs` writes them — when it is
unset.

### `code-review`

| Option         | Default                   | What it is                                                                                |
| -------------- | ------------------------- | ----------------------------------------------------------------------------------------- |
| `name`         | `code-review`             | The skill's folder and slash command                                                      |
| `config`       | `.devkit/code-review.mjs` | The review config, below                                                                  |
| `githubReview` | `false`                   | Adds `/code-review pr`, which posts the findings as a pending GitHub review, and its rule |

`sync` writes three things: the skill's `SKILL.md`; `review.workflow.js`, the
script the Workflow tool runs, with the repository's config written into it;
and, with `githubReview`, `pr-reviews.md` in `rulesDir` — how to post a pending
review without tripping GitHub's limits.

#### The review config

`.devkit/code-review.mjs` is a JavaScript module, so file patterns stay real
regexes and long prose reads as prose. Every key is optional — with no file at
all, the review runs on the built-ins below. Start from
[`code-review.example.mjs`](code-review.example.mjs).

- **`lenses`** — a lens is one thing the review checks for, with a paragraph
  saying what it judges and a `route` saying which files switch it on. The
  package ships thirteen: `bugs`, `error-handling`, `security`, `performance`,
  `dry`, `readability`, `typing`, `comments`, `dead-code`, `database`,
  `backwards-compat`, `testing` and `ci`. An entry for one of those overrides
  just the fields it gives; `false` switches it off; any other key adds a lens
  of the repository's own. `skill` names the repository's conventions skill for
  that lens, which the reviewer loads first — `sync` refuses a skill that does
  not exist. `bundle` drops a new lens into an existing bundle.
- **`bundles`** — which lenses one reviewer agent covers together, and on which
  model. Giving a list replaces the defaults.
- **`prompts`** — the paragraphs of the agents' instructions that depend on how
  the repository is built: its layers, where tests live, what an identifier
  looks like. Each has generic wording; override only what reads wrong for your
  repository. The names are in
  [`src/review/defaults.mjs`](src/review/defaults.mjs).
- **`prepass.tools`** — commands run in the background before the reviewers
  start, typically the typecheck and lint, so no reviewer runs them itself. The
  terse comment check and the knip dead-code check are added automatically when
  the repository has them installed, limited to the files under review.
- **`files`**, **`splitOrder`**, **`rosterNotes`** — what counts as code, docs
  and tests; which fat bundles split first when there are spare agents; and
  notes appended to the skill's roster section.

The skill runs its prework through `npx skills prepass`, so that part improves
with a package upgrade rather than a regenerated file. The import graph it
builds needs [ripgrep](https://github.com/BurntSushi/ripgrep) (`rg`).

### `pr`

| Option   | Default          | What it is                                                                |
| -------- | ---------------- | ------------------------------------------------------------------------- |
| `config` | `.devkit/pr.mjs` | The PR config, below                                                      |
| `qaGate` | `false`          | Also writes the GitHub workflow that un-ticks the checklist on every push |

`sync` writes the skill's `SKILL.md` and `pr-qa.workflow.js`; the traps file,
once, when the repository has none; and, with `qaGate`,
`.github/workflows/pr-manual-qa.yml`.

`.devkit/pr.mjs` names the repository's **layers** — path patterns, each
belonging to a checklist section — and its **human sections**, such as Frontend
or TUI, beside the built-in backend section. Everything else has a default: the
boot commands, who acts in the system, the cross-cutting questions every
behaviour is checked against, the Local CI boxes, and the wording of each prompt
passage that depends on the repository. Start from
[`pr.example.mjs`](pr.example.mjs); [docs/pr.md](docs/pr.md) has every key.

The skill's shell work runs from the package: `npx skills pr prepass` gathers
the branch's facts before the workflow, and `npx skills pr publish` opens the PR
and posts the checklist after it.

## Commands

| Command               | Does                                                                               |
| --------------------- | ---------------------------------------------------------------------------------- |
| `skills sync`         | Writes every configured skill, and removes generated ones the config does not name |
| `skills sync --force` | Also replaces a hand-written file sitting where a generated one belongs            |
| `skills check`        | Exits non-zero, listing each generated file that is missing, edited or out of date |
| `skills prepass …`    | The code review's prework. The skill runs it; you do not need to                   |
| `skills pr prepass …` | The PR skill's prework: the diff, the facts file and the workflow's arguments      |
| `skills pr publish …` | Opens or edits the PR and writes the checklist comment                             |
| `skills qa-gate …`    | `reset` or `status` for the Manual QA gate. Its GitHub workflow runs it            |

Every generated file carries a `Generated by @euanmsm/skills` line — an HTML
comment under the frontmatter, or a `//` or `#` comment atop a script. That line
is how `sync` tells its own files apart from yours: it never overwrites or
deletes a file without it unless you pass `--force`.
