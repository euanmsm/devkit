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
  DEFAULT_BUDGET,
  DEFAULT_OUTSIDE_REPO,
  DEFAULT_PROMPTS,
  DEFAULT_TESTS,
  DEFAULT_VERIFY,
} from '../src/pr/defaults.mjs';
import { sync } from '../src/sync.mjs';
import webapp from './fixtures/pr/webapp.mjs';
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
      dropCrossCutting: false,
    });
    assert.deepEqual(resolved.boot.variables, [
      {
        name: 'PORT',
        from: 'the port the app serves on locally',
        when: [],
      },
      {
        name: 'TOKEN',
        from: 'a bearer token for a seeded account',
        when: ['api'],
      },
    ]);
    assert.deepEqual(resolved.outsideRepo, DEFAULT_OUTSIDE_REPO);
    assert.deepEqual(resolved.budget, DEFAULT_BUDGET);
    assert.equal(resolved.layers[0].touches, null);
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

  it('fills an agent half’s defaults, and leaves an unsplit section with none', () => {
    const layers = [
      LAYER,
      { key: 'ui', title: 'UI', paths: ['src/ui/'], section: 'frontend' },
    ];
    const split = resolvePrConfig(
      minimal({
        layers,
        sections: {
          frontend: {
            title: 'Human UI / UX Checks',
            agent: { title: 'Agent-Runnable Frontend Checks' },
          },
        },
      }),
      context,
    );
    assert.deepEqual(split.sections.frontend.agent, {
      title: 'Agent-Runnable Frontend Checks',
      runs: 'Claude in Chrome runs these',
      note: '',
    });

    const plain = resolvePrConfig(
      minimal({ layers, sections: { frontend: { title: 'Frontend' } } }),
      context,
    );
    assert.equal(plain.sections.frontend.agent, null);
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
    for (const name of ['webapp', 'sales']) {
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
      { layers: [{ ...LAYER, paths: ['src/', /^src\/api\//g] }] },
      /layers\[0\]\.paths\[1\] must not use the g or y flag/,
    );
    rejects(
      minimal({ tests: [/\.test\.ts$/, /\.spec\.ts$/y] }),
      /tests\[1\] must not use the g or y flag.*Use \/\\\.spec\\\.ts\$\//,
    );
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

  it('refuses a malformed agent half', () => {
    const layers = [LAYER, { ...LAYER, key: 'ui', section: 'ui' }];
    const ui = (agent) => ({
      layers,
      sections: { ui: { title: 'UI', agent } },
    });
    rejects(ui({}), /sections\.ui\.agent needs a title/);
    rejects(ui('Agents'), /sections\.ui\.agent must be an object/);
    rejects(
      ui({ title: 'A', colour: 'red' }),
      /unknown key "colour" in sections\.ui\.agent/,
    );
    rejects(
      ui({ title: 'A', note: 3 }),
      /sections\.ui\.agent\.note must be a string/,
    );
    rejects(
      minimal({ sections: { backend: { agent: { title: 'A' } } } }),
      /unknown key "agent" in sections\.backend/,
    );
  });

  it('names both halves of a split section in the skill', async () => {
    const root = prRepo('webapp', {
      overrides: {
        sections: {
          ...webapp.sections,
          frontend: {
            ...webapp.sections.frontend,
            title: 'Human UI / UX Checks',
            agent: { title: 'Agent-Runnable Frontend Checks' },
          },
        },
      },
    });
    await sync(root);
    const skill = readFileSync(
      join(root, '.claude/skills/pr/SKILL.md'),
      'utf8',
    );

    assert.match(
      skill,
      /\(Agent-Runnable Backend Checks, Agent-Runnable Frontend Checks, Human UI \/ UX Checks, Storybook Review Checks\)/,
    );
    assert.match(
      skill,
      /\| Agent-Runnable Frontend Checks \+ Human UI \/ UX Checks \|/,
    );
    assert.match(skill, /## Who runs the checklist/);
    assert.doesNotMatch(skill, /\{\{/);
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
      /boot\.start must be a list/,
    );
    rejects(
      minimal({ boot: { start: [{ run: 'npm run dev', when: ['disk'] }] } }),
      /boot\.start\[0\]\.when must be a non-empty list of database, api, page/,
    );
    rejects(
      minimal({ boot: { start: [{ when: ['page'] }] } }),
      /boot\.start\[0\]\.run must be a string/,
    );
    rejects(
      minimal({ boot: { start: [{ run: 'x', if: ['page'] }] } }),
      /unknown key "if" in boot\.start\[0\]/,
    );
    rejects(
      minimal({ boot: { stop: ['x'] } }),
      /boot\.stop must be a string or \{ run, when \}/,
    );
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
      /PORT\.when must be a non-empty list/,
    );
    rejects(
      minimal({
        boot: {
          variables: { PORT: { from: 'x', when: ['api'], backendOnly: true } },
        },
      }),
      /sets both when and backendOnly/,
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
      minimal({ experiments: { dropCrossCutting: 'yes' } }),
      /experiments\.dropCrossCutting must be true or false/,
    );
    rejects(
      minimal({ experiments: { fast: true } }),
      /unknown key "fast" in experiments/,
    );
  });

  it('refuses malformed touches, outside-the-repo questions and budget', () => {
    rejects(
      { layers: [{ ...LAYER, touches: 'api' }] },
      /layers\[0\]\.touches must be a non-empty list/,
    );
    rejects(
      { layers: [{ ...LAYER, touches: [] }] },
      /layers\[0\]\.touches must be a non-empty list/,
    );
    rejects(minimal({ outsideRepo: {} }), /outsideRepo must be a list/);
    rejects(
      minimal({ outsideRepo: [{ paths: [] }] }),
      /outsideRepo\[0\]\.ask must be a string/,
    );
    rejects(
      minimal({ outsideRepo: [{ ask: 'x', paths: 'vercel.json' }] }),
      /outsideRepo\[0\]\.paths must be a list/,
    );
    rejects(
      minimal({ outsideRepo: [{ ask: 'x', who: 'me' }] }),
      /unknown key "who" in outsideRepo\[0\]/,
    );
    rejects(
      minimal({ budget: { small: 0 } }),
      /budget\.small must be a whole number/,
    );
    rejects(minimal({ budget: { tiny: 1 } }), /unknown key "tiny" in budget/);
  });

  it('resolves conditional boot commands, variables, touches and budget', () => {
    const resolved = resolvePrConfig(
      {
        layers: [{ ...LAYER, touches: ['api', 'database', 'api'] }],
        boot: {
          start: ['docker ps', { run: 'npm run db:start', when: ['database'] }],
          variables: {
            PORT: 'the port',
            DB: { from: 'the container', backendOnly: true },
            TOKEN: { from: 'a token', when: ['api'] },
          },
        },
        outsideRepo: [
          { ask: 'Does it change vercel.json?', paths: [/vercel\.json$/] },
        ],
        budget: { small: 5 },
      },
      context,
    );

    assert.deepEqual(resolved.layers[0].touches, ['api', 'database']);
    assert.deepEqual(resolved.boot.stop, { run: '', when: [] });
    assert.deepEqual(resolved.boot.start, [
      { run: 'docker ps', when: [] },
      { run: 'npm run db:start', when: ['database'] },
    ]);
    assert.deepEqual(
      resolved.boot.variables.map((v) => [v.name, v.when]),
      [
        ['PORT', []],
        ['DB', ['database', 'api']],
        ['TOKEN', ['api']],
      ],
    );
    assert.equal(resolved.outsideRepo.length, 1);
    assert.deepEqual(resolved.budget, { ...DEFAULT_BUDGET, small: 5 });
    assert.deepEqual(
      resolvePrConfig(minimal({ outsideRepo: [] }), context).outsideRepo,
      [],
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
    const root = prRepo('webapp');
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
      /summary and a verified Manual QA checklist \(Agent-Runnable Backend Checks, Human Browser Checks, Storybook Review Checks\)/,
    );
    assert.match(skill, /on a branch in a `gh stack`/);
    assert.match(
      skill,
      /\| Data Model \| Agent-Runnable Backend Checks \| `\(\^\\\|\/\)db\/migrations\/` \|/,
    );
    assert.match(skill, /\[`\.claude\/skills\/pr\/TRAPS\.md`\]\(TRAPS\.md\)/);
    assert.match(skill, /There is no reset gate/);
    assert.doesNotMatch(skill, /\{\{/);
  });

  it('keeps the frontmatter valid when a section title has an apostrophe', async () => {
    const root = prRepo('sales', {
      overrides: {
        sections: {
          backend: { title: "Agent's Checks" },
          tui: { title: "Operator's TUI Checks" },
        },
      },
    });
    await sync(root);
    const skill = readFileSync(
      join(root, '.claude/skills/pr/SKILL.md'),
      'utf8',
    );

    // A single-quoted YAML scalar ends at the first `'` that is not doubled.
    const scalar = /\ndescription:\n\s+'([\s\S]*?)'\nuser-invocable:/.exec(
      skill,
    )[1];
    assert.doesNotMatch(scalar.replace(/''/g, ''), /'/);
    assert.match(scalar, /\(Agent''s Checks, Operator''s TUI Checks\)/);
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
    const root = prRepo('webapp');
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
    const root = prRepo('webapp');
    await sync(root);
    const traps = join(root, '.claude/skills/pr/TRAPS.md');
    writeFileSync(traps, '# Our traps\n\n## Auth\n');

    const again = await sync(root);
    assert.equal(readFileSync(traps, 'utf8'), '# Our traps\n\n## Auth\n');
    assert.ok(again.unchanged.includes('.claude/skills/pr/TRAPS.md'));
    assert.deepEqual(await check(root), []);
  });

  it('keeps a hand-written traps file that was there first', async () => {
    const root = prRepo('webapp');
    write(root, '.claude/skills/pr/TRAPS.md', '# Earned traps\n');

    await sync(root);
    assert.equal(
      readFileSync(join(root, '.claude/skills/pr/TRAPS.md'), 'utf8'),
      '# Earned traps\n',
    );
  });

  it('reports a deleted traps file as missing', async () => {
    const root = prRepo('webapp');
    await sync(root);
    rmSync(join(root, '.claude/skills/pr/TRAPS.md'));

    assert.deepEqual(await check(root), [
      { path: '.claude/skills/pr/TRAPS.md', problem: 'missing' },
    ]);
  });

  it('never removes the traps file when the skill is switched off', async () => {
    const root = prRepo('webapp', { options: { qaGate: true } });
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
    const root = prRepo('webapp', { options: { qaGate: true } });
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
    // A deleted checklist recomputes the status; its payload still has the body.
    assert.match(yml, /issue_comment:\n\s+types: \[created, edited, deleted\]/);
    assert.match(
      yml,
      /contains\(github\.event\.comment\.body, 'pr-qa:manual-checklist'\)/,
    );
    assert.match(
      readFileSync(join(root, '.claude/skills/pr/SKILL.md'), 'utf8'),
      /\*\*The gate:\*\* `\.github\/workflows\/pr-manual-qa\.yml`/,
    );
  });

  it('removes the gate workflow when qaGate is switched off', async () => {
    const root = prRepo('webapp', { options: { qaGate: true } });
    await sync(root);
    write(root, '.devkit/skills.json', JSON.stringify({ skills: { pr: {} } }));

    const { removed } = await sync(root);
    assert.deepEqual(removed, ['.github/workflows/pr-manual-qa.yml']);
  });

  it('flags a hand-edited gate workflow and leaves other workflows alone', async () => {
    const root = prRepo('webapp', { options: { qaGate: true } });
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
    const root = prRepo('webapp', { options: { qaGate: true } });
    write(root, '.github/workflows/pr-manual-qa.yml', 'name: ours\n');

    await assert.rejects(sync(root), /were not written by skills sync/);
    await sync(root, { force: true });
    assert.match(
      readFileSync(join(root, '.github/workflows/pr-manual-qa.yml'), 'utf8'),
      /Generated by/,
    );
  });

  it('flags a stale workflow after the config changes', async () => {
    const root = prRepo('webapp');
    await sync(root);
    write(
      root,
      '.devkit/pr.mjs',
      `import base from ${JSON.stringify(join(FIXTURES, 'webapp.mjs'))};\nexport default { ...base, actors: ['member'] };\n`,
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
      'skills.json': { skills: { pr: { title: 'x' } } },
    });
    await assert.rejects(sync(root), /Unknown option "title" for skill "pr"/);
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
    const root = prRepo('webapp');
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
