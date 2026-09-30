// ============================================================================
// Sync and Check Tests
// ============================================================================
//
// Runs sync and check against throwaway repositories.

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { check } from '../src/check.mjs';
import { readConfig } from '../src/config.mjs';
import { MARKER_TAG, plan, sync } from '../src/sync.mjs';
import { FIXTURES, TEMPLATE } from './pr-helpers.mjs';
import webappReview from './fixtures/review/webapp.mjs';
import salesReview from './fixtures/review/sales.mjs';
import { makeRepo, write } from './repo.mjs';
import { runShell, SHELLS, staleBaseRepo } from './stale-base.mjs';

const BOTH = {
  skills: { 'clean-commit-history': {}, 'clean-comments': {} },
};

/** Every skill, with the optional files switched on so each template renders. */
const EVERYTHING = {
  skills: {
    ...BOTH.skills,
    'code-review': { githubReview: true },
    'dead-code': {},
    pr: { qaGate: true },
    'reading-order': {},
  },
};

/** The folder holding the web app and Sales harness review configs. */
const REVIEW_FIXTURES = fileURLToPath(
  new URL('./fixtures/review/', import.meta.url),
);

/** The review fixtures by name, matching the PR fixtures of the same name. */
const REVIEW_CONFIGS = { webapp: webappReview, sales: salesReview };

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

/**
 * Finds the fenced shell block holding a line, from that line to the fence's end.
 *
 * @param content - The rendered skill
 * @param first - The start of the block's first line to run
 * @returns The block's lines from that one on
 */
