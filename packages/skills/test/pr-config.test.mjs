// ============================================================================
// PR Config and Sync Tests
// ============================================================================
//
// Resolving `.devkit/pr.mjs` over the defaults, every validation error, and
// what `sync` and `check` do with the PR skill's files.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { check } from '../src/check.mjs';
import { loadPrConfig, resolvePrConfig } from '../src/pr/config.mjs';
import {
  BUILT_IN_DIMENSIONS,
  DEFAULT_PROMPTS,
  DEFAULT_TESTS,
  DEFAULT_VERIFY,
} from '../src/pr/defaults.mjs';
import { sync } from '../src/sync.mjs';
import { FIXTURES, prRepo } from './pr-helpers.mjs';
import { makeRepo, write } from './repo.mjs';

const context = { skillsDir: '.claude/skills', source: '.devkit/pr.mjs' };

const LAYER = {
  key: 'api',
  title: 'API',
  paths: [/^src\/api\//],
  section: 'backend',
};
const minimal = (extra = {}) => ({ layers: [LAYER], ...extra });

/**
 * Resolves a config expecting it to fail.
 *
 * @param raw - The config
 * @param pattern - What the error message must match
 * @param extra - Extra resolve context
 */
function rejects(raw, pattern, extra = {}) {
  assert.throws(() => resolvePrConfig(raw, { ...context, ...extra }), pattern);
}

describe('pr config — defaults', () => {
  it('fills every default around the layers', () => {
    const resolved = resolvePrConfig(minimal(), context);

    assert.equal(resolved.name, 'pr');
    assert.equal(resolved.base, 'branch');
    assert.deepEqual(Object.keys(resolved.sections), ['backend']);
    assert.equal(
      resolved.sections.backend.title,
      'Agent-Runnable Backend Checks',
    );
    assert.deepEqual(resolved.dimensions, BUILT_IN_DIMENSIONS);
    assert.deepEqual(resolved.verify, DEFAULT_VERIFY);
    assert.deepEqual(resolved.tests, DEFAULT_TESTS);
    assert.deepEqual(resolved.prompts, DEFAULT_PROMPTS);
    assert.equal(resolved.traps, '.claude/skills/pr/TRAPS.md');
    assert.equal(resolved.template, '.github/pull_request_template.md');
    assert.equal(resolved.storybook, false);
    assert.deepEqual(resolved.experiments, {
      narrowRounds: false,
      dropCrossCutting: false,
    });
    assert.deepEqual(resolved.boot.variables, [
      {
        name: 'PORT',
        from: 'the port the app serves on locally',
        backendOnly: false,
      },
      {
        name: 'TOKEN',
        from: 'a bearer token for a seeded account',
        backendOnly: true,
      },
    ]);
  });

  it('puts the traps file under the configured skills folder', () => {
    const resolved = resolvePrConfig(minimal(), {
      ...context,
      skillsDir: '.agents/skills',
    });
    assert.equal(resolved.traps, '.agents/skills/pr/TRAPS.md');
  });

  it('fills a human section’s missing fields and derives its label', () => {
    const resolved = resolvePrConfig(
      minimal({
        layers: [
          LAYER,
          { key: 'ui', title: 'UI', paths: ['src/ui/'], section: 'frontend' },
        ],
        sections: { frontend: { title: 'Human Frontend Checks' } },
      }),
      context,
    );

    assert.equal(resolved.sections.frontend.label, 'Frontend');
    assert.equal(
      resolved.sections.frontend.audience,
      'a person using the product',
    );
  });

  it('overrides the backend section field by field', () => {
    const resolved = resolvePrConfig(
      minimal({ sections: { backend: { tools: 'psql only' } } }),
      context,
    );

    assert.equal(resolved.sections.backend.tools, 'psql only');
    assert.equal(resolved.sections.backend.label, 'Backend');
  });

  it('adds, rewords and removes dimensions', () => {
    const resolved = resolvePrConfig(
      minimal({
        dimensions: {
          tenancy: 'a cross-organisation negative',
          concurrency: 'two tabs',
          configuration: false,
        },
      }),
      context,
    );

    assert.equal(resolved.dimensions.tenancy, 'a cross-organisation negative');
    assert.equal(resolved.dimensions.concurrency, 'two tabs');
    assert.ok(!('configuration' in resolved.dimensions));
  });

  it('adds verifier entries after the built-ins, without repeats', () => {
    const resolved = resolvePrConfig(
      minimal({ verify: { masking: ['the worker loop', 'a cache'] } }),
      context,
    );

    assert.deepEqual(resolved.verify.masking, [
      ...DEFAULT_VERIFY.masking,
      'the worker loop',
    ]);
    assert.deepEqual(resolved.verify.identifiers, DEFAULT_VERIFY.identifiers);
  });

  it('follows the installed packages when storybook is auto', () => {
    const on = resolvePrConfig(minimal(), {
      ...context,
      installed: new Set(['@storybook/react']),
    });
    const off = resolvePrConfig(minimal({ storybook: 'auto' }), {
      ...context,
      installed: new Set(['react']),
    });
    const forced = resolvePrConfig(minimal({ storybook: true }), context);

    assert.equal(on.storybook, true);
    assert.equal(off.storybook, false);
    assert.equal(forced.storybook, true);
  });

  it('resolves both fixtures', async () => {
    for (const name of ['curricular', 'sales']) {
      const raw = (await import(join(FIXTURES, `${name}.mjs`))).default;
      const resolved = resolvePrConfig(raw, context);
      assert.ok(resolved.layers.length >= 5, name);
    }
  });
});

describe('pr config — refusals', () => {
  it('refuses a config that is not an object, and unknown keys', () => {
    rejects([], /must export an object/);
    rejects(minimal({ colour: 'red' }), /unknown key "colour" in the config/);
  });

  it('refuses a bad base', () => {
    rejects(minimal({ base: 'main' }), /base must be one of branch, stack/);
  });

  it('refuses missing or malformed layers', () => {
    rejects({}, /layers must be a non-empty list/);
    rejects({ layers: [] }, /layers must be a non-empty list/);
    rejects(
      { layers: [{ ...LAYER, key: '' }] },
      /layers\[0\]\.key must be a string/,
    );
    rejects(
      { layers: [{ ...LAYER, paths: [] }] },
      /paths must be a non-empty list/,
    );
    rejects(
      { layers: [{ ...LAYER, paths: [42] }] },
      /paths must be a non-empty list/,
    );
    rejects({ layers: [LAYER, LAYER] }, /two layers use the key "api"/);
    rejects(
      { layers: [{ ...LAYER, extra: 1 }] },
      /unknown key "extra" in layers\[0\]/,
    );
  });

  it('refuses a layer pointing at a section that does not exist', () => {
    rejects(
      { layers: [{ ...LAYER, section: 'frontend' }] },
      /points at section "frontend", which does not exist/,
    );
  });

  it('refuses a human section no layer points at', () => {
    rejects(
      minimal({ sections: { tui: { title: 'Human TUI Checks' } } }),
      /section "tui" has no layer pointing at it/,
    );
  });

  it('refuses a malformed section', () => {
    const layers = [LAYER, { ...LAYER, key: 'ui', section: 'ui' }];
    rejects({ layers, sections: { ui: {} } }, /sections\.ui needs a title/);
    rejects(
      { layers, sections: { ui: { title: 'UI', colour: 'red' } } },
      /unknown key "colour" in sections\.ui/,
    );
    rejects(
      { layers, sections: { ui: { title: 7 } } },
      /sections\.ui\.title must be a string/,
    );
    rejects(
      minimal({ sections: { backend: { title: 'X', where: 'y' } } }),
      /unknown key "where" in sections\.backend/,
    );
    rejects(minimal({ sections: 'nope' }), /sections must be an object/);
  });

  it('refuses malformed dimensions', () => {
    rejects(
      minimal({ dimensions: { invented: false } }),
      /no built-in of that name/,
    );
    rejects(
      minimal({ dimensions: { tenancy: 3 } }),
      /dimensions\.tenancy must be a string/,
    );
    rejects(minimal({ dimensions: [] }), /dimensions must be an object/);
  });

  it('refuses malformed verify, boot, prompts and experiments', () => {
    rejects(
      minimal({ verify: { masking: 'a cache' } }),
      /verify\.masking must be a list of strings/,
    );
    rejects(
      minimal({ verify: { vibes: [] } }),
      /unknown key "vibes" in verify/,
    );
    rejects(
      minimal({ boot: { start: 'npm run dev' } }),
      /boot\.start must be a list of strings/,
    );
    rejects(minimal({ boot: { stop: ['x'] } }), /boot\.stop must be a string/);
    rejects(
      minimal({ boot: { variables: { port: 'x' } } }),
      /upper-case shell variable name/,
    );
    rejects(
      minimal({ boot: { variables: { PORT: { from: 1 } } } }),
      /PORT\.from must be a string/,
    );
    rejects(
      minimal({ boot: { variables: { PORT: { from: 'x', when: 1 } } } }),
      /unknown key "when"/,
    );
    rejects(
      minimal({ boot: { variables: [] } }),
      /boot\.variables must be an object/,
    );
    rejects(
      minimal({ prompts: { mood: 'x' } }),
      /unknown key "mood" in prompts/,
    );
    rejects(
      minimal({ prompts: { exploreSteps: 'x' } }),
      /prompts\.exploreSteps must be a list of strings/,
    );
    rejects(
      minimal({ prompts: { gating: ['x'] } }),
      /prompts\.gating must be a string/,
    );
    rejects(
      minimal({ experiments: { narrowRounds: 'yes' } }),
      /experiments\.narrowRounds must be true or false/,
    );
    rejects(
      minimal({ experiments: { fast: true } }),
      /unknown key "fast" in experiments/,
    );
  });

  it('refuses malformed lists and strings elsewhere', () => {
    rejects(
      minimal({ tests: ['*.test.ts'] }),
      /tests must be a non-empty list of regexes/,
    );
    rejects(
      minimal({ tests: [] }),
      /tests must be a non-empty list of regexes/,
    );
    rejects(
      minimal({ actors: 'everyone' }),
      /actors must be a list of strings/,
    );
    rejects(minimal({ localCi: [1] }), /localCi must be a list of strings/);
    rejects(minimal({ localCiNote: 1 }), /localCiNote must be a string/);
    rejects(minimal({ traps: false }), /traps must be a string/);
    rejects(
      minimal({ storybook: 'yes' }),
      /storybook must be true, false or 'auto'/,
    );
  });
});

describe('pr config — loading', () => {
  it('works with no config module when the template exists', async () => {
    const root = prRepo(null);
    write(
      root,
      '.devkit/pr.mjs',
      `export default ${JSON.stringify({ layers: [{ key: 'a', title: 'A', paths: ['src/'], section: 'backend' }] })};`,
    );

    const resolved = await loadPrConfig(
      root,
      { config: '.devkit/pr.mjs' },
      { skillsDir: '.claude/skills' },
    );
    assert.equal(resolved.layers[0].key, 'a');
  });

  it('refuses a missing template, and one with no summary marker', async () => {
    const root = prRepo('sales');
    rmSync(join(root, '.github/pull_request_template.md'));
    await assert.rejects(
      loadPrConfig(
        root,
        { config: '.devkit/pr.mjs' },
        { skillsDir: '.claude/skills' },
      ),
      /The PR template \.github\/pull_request_template\.md does not exist/,
    );

    write(root, '.github/pull_request_template.md', '## Summary\n');
    await assert.rejects(
      loadPrConfig(
        root,
        { config: '.devkit/pr.mjs' },
        { skillsDir: '.claude/skills' },
      ),
      /has no <!-- pr-qa:summary --> line/,
    );
  });

  it('sees an edited config module without a restart', async () => {
    const root = prRepo(null);
    const write1 = (title) =>
      writeFileSync(
        join(root, '.devkit/pr.mjs'),
        `export default { layers: [{ key: 'a', title: '${title}', paths: ['src/'], section: 'backend' }] };`,
      );
    const load = () =>
      loadPrConfig(
        root,
        { config: '.devkit/pr.mjs' },
        { skillsDir: '.claude/skills' },
      );

    write1('First');
    assert.equal((await load()).layers[0].title, 'First');
    await new Promise((resolve) => setTimeout(resolve, 20));
    write1('Second');
    assert.equal((await load()).layers[0].title, 'Second');
  });
});

describe('pr skill — sync and check', () => {
  it('writes the skill, the workflow and the traps file', async () => {
    const root = prRepo('curricular');
    const { written } = await sync(root);

    assert.deepEqual(written, [
      '.claude/skills/pr/SKILL.md',
      '.claude/skills/pr/pr-qa.workflow.js',
      '.claude/skills/pr/TRAPS.md',
    ]);
    assert.deepEqual(await check(root), []);

    const skill = readFileSync(
      join(root, '.claude/skills/pr/SKILL.md'),
      'utf8',
    );
    assert.match(skill, /^---\nname: pr\n/);
    assert.match(skill, /Generated by @euanmsm\/skills/);
    assert.match(
      skill,
      /scriptPath: "\.claude\/skills\/pr\/pr-qa\.workflow\.js"/,
    );
    assert.match(
      skill,
      /summary and a verified Manual QA checklist \(Agent-Runnable Backend Checks, Human Frontend Checks, Storybook Review Checks\)/,
    );
    assert.match(skill, /on a branch in a `gh stack`/);
    assert.match(
      skill,
      /\| Data Model \| Agent-Runnable Backend Checks \| `\(\^\\\|\/\)supabase\/migrations\/` \|/,
    );
    assert.match(skill, /\[`\.claude\/skills\/pr\/TRAPS\.md`\]\(TRAPS\.md\)/);
    assert.match(skill, /There is no reset gate/);
    assert.doesNotMatch(skill, /\{\{/);
  });

  it('writes a plain base rule and links a traps file kept elsewhere', async () => {
    const root = prRepo('sales', {
      overrides: { traps: 'docs/qa/TRAPS.md' },
      settings: { skillsDir: '.agents/skills', baseBranch: 'develop' },
    });
    await sync(root);
    const skill = readFileSync(
      join(root, '.agents/skills/pr/SKILL.md'),
      'utf8',
    );

    assert.match(skill, /The base is always `develop`\./);
    assert.match(skill, /\(\.\.\/\.\.\/\.\.\/docs\/qa\/TRAPS\.md\)/);
    assert.ok(existsSync(join(root, 'docs/qa/TRAPS.md')));
    assert.match(skill, /Human TUI Checks\)/);
  });

  it('inlines the resolved config into a workflow that parses', async () => {
    const root = prRepo('curricular');
    await sync(root);
    const script = readFileSync(
      join(root, '.claude/skills/pr/pr-qa.workflow.js'),
      'utf8',
    );

    assert.match(script, /^\/\/ Generated by @euanmsm\/skills/);
    assert.match(script, /"name": "pr"/);
    assert.doesNotMatch(script, /\/\* CONFIG \*\/ null/);
    assert.match(script, /"storybook": true/);

    const wrapped = join(root, 'wrapped.mjs');
    writeFileSync(
      wrapped,
      `async function run(agent, parallel, pipeline, phase, log, args) {\n${script.replace(/^export const meta/m, 'const meta')}\n}\n`,
    );
    execFileSync(process.execPath, ['--check', wrapped]);
  });

  it('never overwrites the traps file once the repository has it', async () => {
    const root = prRepo('curricular');
    await sync(root);
    const traps = join(root, '.claude/skills/pr/TRAPS.md');
    writeFileSync(traps, '# Our traps\n\n## Auth\n');

    const again = await sync(root);
    assert.equal(readFileSync(traps, 'utf8'), '# Our traps\n\n## Auth\n');
    assert.ok(again.unchanged.includes('.claude/skills/pr/TRAPS.md'));
    assert.deepEqual(await check(root), []);
  });

  it('keeps a hand-written traps file that was there first', async () => {
    const root = prRepo('curricular');
    write(root, '.claude/skills/pr/TRAPS.md', '# Earned traps\n');

    await sync(root);
    assert.equal(
      readFileSync(join(root, '.claude/skills/pr/TRAPS.md'), 'utf8'),
      '# Earned traps\n',
    );
  });

  it('reports a deleted traps file as missing', async () => {
    const root = prRepo('curricular');
    await sync(root);
    rmSync(join(root, '.claude/skills/pr/TRAPS.md'));

    assert.deepEqual(await check(root), [
      { path: '.claude/skills/pr/TRAPS.md', problem: 'missing' },
    ]);
  });

  it('never removes the traps file when the skill is switched off', async () => {
    const root = prRepo('curricular', { options: { qaGate: true } });
    await sync(root);
    write(root, '.devkit/skills.json', JSON.stringify({ skills: {} }));

    const { removed } = await sync(root);
    assert.deepEqual(removed.sort(), [
      '.claude/skills/pr/SKILL.md',
      '.claude/skills/pr/pr-qa.workflow.js',
      '.github/workflows/pr-manual-qa.yml',
    ]);
    assert.ok(existsSync(join(root, '.claude/skills/pr/TRAPS.md')));
  });

  it('writes the gate workflow with qaGate, pinned to this package version', async () => {
    const root = prRepo('curricular', { options: { qaGate: true } });
    const { written } = await sync(root);
    const version = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ).version;
    const yml = readFileSync(
      join(root, '.github/workflows/pr-manual-qa.yml'),
      'utf8',
    );

    assert.ok(written.includes('.github/workflows/pr-manual-qa.yml'));
    assert.match(yml, /^# Generated by @euanmsm\/skills/);
    assert.ok(
      yml.includes(`npx --yes @euanmsm/skills@${version} qa-gate reset`),
    );
    assert.ok(
      yml.includes(`npx --yes @euanmsm/skills@${version} qa-gate status`),
    );
    assert.match(yml, /\$\{\{ secrets\.GITHUB_TOKEN \}\}/);
    assert.match(
      readFileSync(join(root, '.claude/skills/pr/SKILL.md'), 'utf8'),
      /\*\*The gate:\*\* `\.github\/workflows\/pr-manual-qa\.yml`/,
    );
  });

  it('removes the gate workflow when qaGate is switched off', async () => {
    const root = prRepo('curricular', { options: { qaGate: true } });
    await sync(root);
    write(root, '.devkit/skills.json', JSON.stringify({ skills: { pr: {} } }));

    const { removed } = await sync(root);
    assert.deepEqual(removed, ['.github/workflows/pr-manual-qa.yml']);
  });

  it('flags a hand-edited gate workflow and leaves other workflows alone', async () => {
    const root = prRepo('curricular', { options: { qaGate: true } });
    write(root, '.github/workflows/ci.yml', 'name: CI\n');
    await sync(root);

    const gate = join(root, '.github/workflows/pr-manual-qa.yml');
    writeFileSync(gate, `${readFileSync(gate, 'utf8')}\n# tweak\n`);

    assert.deepEqual(await check(root), [
      {
        path: '.github/workflows/pr-manual-qa.yml',
        problem: 'out of date or edited by hand',
      },
    ]);
    assert.equal(
      readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8'),
      'name: CI\n',
    );
  });

  it('refuses to replace a hand-written gate workflow without --force', async () => {
    const root = prRepo('curricular', { options: { qaGate: true } });
    write(root, '.github/workflows/pr-manual-qa.yml', 'name: ours\n');

    await assert.rejects(sync(root), /were not written by skills sync/);
    await sync(root, { force: true });
    assert.match(
      readFileSync(join(root, '.github/workflows/pr-manual-qa.yml'), 'utf8'),
      /Generated by/,
    );
  });

  it('flags a stale workflow after the config changes', async () => {
    const root = prRepo('curricular');
    await sync(root);
    write(
      root,
      '.devkit/pr.mjs',
      `import base from ${JSON.stringify(join(FIXTURES, 'curricular.mjs'))};\nexport default { ...base, actors: ['teacher'] };\n`,
    );

    const problems = await check(root);
    assert.deepEqual(problems, [
      {
        path: '.claude/skills/pr/pr-qa.workflow.js',
        problem: 'out of date or edited by hand',
      },
    ]);
  });

  it('refuses an unknown skill option', async () => {
    const root = makeRepo({
      'skills.json': { skills: { pr: { name: 'pull-requests' } } },
    });
    await assert.rejects(sync(root), /Unknown option "name" for skill "pr"/);
  });
});

describe('pr example config', () => {
  it('resolves, and syncs into a repository', async () => {
    const raw = (await import('../pr.example.mjs')).default;
    const resolved = resolvePrConfig(raw, context);
    assert.deepEqual(Object.keys(resolved.sections), ['backend', 'frontend']);

    const root = makeRepo({ 'skills.json': { skills: { pr: {} } } });
    write(
      root,
      '.devkit/pr.mjs',
      readFileSync(new URL('../pr.example.mjs', import.meta.url), 'utf8'),
    );
    write(root, '.github/pull_request_template.md', '<!-- pr-qa:summary -->\n');
    const { written } = await sync(root);
    assert.equal(written.length, 3);
  });
});

describe('pr skill — check against hand-written files', () => {
  it('reports a hand-written file where the skill belongs', async () => {
    const root = prRepo('curricular');
    await sync(root);
    write(root, '.claude/skills/pr/SKILL.md', '# Our own PR skill\n');

    assert.deepEqual(await check(root), [
      {
        path: '.claude/skills/pr/SKILL.md',
        problem: 'not generated by skills sync',
      },
    ]);
  });
});
