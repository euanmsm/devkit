// ============================================================================
// Skill Options Tests
// ============================================================================
//
// Options that change what a generated skill says: the comments agent loading
// its own skills, typecheck commands and paths, the PR skill's name, story
// matching and gate workflow, and formatting generated files with Prettier.

import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, symlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';

import { check } from '../src/check.mjs';
import { resolvePrConfig } from '../src/pr/config.mjs';
import { sync } from '../src/sync.mjs';
import { prRepo } from './pr-helpers.mjs';
import { makeRepo, write } from './repo.mjs';
import { runWithSkills, SHELLS, stackedRepo } from './stale-base.mjs';

/**
 * Syncs a repository with the given skills and reads one generated file.
 *
 * @param skills - The `skills` object for `skills.json`
 * @param path - The file to read, relative to the root
 * @returns The file's text
 */
async function generated(skills, path) {
  const root = makeRepo({ 'skills.json': { skills } });
  await sync(root);
  return readFileSync(join(root, path), 'utf8');
}

describe('clean-comments — skills in each agent', () => {
  it('gives the agent the Skill tool and a step that loads its skills', async () => {
    const agent = await generated(
      { 'clean-comments': { preloadSkills: ['comments', 'readability'] } },
      '.claude/agents/comments-specialist.md',
    );

    assert.match(agent, /^tools: Bash, Read, Edit, Grep, Glob, Skill$/m);
    assert.match(agent, /skills:\n {2}- comments\n {2}- readability\n/);
    assert.match(
      agent,
      /### 0\. Load your skills[\s\S]*Skill\(skill: "comments"\)\nSkill\(skill: "readability"\)/,
    );
    assert.match(agent, /load any skill it names/);
  });

  it('says the orchestrator’s own loads cover only its own edits', async () => {
    const skill = await generated(
      { 'clean-comments': {} },
      '.claude/skills/clean-comments/SKILL.md',
    );

    assert.doesNotMatch(skill, /session-scoped/);
    assert.match(skill, /Each `comments-specialist` loads its own/);
  });

  it('limits the typecheck to the paths given, and runs it always without them', async () => {
    const path = '.claude/skills/clean-comments/SKILL.md';
    const scoped = await generated(
      {
        'clean-comments': {
          typecheck: 'npm run typecheck',
          typecheckPaths: ['apps/web/', 'packages/ui/'],
        },
      },
      path,
    );
    assert.match(
      scoped,
      /swallow code\. Run it only when a changed file sits under `apps\/web\/`, `packages\/ui\/`; otherwise say it was skipped and why:\n\n```bash\nnpm run typecheck\n```/,
    );

    const always = await generated(
      { 'clean-comments': { typecheck: 'npm run typecheck' } },
      path,
    );
    assert.match(always, /can swallow code:\n\n```bash\nnpm run typecheck/);

    const none = await generated({ 'clean-comments': {} }, path);
    assert.doesNotMatch(none, /Typecheck/);
  });
});

describe('dead-code — typecheck', () => {
  const path = '.claude/skills/dead-code/SKILL.md';

  it('names the configured command, or the repository’s typecheck without one', async () => {
    const named = await generated(
      { 'dead-code': { typecheck: 'npx tsc --noEmit' } },
      path,
    );
    assert.match(
      named,
      /4\. Run the typecheck, `npx tsc --noEmit`, which catches/,
    );

    const plain = await generated({ 'dead-code': {} }, path);
    assert.match(plain, /4\. Run the repository's typecheck, which catches/);
  });
});

describe('reading-order — output folder', () => {
  const path = '.claude/skills/reading-order/SKILL.md';

  it('writes into tmp by default, or the folder given without its trailing slash', async () => {
    const plain = await generated({ 'reading-order': {} }, path);
    assert.match(plain, /`tmp\/<branch>\/reading-order\.tmp\.md`/);

    const named = await generated(
      { 'reading-order': { outputDir: '.scratch/review/' } },
      path,
    );
    assert.match(
      named,
      /`\.scratch\/review\/<branch>\/reading-order\.tmp\.md`/,
    );
  });

  it('reads a stacked branch over its parent, not over main', async () => {
    const skill = await generated({ 'reading-order': {} }, path);
    const lines = skill.split('\n');
    const start = lines.findIndex((line) => line.startsWith('BASE_VARS='));
    const block = lines
      .slice(start, lines.indexOf('```', start))
      .join('\n')
      .replace('<the branch given, or empty>', '');
    const { repo, parentHead } = stackedRepo();

    for (const shell of SHELLS) {
      const out = runWithSkills(shell, block, repo);
      assert.match(out, /^base: parent \(the branch reflog\)$/m, shell);
      assert.match(out, new RegExp(`^fork: ${parentHead}$`, 'm'), shell);
      assert.match(out, / child\.txt$/m, shell);
      assert.doesNotMatch(out, / parent\.txt$/m, shell);
    }
  });

  it('rejects a folder outside the repository', async () => {
    for (const outputDir of ['/tmp', '../tmp', 'a/../../b', 'my notes']) {
      const root = makeRepo({
        'skills.json': { skills: { 'reading-order': { outputDir } } },
      });
      await assert.rejects(
        () => sync(root),
        /Option "outputDir" for skill "reading-order".*must be a folder inside the repository/,
      );
    }
  });
});

describe('pr — skill name', () => {
  it('writes the skill under its name and uses it everywhere', async () => {
    const root = prRepo('sales', {
      options: { name: 'pull-requests', qaGate: true },
    });
    const { written } = await sync(root);

    assert.ok(written.includes('.claude/skills/pull-requests/SKILL.md'));
    assert.ok(
      written.includes('.claude/skills/pull-requests/pr-qa.workflow.js'),
    );
    assert.ok(written.includes('.claude/skills/pull-requests/TRAPS.md'));
    assert.ok(!written.some((path) => path.startsWith('.claude/skills/pr/')));

    const skill = readFileSync(
      join(root, '.claude/skills/pull-requests/SKILL.md'),
      'utf8',
    );
    assert.match(skill, /^name: pull-requests$/m);
    assert.match(skill, /always use \/pull-requests\./);
    assert.match(skill, /```\n\/pull-requests\n```/);
    assert.doesNotMatch(skill, /(^|[\s`"])\/pr\b/m);

    const workflow = readFileSync(
      join(root, '.claude/skills/pull-requests/pr-qa.workflow.js'),
      'utf8',
    );
    assert.match(workflow, /name: "pull-requests"/);

    const gate = readFileSync(
      join(root, '.github/workflows/pr-manual-qa.yml'),
      'utf8',
    );
    assert.equal(gate.match(/QA_SKILL: pull-requests/g).length, 2);
    assert.match(gate, /the PR comment `\/pull-requests` posts/);
  });

  it('refuses a name that cannot be a folder and a slash command', async () => {
    const root = prRepo('sales', { options: { name: 'Pull Requests' } });
    await assert.rejects(sync(root), /Option "name" for skill "pr".*lowercase/);
  });
});

describe('pr — story matching', () => {
  const context = { skillsDir: '.claude/skills', source: 'test' };
  const layers = [
    { key: 'api', title: 'API', paths: ['src/'], section: 'backend' },
  ];

  it('defaults to both, and refuses anything else', () => {
    assert.equal(resolvePrConfig({ layers }, context).storyMatch, 'both');
    assert.equal(
      resolvePrConfig({ layers, storyMatch: 'stem' }, context).storyMatch,
      'stem',
    );
    assert.throws(
      () => resolvePrConfig({ layers, storyMatch: 'folder' }, context),
      /storyMatch must be one of stem, imports, both/,
    );
  });
});

describe('pr — the gate workflow', () => {
  /**
   * Syncs the PR skill with a `qaGate` value and reads the gate workflow.
   *
   * @param qaGate - The option's value
   * @returns The workflow's text
   */
  async function gate(qaGate) {
    const root = prRepo('sales', { options: { qaGate } });
    await sync(root);
    return readFileSync(
      join(root, '.github/workflows/pr-manual-qa.yml'),
      'utf8',
    );
  }

  it('keeps npx on Node 22 for `true`', async () => {
    const yml = await gate(true);
    assert.equal(yml.match(/node-version: 22/g).length, 2);
    assert.equal(
      yml.match(/run: npx --yes @euanmsm\/skills@[\d.]+ qa-gate/g).length,
      2,
    );
    assert.doesNotMatch(yml, /actions\/checkout|npm ci/);
  });

  it('reads the Node version from a file and runs the lockfile’s copy', async () => {
    const yml = await gate({ nodeVersionFile: '.nvmrc', install: 'lockfile' });

    assert.equal(yml.match(/node-version-file: \.nvmrc/g).length, 2);
    assert.equal(
      yml.match(
        /- uses: actions\/checkout@v4\n {8}with:\n {10}ref: \$\{\{ github\.event\.repository\.default_branch \}\}\n {10}persist-credentials: false/g,
      ).length,
      2,
    );
    assert.equal(yml.match(/run: npm ci --ignore-scripts/g).length, 2);
    assert.match(yml, /run: npx --no-install skills qa-gate reset/);
    assert.match(yml, /run: npx --no-install skills qa-gate status/);
    assert.doesNotMatch(yml, /npx --yes/);
  });

  it('checks out for a version file even when npx fetches the package', async () => {
    const yml = await gate({ nodeVersionFile: '.nvmrc' });
    assert.match(yml, /actions\/checkout@v4/);
    assert.doesNotMatch(yml, /npm ci/);
    assert.match(yml, /npx --yes @euanmsm\/skills@/);
  });

  it('takes a pinned Node version', async () => {
    const yml = await gate({ nodeVersion: '24' });
    assert.equal(yml.match(/node-version: 24/g).length, 2);
  });

  it('refuses settings it does not know or that contradict each other', async () => {
    for (const [qaGate, problem] of [
      [{ node: '24' }, /must be true, false, or an object of/],
      [{ nodeVersion: '24', nodeVersionFile: '.nvmrc' }, /not both/],
      [{ install: 'pnpm' }, /install as one of "npx", "lockfile"/],
      [{ nodeVersion: '' }, /nodeVersion as a non-empty string/],
      ['yes', /must be true, false, or an object/],
    ]) {
      const root = prRepo('sales', { options: { qaGate } });
      await assert.rejects(sync(root), problem);
    }
  });
});

describe('format — Prettier', () => {
  /**
   * Makes a repository that can load the monorepo's Prettier.
   *
   * @param skills - The `skills` object for `skills.json`
   * @param prettierrc - The repository's Prettier config
   * @returns The root
   */
  function prettierRepo(skills, prettierrc) {
    const root = makeRepo({
      'skills.json': { format: 'prettier', skills },
    });
    write(root, 'package.json', '{}\n');
    write(root, '.prettierrc', JSON.stringify(prettierrc));

    const prettier = dirname(
      createRequire(import.meta.url).resolve('prettier/package.json'),
    );
    mkdirSync(join(root, 'node_modules'));
    symlinkSync(prettier, join(root, 'node_modules/prettier'), 'dir');
    return root;
  }

  it('writes files the repository’s Prettier leaves alone, and check agrees', async () => {
    const root = prettierRepo(
      { 'code-review': {} },
      { singleQuote: false, useTabs: true },
    );
    await sync(root);

    const workflow = readFileSync(
      join(root, '.claude/skills/review/review.workflow.js'),
      'utf8',
    );
    assert.match(workflow, /^\tconst /m);
    assert.match(workflow, /^\/\/ Generated by @euanmsm\/skills/);
    assert.deepEqual(await check(root), []);
    assert.equal((await sync(root)).written.length, 0);
  });

  it('leaves a file the repository ignores as the template renders it', async () => {
    const root = prettierRepo(
      { 'code-review': {} },
      { singleQuote: false, useTabs: true },
    );
    write(root, '.prettierignore', '.claude/\n');
    await sync(root);

    const workflow = readFileSync(
      join(root, '.claude/skills/review/review.workflow.js'),
      'utf8',
    );
    assert.doesNotMatch(workflow, /^\tconst /m);
  });

  it('asks for Prettier when the repository has none', async () => {
    const root = makeRepo({
      'skills.json': { format: 'prettier', skills: { 'dead-code': {} } },
    });
    await assert.rejects(sync(root), /needs Prettier installed/);
  });

  it('refuses a formatter it does not know', async () => {
    const root = makeRepo({
      'skills.json': { format: 'biome', skills: {} },
    });
    await assert.rejects(
      sync(root),
      /"format".*must be one of "none", "prettier"/,
    );
  });
});
