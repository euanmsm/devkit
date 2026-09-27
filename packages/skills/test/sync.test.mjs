// ============================================================================
// Sync and Check Tests
// ============================================================================
//
// Runs sync and check against throwaway repositories.

import assert from 'node:assert/strict';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { check } from '../src/check.mjs';
import { readConfig } from '../src/config.mjs';
import { MARKER_TAG, plan, sync } from '../src/sync.mjs';
import { FIXTURES, TEMPLATE } from './pr-helpers.mjs';
import curricularReview from './fixtures/review/curricular.mjs';
import salesReview from './fixtures/review/sales.mjs';
import { makeRepo, write } from './repo.mjs';

const BOTH = {
  skills: { 'clean-commit-history': {}, 'clean-comments': {} },
};

/** Every skill, with the optional files switched on so each template renders. */
const EVERYTHING = {
  skills: {
    ...BOTH.skills,
    'code-review': { githubReview: true },
    pr: { qaGate: true },
  },
};

/** The folder holding the Curricular and Sales harness review configs. */
const REVIEW_FIXTURES = fileURLToPath(
  new URL('./fixtures/review/', import.meta.url),
);

/** The review fixtures by name, matching the PR fixtures of the same name. */
const REVIEW_CONFIGS = { curricular: curricularReview, sales: salesReview };

/** The example config this package ships. */
const EXAMPLE = fileURLToPath(
  new URL('../skills.example.json', import.meta.url),
);

/**
 * Writes a config module that re-exports another.
 *
 * @param path - Absolute path to the module to re-export
 * @returns The module's source
 */
function reexport(path) {
  return `export { default } from ${JSON.stringify(path)};\n`;
}

/**
 * Finds one planned file's content by the end of its path.
 *
 * @param root - The repository root
 * @param suffix - The end of the file's path
 * @returns The rendered content
 */
async function planned(root, suffix) {
  return (await plan(root)).find((file) => file.path.endsWith(suffix)).content;
}