function fenced(content, first) {
  const lines = content.split('\n');
  const start = lines.findIndex((line) => line.startsWith(first));
  const end = lines.indexOf('```', start);
  return lines.slice(start, end).join('\n');
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
      'pr.mjs': reexport(join(FIXTURES, 'webapp.mjs')),
    });
    write(root, '.github/pull_request_template.md', TEMPLATE);
    const own = {
      review: '.devkit/review.mjs',
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
      'pr.mjs': reexport(join(FIXTURES, 'webapp.mjs')),
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

    assert.match(content, /git merge-base "\$BASE" HEAD/);
    assert.match(content, /git reset -q --soft "\$FORK"/);
    assert.match(content, /git diff --name-status <FORK> HEAD/);
    assert.doesNotMatch(content, /reset (-q )?--soft "?\$BASE|\$BASE\.\.HEAD/);
  });

  test('takes the fork point from origin when the local base is behind it', async () => {
    const content = await planned(
      makeRepo({ 'skills.json': BOTH }),
      'clean-commit-history/SKILL.md',
    );
    const preflight = fenced(content, 'BASE=').replace(
      'BASE=<base branch>',
      'BASE=main',
    );

    for (const behind of ['local', 'origin', 'none']) {
      const { repo, fork } = staleBaseRepo({ behind });
      for (const shell of SHELLS) {
        assert.equal(
          runShell(shell, preflight, repo).split('\n').at(-1),
          fork,
          `${behind} copy behind, in ${shell}`,
        );
      }
    }
  });

  test('takes the base branch from $ARGUMENTS and checks it exists', async () => {
    const content = await planned(
      makeRepo({ 'skills.json': BOTH }),
      'clean-commit-history/SKILL.md',
    );

    assert.match(
      content,
      /Base branch: `\$ARGUMENTS` if given, otherwise `main`/,
    );
    assert.match(
      content,
      /git rev-parse --verify --quiet "\$BASE\^\{commit\}"/,
    );
    assert.doesNotMatch(content, /\$1\b|\$\{1:-/);
  });

  test('always creates a local backup, reusing one at the same commit', async () => {
    const content = await planned(
      makeRepo({ 'skills.json': BOTH }),
      'clean-commit-history/SKILL.md',
    );

    assert.match(
      content,
      /Always create a local backup branch, even when the branch is\s+pushed/,
    );
    assert.match(content, /git branch "\$BACKUP" <ORIGINAL_HEAD>/);
    assert.match(content, /reusing \$BACKUP/);
    assert.doesNotMatch(content, /the remote is the backup/);
  });

  test('restores the original commit when the script fails', async () => {
    const content = await planned(
      makeRepo({ 'skills.json': BOTH }),
      'clean-commit-history/SKILL.md',
    );
    const script = content.slice(content.indexOf('#!/usr/bin/env bash'));

    assert.match(script, /^ORIGINAL_HEAD=<full sha>$/m);
    const trap = script.indexOf(`trap 'git reset -q --hard "$ORIGINAL_HEAD"`);
    assert.ok(trap > 0, 'the script sets the ERR trap');
    assert.match(script, /' ERR$/m);
    assert.ok(
      trap < script.indexOf('git reset -q --soft "$FORK"'),
      'the trap is armed before the first reset',
    );
    assert.doesNotMatch(content, /unchanged from the last good commit/);
  });

  test('warns about commit hooks and signing, and never skips them', async () => {
    const content = await planned(
      makeRepo({ 'skills.json': BOTH }),
      'clean-commit-history/SKILL.md',
    );

    assert.match(content, /git config --get core\.hooksPath/);
    assert.match(content, /test -d \.husky/);
    assert.match(content, /git config --get commit\.gpgsign/);
    assert.match(content, /warn the user before running the script/);
    assert.match(content, /Do not skip them with `--no-verify`/);
  });

  test('checks a comment cleanup against a snapshot, not git', async () => {
    const root = makeRepo({ 'skills.json': BOTH });
    const skill = await planned(root, 'clean-comments/SKILL.md');
    const agent = await planned(root, 'comments-specialist.md');

    assert.match(skill, /tar -cf - -- <files> \| tar -xf - -C <snapshot>/);
    assert.match(skill, /The snapshot folder's absolute path/);
    for (const [name, content] of [
      ['skill', skill],
      ['agent', agent],
    ]) {
      assert.match(
        content,
        /git diff --no-index -- "<snapshot>\/\$f" "\$f"/,
        name,
      );
      assert.doesNotMatch(content, /git diff (--stat )?-- </, name);
    }
  });

  test('leaves deleted files out of the comment cleanup scope', async () => {
    const content = await planned(
      makeRepo({ 'skills.json': BOTH }),
      'clean-comments/SKILL.md',
    );

    assert.match(content, /diff --name-only --diff-filter=d HEAD/);
    assert.match(content, /diff --name-only --diff-filter=d "\$FORK" HEAD/);
    assert.match(content, /ls-files --others --exclude-standard/);
    assert.doesNotMatch(content, /awk '\{print \$NF\}'/);
  });

  test('scopes a clean tree to the branch, whichever copy of the base is behind', async () => {
    const content = await planned(
      makeRepo({ 'skills.json': BOTH }),
      'clean-comments/SKILL.md',
    );
    const scope = fenced(content, 'FORK=');

    for (const behind of ['local', 'origin', 'none', 'gone']) {
      const { repo } = staleBaseRepo({ behind });
      for (const shell of SHELLS) {
        assert.equal(
          runShell(shell, scope, repo),
          'mine.txt',
          `${behind}, in ${shell}`,
        );
      }
    }
  });

  test('fans out unless both the file and the finding counts are small', async () => {
    const root = makeRepo({ 'skills.json': BOTH });
    const skill = await planned(root, 'clean-comments/SKILL.md');
    const agent = await planned(root, 'comments-specialist.md');

    assert.match(skill, /≤ 3 files and ≤ 40 findings/);
    assert.match(
      agent,
      /^description: >\n {2}Spawned by \/clean-comments for one batch of files\./m,
    );
    assert.doesNotMatch(agent, /WHENEVER/);
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

  test('removes a dropped agent once when agentsDir and rulesDir are one folder', async () => {
    const shared = { agentsDir: '.claude/shared', rulesDir: '.claude/shared' };
    const root = makeRepo({ 'skills.json': { ...shared, ...BOTH } });
    await sync(root);

    writeFileSync(
      join(root, '.devkit/skills.json'),
      JSON.stringify({ ...shared, skills: { 'clean-commit-history': {} } }),
    );

    assert.equal((await check(root)).length, 2);
    assert.equal((await sync(root)).removed.length, 2);
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

  test('leaves generated files a CRLF checkout rewrote in step, and removes them when dropped', async () => {
    const root = makeRepo({ 'skills.json': BOTH });
    const { written } = await sync(root);
    for (const path of written) {
      const target = join(root, path);
      writeFileSync(
        target,
        readFileSync(target, 'utf8').replace(/\n/g, '\r\n'),
      );
    }

    assert.deepEqual((await sync(root)).written, []);
    assert.deepEqual(await check(root), []);

    const path = join(root, '.claude/agents/comments-specialist.md');
    writeFileSync(
      join(root, '.devkit/skills.json'),
      JSON.stringify({ skills: { 'clean-commit-history': {} } }),
    );

    assert.ok(
      (await sync(root)).removed.includes(
        '.claude/agents/comments-specialist.md',
      ),
    );
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

describe('the dead-code skill', () => {
  /** The skills CLI, run as a repository would run it. */
  const BIN = fileURLToPath(new URL('../bin/skills.mjs', import.meta.url));

  /**
   * Makes a repository with the dead-code skill enabled.
   *
   * @param devDependencies - The root package.json's devDependencies, or none for no package.json
   * @returns The repository root
   */
  function deadCodeRepo(devDependencies) {
    const root = makeRepo({ 'skills.json': { skills: { 'dead-code': {} } } });
    if (devDependencies) {
      write(root, 'package.json', JSON.stringify({ devDependencies }));
    }
    return root;
  }

  /**
   * Runs the skills CLI in a repository.
   *
   * @param root - The repository root
   * @param args - The CLI arguments
   * @returns The exit status, stdout and stderr
   */
  function cli(root, ...args) {
    const { status, stdout, stderr } = spawnSync(
      process.execPath,
      [BIN, ...args],
      { cwd: root, encoding: 'utf8' },
    );
    return { status, stdout, stderr };
  }

  test('runs every command through the installed dead-code CLI', async () => {
    const skill = await planned(deadCodeRepo(), 'dead-code/SKILL.md');

    assert.match(skill, /^name: dead-code$/m);
    assert.match(skill, /npx --no-install dead-code --help/);
    assert.match(skill, /npm i -D @euanmsm\/dead-code/);
    assert.match(
      skill,
      /npx --no-install dead-code branch "\$BASE_REF" --json/,
    );
    assert.match(skill, /npx --no-install dead-code why /);
    assert.match(skill, /\.devkit\/dead-code\.json/);
    assert.doesNotMatch(skill, /npx (?!--no-install )[^\n]*dead-code/);
    assert.doesNotMatch(skill, /npx knip/);
  });

  test('takes the branch base from baseBranch, the origin copy first, else the local branch', async () => {
    const root = makeRepo({
      'skills.json': { baseBranch: 'dev', skills: { 'dead-code': {} } },
    });
    const lines = (await planned(root, 'dead-code/SKILL.md')).split('\n');
    const at = lines.findIndex((line) => line.startsWith('BASE_REF='));
    const resolveBase = lines.slice(at, at + 2).join('\n');

    // A repository with a dev branch, and origin/dev only when asked.
    const baseIn = (remote) => {
      const repo = makeRepo();
      const git = (...args) =>
        execFileSync('git', args, { cwd: repo, stdio: 'pipe' });
      execFileSync('rm', ['-r', join(repo, '.git')]);
      git('init', '-q', '-b', 'dev');
      git(
        '-c',
        'user.name=t',
        '-c',
        'user.email=t@t',
        'commit',
        '-q',
        '--allow-empty',
        '-m',
        'x',
      );
      if (remote) git('update-ref', 'refs/remotes/origin/dev', 'HEAD');
      return execFileSync('bash', ['-c', `${resolveBase}\necho "$BASE_REF"`], {
        cwd: repo,
        encoding: 'utf8',
      }).trim();
    };

    assert.equal(baseIn(true), 'origin/dev');
    assert.equal(baseIn(false), 'dev');
  });

  test('never has a generated skill file deleted, and says where report paths work', async () => {
    const skill = await planned(deadCodeRepo(), 'dead-code/SKILL.md');

    assert.match(skill, new RegExp(MARKER_TAG));
    assert.match(skill, /never delete it/i);
    assert.match(skill, /pnpm-workspace\.yaml/);
    assert.match(skill, /from any folder/);
    assert.match(skill, /`errors`/);
    assert.match(skill, /namespaceMember/);
  });

  test('sync warns when @euanmsm/dead-code is not installed, and still writes the skill', async () => {
    const root = deadCodeRepo({ knip: '^6.0.0' });

    const { written, warnings } = await sync(root);

    assert.deepEqual(written, ['.claude/skills/dead-code/SKILL.md']);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /dead-code/);
    assert.match(warnings[0], /npm i -D @euanmsm\/dead-code/);
  });

  test('sync does not warn once @euanmsm/dead-code is installed', async () => {
    const root = deadCodeRepo({ '@euanmsm/dead-code': '^0.1.0' });

    assert.deepEqual((await sync(root)).warnings, []);
  });

  test('sync does not warn about a skill that is not enabled', async () => {
    assert.deepEqual(
      (await sync(makeRepo({ 'skills.json': BOTH }))).warnings,
      [],
    );
  });

  test('the CLI prints its usage on stdout and exits 0 when asked for help', () => {
    for (const flag of ['help', '--help', '-h']) {
      const { status, stdout } = cli(deadCodeRepo(), flag);
      assert.equal(status, 0, flag);
      assert.match(stdout, /^Usage:/, flag);
    }
  });

  test('the CLI prints the warning on stderr for sync, and never for check', () => {
    const root = deadCodeRepo();

    const synced = cli(root, 'sync');
    assert.equal(synced.status, 0);
    assert.match(synced.stderr, /@euanmsm\/dead-code/);
    assert.doesNotMatch(synced.stdout, /@euanmsm\/dead-code/);

    const checked = cli(root, 'check');
    assert.equal(checked.status, 0);
    assert.equal(checked.stderr, '');
    assert.equal(
      checked.stdout,
      'Skills are in step with .devkit/skills.json.\n',
    );
  });
});
