# TODO — shared skills

Moving the skills Curricular and Sales harness each carry their own copy of into
[`@euanmsm/skills`](packages/skills), one at a time. Each repository then writes
them from `.devkit/skills.json` instead of keeping a hand-written copy.

## Done

- [x] **Package scaffold** — `skills sync` writes the configured skills,
      `skills check` fails CI when they drift from the config
- [x] **clean-commit-history** — configurable base branch, commit rules path and
      commit layer order
- [x] **clean-comments** — ships with its `comments-specialist` agent. Reads the
      comment rules path from `.devkit/terse.json`
- [x] **code-review** — one engine merged from both copies, configured per repo
      in `.devkit/code-review.mjs`. Ships thirteen built-in lenses, default
      bundles and generic wording for every prompt paragraph; the prepass runs
      from the package as `npx skills prepass`. The configs that reproduce each
      repo's current review are in
      [`packages/skills/test/fixtures/review/`](packages/skills/test/fixtures/review/)
- [x] **Docs** — how `sync` works, and one page per skill covering exactly how
      it runs and every option, in
      [`packages/skills/docs/`](packages/skills/docs/)

## Next

- [ ] **Publish `@euanmsm/skills`** — everything below waits on this
  - Push `euanmadhar/skills-package` and open a pull request into `main`
  - Merge it once CI passes
  - Merge the Version Packages pull request the release workflow then opens,
    which publishes 0.1.0 to npm

- [ ] **Adopt in Curricular and Sales harness**, once `@euanmsm/skills` is
      published
  - Install it and write `.devkit/skills.json`:
    - Curricular: `typecheck` `npx -w apps/main tsc --noEmit`, `preloadSkills`
      `["comments", "readability"]`, `commitRules` `.claude/rules/commits.md`,
      its own `layerOrder`, and `code-review` with `githubReview: true`
    - Sales: `skillsDir` `.agents/skills`, `rulesDir` `.agents/rules`, and
      `code-review` with `name: "review"`
  - Copy the matching fixture to `.devkit/code-review.mjs`
  - Delete the hand-written copies, then run `npx skills sync`
  - Add `skills check` to CI, and the generated paths to `.prettierignore`
  - Install ripgrep in any CI job that runs the review prepass
  - Curricular: upgrade `@euanmsm/terse` to 0.3.0 or newer. The review's comment
    check runs `terse scan`, which 0.2.0 does not have

- [ ] **A dead-code package** — `@euanmsm/dead-code`, owning the dead-code
      checks the way terse owns the comment checks
  - Commands wrapping knip with a repo's settings: a whole-repo check, a check
    of named files, and a branch check that fails only on newly dead code, as
    `terse` does for comments
  - A `.devkit/dead-code.json` for the standing false positives Curricular's
    `dead-code` skill lists by hand today
  - The review prepass then runs it instead of calling knip directly, and the
    report explains which findings are known false positives

- [ ] **pr** — PR creation with the verified manual QA checklist
  - Move into config: the layer table, the checklist sections (Curricular has
    Frontend, Sales has TUI), the boot commands, the Local CI tickboxes, and the
    traps file path
  - Strip the Sales-specific wording from the workflow prompts ("leads", "the
    worker loop", "verbs")
  - Optionally ship `pr-manual-qa.yml`, the GitHub workflow that un-ticks the
    checklist on every push. Sales does not have it yet (its own `TODO.md`,
    `manual-qa-gate`)
  - Same shape as code-review: a JS module config, built-in defaults for
    everything that is not the repo's own