describe('readConfig', () => {
  test('throws when there is no config', () => {
    assert.throws(() => readConfig(makeRepo()), /No \.devkit\/skills\.json/);
  });

  test('rejects an unknown skill, naming the ones that exist', () => {
    const root = makeRepo({ 'skills.json': { skills: { nope: {} } } });

    assert.throws(
      () => readConfig(root),
      /Unknown skill "nope".*clean-comments/,
    );
  });

  test('rejects an unknown option', () => {
    const root = makeRepo({
      'skills.json': { skills: { 'clean-comments': { typo: 1 } } },
    });

    assert.throws(() => readConfig(root), /Unknown option "typo"/);
  });

  test('rejects an unknown shared setting', () => {
    const root = makeRepo({ 'skills.json': { skilsDir: 'x', skills: {} } });

    assert.throws(() => readConfig(root), /Unknown setting "skilsDir"/);
  });

  test('names the config file in every unknown-name error', () => {
    for (const config of [
      { skills: { nope: {} } },
      { skills: { 'clean-comments': { typo: 1 } } },
      { skilsDir: 'x', skills: {} },
    ]) {
      const root = makeRepo({ 'skills.json': config });
      assert.throws(() => readConfig(root), /\.devkit\/skills\.json/);
    }
  });

  test('rejects a skills value that is not an object', () => {
    for (const skills of [null, [], 'clean-comments']) {
      const root = makeRepo({ 'skills.json': { skills } });

      assert.throws(
        () => readConfig(root),
        /"skills" in \.devkit\/skills\.json must be an object/,
      );
    }
  });

  test('rejects a skill set to false, saying to remove the key instead', () => {
    const root = makeRepo({
      'skills.json': { skills: { 'clean-comments': false } },
    });

    assert.throws(
      () => readConfig(root),
      /Skill "clean-comments" in \.devkit\/skills\.json is false\. Remove the key/,
    );
  });

  test('rejects a skill whose value is not an object', () => {
    for (const value of [true, null, 'on', []]) {
      const root = makeRepo({
        'skills.json': { skills: { 'clean-comments': value } },
      });

      assert.throws(
        () => readConfig(root),
        /Skill "clean-comments" in \.devkit\/skills\.json must be an object/,
      );
    }
  });

  test('rejects an option whose type differs from its default', () => {
    const cases = [
      ['clean-commit-history', 'layerOrder', 'a,b', /a list of strings/],
      ['clean-comments', 'preloadSkills', ['comments', 1], /a list of strings/],
      ['clean-comments', 'typecheck', true, /a string/],
      ['code-review', 'githubReview', 'yes', /true or false/],
    ];

    for (const [skill, key, value, type] of cases) {
      const root = makeRepo({
        'skills.json': { skills: { [skill]: { [key]: value } } },
      });

      assert.throws(
        () => readConfig(root),
        new RegExp(
          `Option "${key}" for skill "${skill}" in \\.devkit/skills\\.json must be ${type.source}`,
        ),
      );
    }
  });

  test('rejects a code-review name that is not a plain folder name', () => {
    for (const name of ['team/review', '../../outside', 'Review', '-x', '']) {
      const root = makeRepo({
        'skills.json': { skills: { 'code-review': { name } } },
      });

      assert.throws(
        () => readConfig(root),
        /Option "name" for skill "code-review" in \.devkit\/skills\.json must be/,
        name,
      );
    }
  });

  test('rejects a shared setting that is not a non-empty string', () => {
    for (const [key, value] of [
      ['skillsDir', ''],
      ['agentsDir', 3],
      ['rulesDir', null],
      ['baseBranch', ''],
    ]) {
      const root = makeRepo({ 'skills.json': { [key]: value, skills: {} } });

      assert.throws(
        () => readConfig(root),
        new RegExp(
          `Setting "${key}" in \\.devkit/skills\\.json must be a non-empty string`,
        ),
      );
    }
  });

  test('drops a trailing slash from the directory settings', () => {
    const root = makeRepo({
      'skills.json': {
        skillsDir: '.claude/skills/',
        agentsDir: './agents//',
        skills: {},
      },
    });
    const config = readConfig(root);

    assert.equal(config.skillsDir, '.claude/skills');
    assert.equal(config.agentsDir, 'agents');
  });
});

