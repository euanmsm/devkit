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
- [x] **pr** — one engine for both repos' PR skills, configured in
      `.devkit/pr.mjs`, and called `/pr` everywhere. It runs each stage as soon
      as its inputs are ready, rather than phase by phase. Replaying the
      recorded 54-minute Sales run gives 23 minutes, with the same checklist. A
      script prepass and publish step run from the package, and the QA gate is
      optional (`qaGate`). See [`plans/pr-skill.md`](plans/pr-skill.md) and
      [`packages/skills/docs/pr.md`](packages/skills/docs/pr.md)

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
  - PR skill, both repos: copy the matching fixture from
    [`packages/skills/test/fixtures/pr/`](packages/skills/test/fixtures/pr/) to
    `.devkit/pr.mjs`, enable `pr` with `qaGate: true`, and move the existing
    `TRAPS.md` to `<skillsDir>/pr/TRAPS.md` before running `sync`
  - Curricular: delete the `pull-requests` skill, `scripts/ci/manual-qa.mjs`,
    its test and the old `pr-manual-qa.yml`, and change every `/pull-requests`
    to `/pr` (`.claude/CLAUDE.md`, the PR template's comment). Make sure
    `Manual QA` is still the required status check
  - Sales harness: delete `.agents/skills/pr/`'s hand-written files. The gate
    closes that repository's `manual-qa-gate` TODO item

- [ ] **A dead-code package** — `@euanmsm/dead-code`, owning the dead-code
      checks the way terse owns the comment checks
  - Commands wrapping knip with a repo's settings: a whole-repo check, a check
    of named files, and a branch check that fails only on newly dead code, as
    `terse` does for comments
  - A `.devkit/dead-code.json` for the standing false positives Curricular's
    `dead-code` skill lists by hand today
  - The review prepass then runs it instead of calling knip directly, and the
    report explains which findings are known false positives

- [ ] **Measure the PR skill's experiments** — once both repos use it, run `/pr`
      on the same branches with `narrowRounds` and `dropCrossCutting` on and
      off, and compare time, steps, gaps and step quality side by side. Switch
      on only what holds up