describe('plan', () => {
  test('leaves no placeholder unfilled', async () => {
    for (const { path, content } of await plan(
      makeRepo({ 'skills.json': BOTH }),
    )) {
      assert.doesNotMatch(content, /\{\{/, path);
    }
  });

  test('puts the marker in every file, after the frontmatter', async () => {
    for (const { content } of await plan(makeRepo({ 'skills.json': BOTH }))) {
      assert.match(content, /^---\n[\s\S]*?\n---\n\n<!-- Generated by/);
    }
  });

  test('writes the agent alongside clean-comments', async () => {
    const paths = (await plan(makeRepo({ 'skills.json': BOTH }))).map(
      (file) => file.path,
    );

    assert.deepEqual(paths.sort(), [
      '.claude/agents/comments-specialist.md',
      '.claude/skills/clean-comments/SKILL.md',
      '.claude/skills/clean-commit-history/SKILL.md',
    ]);
  });

  test('honours skillsDir, agentsDir and baseBranch', async () => {
    const root = makeRepo({
      'skills.json': {
        ...BOTH,
        skillsDir: '.agents/skills',
        agentsDir: 'agents',
        baseBranch: 'trunk',
      },
    });
    const files = await plan(root);

    assert.ok(files.some((f) => f.path === 'agents/comments-specialist.md'));
    assert.ok(
      files
        .filter((f) => f.path.startsWith('.agents/skills/'))
        .every((f) => f.content.includes('trunk')),
    );
  });

  test('reads the comment contract path from terse.json', async () => {
    const root = makeRepo({
      'skills.json': BOTH,
      'terse.json': { rulesDoc: 'docs/comments.md' },
    });

    for (const { path, content } of await plan(root)) {
      if (path.includes('comment')) assert.match(content, /docs\/comments\.md/);
    }
  });

  test('falls back to the terse-docs default when rulesDoc is unset', async () => {
    const root = makeRepo({ 'skills.json': BOTH });

    assert.match(
      await planned(root, 'clean-comments/SKILL.md'),
      /\.devkit\/comment-rules\.md/,
    );
  });

  test('drops the typecheck step unless one is configured', async () => {
    const without = makeRepo({ 'skills.json': BOTH });
    assert.doesNotMatch(
      await planned(without, 'clean-comments/SKILL.md'),
      /Typecheck/,
    );

    const withTypecheck = makeRepo({
      'skills.json': {
        skills: { 'clean-comments': { typecheck: 'npm run typecheck' } },
      },
    });
    assert.match(
      await planned(withTypecheck, 'clean-comments/SKILL.md'),
      /Typecheck[\s\S]*npm run typecheck/,
    );
  });

  test('loads every preload skill in the skill and the agent', async () => {
    const root = makeRepo({
      'skills.json': {
        skills: {
          'clean-comments': { preloadSkills: ['comments', 'readability'] },
        },
      },
    });

    assert.match(
      await planned(root, 'clean-comments/SKILL.md'),
      /Skill\(skill: "readability"\)/,
    );
    assert.match(
      await planned(root, 'comments-specialist.md'),
      /skills:\n {2}- comments\n {2}- readability\n---/,
    );
  });

  test('points at commitRules when set, and a fallback when not', async () => {
    const withRules = makeRepo({
      'skills.json': {
        skills: { 'clean-commit-history': { commitRules: 'rules/commits.md' } },
      },
    });
    const ruled = await planned(withRules, 'SKILL.md');
    assert.match(ruled, /`rules\/commits\.md`/);
    assert.doesNotMatch(ruled, /Conventional Commits/);

    const without = makeRepo({
      'skills.json': { skills: { 'clean-commit-history': {} } },
    });
    assert.match(await planned(without, 'SKILL.md'), /Conventional Commits/);
  });

  test('leaves no placeholder unfilled in any skill, from either fixture config', async () => {
    for (const [fixture, review] of Object.entries(REVIEW_CONFIGS)) {
      const root = makeRepo({
        'skills.json': EVERYTHING,
        'code-review.mjs': reexport(join(REVIEW_FIXTURES, `${fixture}.mjs`)),
        'pr.mjs': reexport(join(FIXTURES, `${fixture}.mjs`)),
      });
      write(root, '.github/pull_request_template.md', TEMPLATE);
      for (const lens of Object.values(review.lenses)) {
        if (lens?.skill)
          write(root, `.claude/skills/${lens.skill}/SKILL.md`, '');
      }

      for (const { path, content } of await plan(root)) {
        // A workflow script is code, not a template, and fills its own `{{branch}}` at run time.
        if (path.endsWith('.workflow.js')) continue;
        // `${{ … }}` is a GitHub Actions expression, not a placeholder.
        assert.doesNotMatch(content, /(?<!\$)\{\{/, `${fixture}: ${path}`);
      }
    }
  });

  test('fails when two skills would write the same file, naming both', async () => {
    const root = makeRepo({
      'skills.json': {
        skills: {
          'clean-comments': {},
          'code-review': { name: 'clean-comments' },
        },
      },
    });

    await assert.rejects(
      () => plan(root),
      /"clean-comments" and "code-review" in \.devkit\/skills\.json both write \.claude\/skills\/clean-comments\/SKILL\.md/,
    );
  });

  test('names the skill’s own config file in its marker', async () => {
    const root = makeRepo({
      'skills.json': {
        skills: {
          'clean-comments': {},
          'code-review': { config: '.devkit/review.mjs' },
          pr: { qaGate: true },
        },
      },
      'pr.mjs': reexport(join(FIXTURES, 'curricular.mjs')),
    });
    write(root, '.github/pull_request_template.md', TEMPLATE);
    const own = {
      'code-review': '.devkit/review.mjs',
      pr: '.devkit/pr.mjs',
      'pr-manual-qa': '.devkit/pr.mjs',
    };

    for (const { path, content, seed } of await plan(root)) {
      if (seed) continue;
      const line = content
        .split('\n')
        .find((text) => text.includes(MARKER_TAG));
      const source = Object.entries(own).find(
        ([key]) => path.includes(`${key}/`) || path.includes(`${key}.yml`),
      )?.[1];
      const expected = source
        ? `${MARKER_TAG} from .devkit/skills.json and ${source}. Edit those,`
        : `${MARKER_TAG} from .devkit/skills.json. Edit that,`;

      assert.ok(line.includes(expected), `${path}: ${line}`);
    }
  });
});

describe('generated commands', () => {
  /**
   * Plans every skill, with the optional files switched on so each template renders.
   *
   * @returns The planned files
   */
  async function planEverything() {
    const root = makeRepo({
      'skills.json': EVERYTHING,
      'pr.mjs': reexport(join(FIXTURES, 'curricular.mjs')),
    });
    write(root, '.github/pull_request_template.md', TEMPLATE);
    return plan(root);
  }

  test('scans with the terse CLI, not the scanner module', async () => {
    const root = makeRepo({ 'skills.json': BOTH });

    for (const suffix of [
      'clean-comments/SKILL.md',
      'comments-specialist.md',
    ]) {
      const content = await planned(root, suffix);
      assert.match(content, /npx --no-install terse scan /, suffix);
      assert.doesNotMatch(content, /scanner\.mjs/, suffix);
    }
  });

  test('rewrites history from the fork point, not the base tip', async () => {
    const content = await planned(
      makeRepo({ 'skills.json': BOTH }),
      'clean-commit-history/SKILL.md',
    );

    assert.match(content, /FORK=\$\(git merge-base "\$BASE" HEAD\)/);
    assert.match(content, /git reset --soft "\$FORK"/);
    assert.match(content, /git diff --name-status "\$FORK" HEAD/);
    assert.doesNotMatch(content, /reset --soft \$BASE|\$BASE\.\.HEAD/);
  });

  test('never runs a bare `npx skills`, which npm resolves to a stranger', async () => {
    for (const { path, content } of await planEverything()) {
      assert.doesNotMatch(content, /npx skills\b/, path);
    }
  });
});

describe('sync and check', () => {
  test('check passes straight after sync', async () => {
    const root = makeRepo({ 'skills.json': BOTH });
    await sync(root);

    assert.deepEqual(await check(root), []);
  });

  test('a second sync changes nothing', async () => {
    const root = makeRepo({ 'skills.json': BOTH });
    await sync(root);

    assert.deepEqual((await sync(root)).written, []);
  });

  test('check reports a missing file', async () => {
    const problems = await check(makeRepo({ 'skills.json': BOTH }));

    assert.equal(problems.length, 3);
    assert.ok(problems.every((p) => p.problem === 'missing'));
  });

  test('check reports a hand edit', async () => {
    const root = makeRepo({ 'skills.json': BOTH });
    await sync(root);

    const path = join(root, '.claude/skills/clean-comments/SKILL.md');
    writeFileSync(path, `${readFileSync(path, 'utf8')}\nextra\n`);

    assert.deepEqual(await check(root), [
      {
        path: '.claude/skills/clean-comments/SKILL.md',
        problem: 'out of date or edited by hand',
      },
    ]);
  });

  test('refuses to overwrite a hand-written skill, and writes nothing', async () => {
    const root = makeRepo({ 'skills.json': BOTH });
    write(root, '.claude/skills/clean-comments/SKILL.md', 'mine');

    await assert.rejects(() => sync(root), /clean-comments\/SKILL\.md/);
    assert.equal(existsSync(join(root, '.claude/agents')), false);
  });

  test('overwrites a hand-written skill with --force', async () => {
    const root = makeRepo({ 'skills.json': BOTH });
    write(root, '.claude/skills/clean-comments/SKILL.md', 'mine');

    await sync(root, { force: true });

    assert.deepEqual(await check(root), []);
  });

  test('removes a generated skill the config no longer names', async () => {
    const root = makeRepo({ 'skills.json': BOTH });
    await sync(root);

    writeFileSync(
      join(root, '.devkit/skills.json'),
      JSON.stringify({ skills: { 'clean-commit-history': {} } }),
    );

    assert.deepEqual(
      (await check(root)).map((p) => p.problem),
      ['no longer in the config', 'no longer in the config'],
    );

    const { removed } = await sync(root);

    assert.equal(removed.length, 2);
    assert.equal(
      existsSync(join(root, '.claude/skills/clean-comments')),
      false,
    );
    assert.deepEqual(await check(root), []);
  });

  test('leaves hand-written skills beside the generated ones alone', async () => {
    const root = makeRepo({ 'skills.json': BOTH });
    write(root, '.claude/skills/comments/SKILL.md', 'mine');
    write(root, '.claude/agents/other.md', 'mine');

    await sync(root);
    writeFileSync(
      join(root, '.devkit/skills.json'),
      JSON.stringify({ skills: {} }),
    );
    await sync(root);

    assert.equal(
      readFileSync(join(root, '.claude/skills/comments/SKILL.md'), 'utf8'),
      'mine',
    );
    assert.ok(
      !readFileSync(join(root, '.claude/agents/other.md'), 'utf8').includes(
        MARKER_TAG,
      ),
    );
  });

  test('leaves a hand-written file that only quotes the marker alone', async () => {
    const root = makeRepo({ 'skills.json': BOTH });
    const rule = `# Generated skills\n\nFiles carrying "${MARKER_TAG}" are written by sync; never edit them.\n`;
    const skill = `---\nname: mine\n---\n\nSkip anything that says ${MARKER_TAG}.\n`;
    write(root, '.claude/rules/x.md', rule);
    write(root, '.claude/skills/mine/SKILL.md', skill);

    assert.deepEqual((await sync(root)).removed, []);
    assert.deepEqual(await check(root), []);
    assert.equal(readFileSync(join(root, '.claude/rules/x.md'), 'utf8'), rule);
    assert.equal(
      readFileSync(join(root, '.claude/skills/mine/SKILL.md'), 'utf8'),
      skill,
    );
  });

  test('still owns a generated file whose marker wording is older', async () => {
    const root = makeRepo({ 'skills.json': BOTH });
    await sync(root);

    const path = join(root, '.claude/skills/clean-comments/SKILL.md');
    writeFileSync(
      path,
      readFileSync(path, 'utf8').replace(
        /<!-- Generated by @euanmsm\/skills[^\n]*-->/,
        `<!-- ${MARKER_TAG} from an older release. -->`,
      ),
    );

    assert.deepEqual((await sync(root)).written, [
      '.claude/skills/clean-comments/SKILL.md',
    ]);
    assert.deepEqual(await check(root), []);
  });

  test('removes a skill folder left empty when skillsDir ends in a slash', async () => {
    const root = makeRepo({
      'skills.json': { ...BOTH, skillsDir: '.claude/skills/' },
    });
    await sync(root);

    writeFileSync(
      join(root, '.devkit/skills.json'),
      JSON.stringify({
        skillsDir: '.claude/skills/',
        skills: { 'clean-commit-history': {} },
      }),
    );
    await sync(root);

    assert.equal(
      existsSync(join(root, '.claude/skills/clean-comments')),
      false,
    );
  });

  test('syncs the shipped example config into an empty repository', async () => {
    const root = makeRepo();
    copyFileSync(EXAMPLE, join(root, '.devkit/skills.json'));

    assert.ok((await sync(root)).written.length > 0);
    assert.deepEqual(await check(root), []);
  });
});
