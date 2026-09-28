// ============================================================================
// Code Review Tests
// ============================================================================
//
// The review config, the generated workflow script and SKILL.md, and the
// prepass that feeds them.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import { check } from '../src/check.mjs';
import { prepass } from '../src/review/cli.mjs';
import {
  installedPackages,
  resolveReviewConfig,
} from '../src/review/config.mjs';
import {
  buildImportGraph,
  keepFilesUnderReview,
  runTools,
  splitPatches,
} from '../src/review/prepass.mjs';
import { toSource } from '../src/review/serialise.mjs';
import { plan, renderEngine, sync } from '../src/sync.mjs';
import webapp from './fixtures/review/webapp.mjs';
import sales from './fixtures/review/sales.mjs';
import { makeRepo, write } from './repo.mjs';
import { runShell, SHELLS, staleBaseRepo } from './stale-base.mjs';
import { reply, runWorkflow } from './workflow.mjs';

const ENGINE = readFileSync(
  new URL('../templates/code-review/review.workflow.js', import.meta.url),
  'utf8',
);

/**
 * Resolves a raw review config the way sync does, minus the skill check.
 *
 * @param raw - The config object
 * @returns The resolved config
 */
function resolve(raw) {
  return resolveReviewConfig(raw, {
    name: 'code-review',
    skillsDir: '.claude/skills',
    source: 'test',
  });
}

/**
 * Builds a bundle `b` over the given built-in lenses. The split checks fail before the check that every lens has a bundle.
 *
 * @param lenses - The built-in lens keys the bundle covers
 * @param extra - More bundle fields, such as `split`
 * @returns The bundle
 */
function bundleOf(lenses, extra = {}) {
  return { key: 'b', scope: 'target', model: 'opus', lenses, ...extra };
}

const DIFF_ARGS = {
  mode: 'diff',
  target: 'feat/x',
  base: 'abc123',
  diffStat: '3 files',
  patchDir: 'tmp/patch',
  largeDiff: false,
  scratchDir: 'tmp/code-reviews',
  branchLeaf: 'x',
  today: '2026-09-26',
  agentCap: 14,
};

describe('resolveReviewConfig', () => {
  test('an empty config gives the built-in lenses and bundles', () => {
    const review = resolve({});

    assert.ok(review.lenses.bugs);
    assert.deepEqual(
      review.bundles.map((bundle) => bundle.key),
      [
        'correctness',
        'security',
        'performance',
        'craft',
        'database',
        'tests',
        'ci',
      ],
    );
    assert.deepEqual(review.diffOnlyLenses, ['backwards-compat']);
    assert.deepEqual(review.coverageLenses, ['testing']);
  });

  test('resolves the code and tests shorthands to the file patterns', () => {
    const tests = /\.spec\.ts$/;
    const review = resolve({ files: { tests } });

    assert.equal(review.lenses.testing.route.paths[0], tests);
    assert.equal(review.lenses.testing.route.coverage[0], review.files.code);
  });

  test('merges a repository field over a built-in lens', () => {
    const review = resolve({ lenses: { security: { skill: 'sec' } } });

    assert.equal(review.lenses.security.skill, 'sec');
    assert.match(review.lenses.security.judges, /Secrets/);
  });

  test('false removes a built-in lens and drops it from the default bundles', () => {
    const review = resolve({ lenses: { ci: false, typing: false } });

    assert.equal(review.lenses.ci, undefined);
    assert.ok(!review.bundles.some((bundle) => bundle.key === 'ci'));

    const craft = review.bundles.find((bundle) => bundle.key === 'craft');
    assert.ok(!craft.lenses.includes('typing'));
    assert.ok(!craft.split.some((part) => part.lenses.includes('typing')));
  });

  test('a bundle field puts a new lens into an existing bundle', () => {
    const review = resolve({
      lenses: {
        events: {
          judges: 'Events.',
          route: { always: 'code' },
          bundle: 'correctness',
        },
      },
    });
    const correctness = review.bundles.find((b) => b.key === 'correctness');

    assert.ok(correctness.lenses.includes('events'));
    assert.ok(correctness.split[0].lenses.includes('events'));
    assert.equal(review.lenses.events.bundle, undefined);
  });

  test('a bundle field can name a default bundle whose built-ins were all removed', () => {
    const review = resolve({
      lenses: {
        ci: false,
        'gh-actions': {
          judges: 'Actions.',
          route: { always: 'code' },
          bundle: 'ci',
        },
      },
    });

    assert.deepEqual(
      review.bundles.find((bundle) => bundle.key === 'ci').lenses,
      ['gh-actions'],
    );
  });

  test('keeps the repository’s lens order ahead of the built-ins', () => {
    const review = resolve({
      lenses: {
        events: {
          judges: 'E.',
          route: { always: 'code' },
          bundle: 'correctness',
        },
        bugs: {},
      },
    });

    assert.deepEqual(Object.keys(review.lenses).slice(0, 2), [
      'events',
      'bugs',
    ]);
  });

  test('derives the split order from the bundles when none is given', () => {
    assert.deepEqual(resolve({}).splitOrder, ['correctness', 'craft']);
  });

  for (const [what, raw, message] of [
    ['an unknown top-level key', { lense: {} }, /unknown key "lense"/],
    [
      'an unknown lens key',
      { lenses: { bugs: { judge: 'x' } } },
      /unknown key "judge" in lens "bugs"/,
    ],
    [
      'removing a lens that is not built in',
      { lenses: { nope: false } },
      /not a built-in/,
    ],
    [
      'a new lens with no judges',
      { lenses: { x: { bundle: 'craft' } } },
      /needs a judges string/,
    ],
    [
      'a lens in no bundle',
      { lenses: { x: { judges: 'X.', route: { always: 'code' } } } },
      /"x" sits in no bundle/,
    ],
    [
      'a bundle naming an unknown lens',
      {
        bundles: [
          { key: 'b', scope: 'target', model: 'opus', lenses: ['nope'] },
        ],
      },
      /unknown lens "nope"/,
    ],
    [
      'two bundles with one key',
      { bundles: [bundleOf(['bugs']), bundleOf(['ci'])] },
      /two bundles use the key "b"/,
    ],
    [
      'a split naming a lens outside its bundle',
      {
        lenses: Object.fromEntries(
          [
            'error-handling',
            'security',
            'performance',
            'dry',
            'readability',
            'typing',
            'comments',
            'dead-code',
            'database',
            'backwards-compat',
            'testing',
            'ci',
          ].map((key) => [key, false]),
        ),
        bundles: [
          {
            key: 'b',
            scope: 'target',
            model: 'opus',
            lenses: ['bugs'],
            split: [
              { lenses: ['bugs'], model: 'opus' },
              { lenses: ['ci'], model: 'opus' },
            ],
          },
        ],
      },
      /split names "ci"/,
    ],
    [
      'a split order naming an unsplit bundle',
      { splitOrder: ['security'] },
      /not a bundle with a split/,
    ],
    [
      'an unknown prompt slot',
      { prompts: { nope: 'x' } },
      /unknown key "nope" in prompts/,
    ],
    [
      'a mistyped prompt slot',
      { prompts: { layerChain: 3 } },
      /prompts.layerChain/,
    ],
    [
      'a route pattern that is not a RegExp',
      { lenses: { ci: { route: { paths: ['x'] } } } },
      /not a RegExp/,
    ],
    [
      'a reserved tool key',
      { prepass: { tools: [{ key: 'sentinel', label: 'x', command: 'x' }] } },
      /is taken/,
    ],
    [
      'a split that is not a list',
      { bundles: [bundleOf(['bugs'], { split: { lenses: ['bugs'] } })] },
      /bundle "b" split must be a list/,
    ],
    [
      'a split part whose lenses are not a list',
      {
        bundles: [
          bundleOf(['bugs', 'ci'], {
            split: [
              { lenses: 'bugs', model: 'opus' },
              { lenses: ['ci'], model: 'opus' },
            ],
          }),
        ],
      },
      /split part of "b" needs a list of lenses/,
    ],
    [
      'a split that leaves a lens out',
      {
        bundles: [
          bundleOf(['bugs', 'ci', 'security'], {
            split: [
              { lenses: ['bugs'], model: 'opus' },
              { lenses: ['ci'], model: 'opus' },
            ],
          }),
        ],
      },
      /split of "b" leaves out "security"/,
    ],
    [
      'a split naming one lens in two parts',
      {
        bundles: [
          bundleOf(['bugs', 'ci'], {
            split: [
              { lenses: ['bugs', 'ci'], model: 'opus' },
              { lenses: ['ci'], model: 'opus' },
            ],
          }),
        ],
      },
      /split of "b" names "ci" in two parts/,
    ],
    [
      'a new lens with no route',
      { lenses: { mine: { judges: 'Mine.', bundle: 'correctness' } } },
      /lens "mine" route never fires/,
    ],
    [
      'a built-in route emptied out',
      { lenses: { ci: { route: { paths: [] } } } },
      /lens "ci" route never fires/,
    ],
    [
      'a global file pattern',
      { files: { code: /\.ts$/g } },
      /files\.code must not use the g or y flag/,
    ],
    [
      'a sticky route pattern',
      { lenses: { ci: { route: { paths: [/\.yml$/y] } } } },
      /lens "ci" route\.paths must not use the g or y flag/,
    ],
    [
      'a global graph pattern',
      { prepass: { graph: { sources: /\.ts$/g } } },
      /prepass\.graph\.sources must not use the g or y flag/,
    ],
  ]) {
    test(`rejects ${what}`, () => {
      assert.throws(() => resolve(raw), message);
    });
  }

  /**
   * Lists the prepass tool keys for a set of installed packages.
   *
   * @param installed - The package names the repository depends on
   * @param prepass - The repository's `prepass`, or undefined
   * @returns The resolved tool keys, in order
   */
  const toolKeys = (installed, prepass) =>
    resolveReviewConfig(
      { prepass },
      {
        name: 'r',
        skillsDir: 's',
        source: 't',
        installed: new Set(installed),
      },
    ).prepass.tools.map((tool) => tool.key);

  test('adds the comment and knip checks when the tools are installed', () => {
    assert.deepEqual(toolKeys(['typescript']), ['tsc', 'lint']);
    assert.deepEqual(toolKeys(['typescript', '@euanmsm/terse', 'knip']), [
      'tsc',
      'lint',
      'comments',
      'knip',
    ]);
    assert.deepEqual(toolKeys(['typescript', 'knip'], { knip: false }), [
      'tsc',
      'lint',
    ]);
    assert.deepEqual(toolKeys([], { comments: true }), ['lint', 'comments']);
  });

  test('runs dead-code instead of knip when @euanmsm/dead-code is installed', () => {
    assert.deepEqual(toolKeys(['knip', '@euanmsm/dead-code']), [
      'lint',
      'deadCode',
    ]);
    assert.deepEqual(toolKeys(['@euanmsm/dead-code']), ['lint', 'deadCode']);
    assert.deepEqual(
      toolKeys(['knip', '@euanmsm/dead-code'], { deadCode: false }),
      ['lint', 'knip'],
    );
    assert.deepEqual(toolKeys(['knip', '@euanmsm/dead-code'], { knip: true }), [
      'lint',
      'knip',
      'deadCode',
    ]);
    assert.deepEqual(
      toolKeys(['@euanmsm/dead-code'], {
        tools: [{ key: 'knip', command: 'knip -W app' }],
      }),
      ['deadCode'],
    );
  });

  test('the dead-code check runs branch mode against a base, and the files without one', () => {
    const tool = resolveReviewConfig(
      {},
      {
        name: 'r',
        skillsDir: 's',
        source: 't',
        installed: new Set(['@euanmsm/dead-code']),
      },
    ).prepass.tools.find((t) => t.key === 'deadCode');

    assert.equal(tool.command, 'npx --no-install dead-code --json --');
    assert.equal(tool.appendFiles, true);
    assert.equal(tool.baseCommand, 'npx --no-install dead-code branch --json');
    assert.equal(tool.json, true);
    assert.equal(tool.onlyFilesUnderReview, false);
    assert.deepEqual(tool.errorExitCodes, [2]);
    assert.match(tool.label, /known false positives set apart/);
  });

  test('rejects a baseCommand that is not a string, or error exit codes that are not integers', () => {
    const tool = (extra) => ({
      prepass: { tools: [{ key: 'x', label: 'X', command: 'x', ...extra }] },
    });

    assert.throws(
      () => resolve(tool({ baseCommand: true })),
      /prepass tool "x" baseCommand must be a command string/,
    );
    assert.throws(
      () => resolve(tool({ errorExitCodes: ['2'] })),
      /prepass tool "x" errorExitCodes must be a list of exit codes/,
    );
  });

  test('overriding a built-in command without its baseCommand is an error naming both', () => {
    const withTools = (tools) =>
      resolveReviewConfig(
        { prepass: { tools } },
        {
          name: 'r',
          skillsDir: 's',
          source: 't',
          installed: new Set(['@euanmsm/dead-code']),
        },
      ).prepass.tools.find((t) => t.key === 'deadCode');

    assert.throws(
      () => withTools([{ key: 'deadCode', command: 'dead-code --json -W a' }]),
      /prepass tool "deadCode" sets command but not baseCommand/,
    );
    assert.equal(
      withTools([
        {
          key: 'deadCode',
          command: 'dead-code --json -W a',
          baseCommand: null,
        },
      ]).baseCommand,
      null,
    );
    assert.equal(
      withTools([
        {
          key: 'deadCode',
          command: 'dead-code --json -W a',
          baseCommand: 'dead-code branch --json -W a',
        },
      ]).baseCommand,
      'dead-code branch --json -W a',
    );
  });

  test('finds packages declared in pnpm workspaces', () => {
    const root = makeRepo();
    write(root, 'package.json', '{"name":"root"}\n');
    write(
      root,
      'pnpm-workspace.yaml',
      "packages:\n  - 'apps/*' # apps\n  - \"tools/lint\"\n  - '!apps/skip'\ncatalog:\n  - nope\n",
    );
    write(
      root,
      'apps/web/package.json',
      '{"devDependencies":{"@euanmsm/dead-code":"*"}}\n',
    );
    write(root, 'tools/lint/package.json', '{"dependencies":{"eslint":"*"}}\n');
    write(root, 'apps/skip/package.json', '{"dependencies":{"skipped":"*"}}\n');

    const names = installedPackages(root);

    assert.ok(names.has('@euanmsm/dead-code'));
    assert.ok(names.has('eslint'));
    assert.equal(names.has('skipped'), false);
  });

  test('the dead-code lens loads the dead-code skill when that skill is enabled', () => {
    const lens = (skills, lenses) =>
      resolveReviewConfig(
        { lenses },
        { name: 'r', skillsDir: 's', source: 't', skills: new Set(skills) },
      ).lenses['dead-code'];

    assert.equal(lens([]).skill, null);
    assert.equal(lens(['dead-code']).skill, 'dead-code');
    assert.equal(
      lens(['dead-code'], { 'dead-code': { skill: null } }).skill,
      null,
    );
    assert.equal(
      lens(['dead-code'], { 'dead-code': { judges: 'Mine.' } }).skill,
      'dead-code',
    );
  });

  test('the dead-code lens sets the known list aside and keeps branch findings in scope', () => {
    const { judges } = resolve({}).lenses['dead-code'];

    assert.match(judges, /`known`/);
    assert.match(judges, /never report/i);
    assert.match(judges, /files the branch did not touch/);
    assert.match(judges, /uncommitted/);
    assert.match(judges, /the change that removed its last importer/);
  });

  test('runs the default typecheck only when typescript is installed, and never fetches it', () => {
    const tools = (installed) =>
      resolveReviewConfig(
        {},
        {
          name: 'r',
          skillsDir: 's',
          source: 't',
          installed: new Set(installed),
        },
      ).prepass.tools;

    assert.deepEqual(
      tools([]).map((tool) => tool.key),
      ['lint'],
    );
    assert.equal(
      tools(['typescript']).find((tool) => tool.key === 'tsc').command,
      'npx --no-install tsc --noEmit',
    );
  });

  test('a listed tool with a built-in key keeps the built-in behaviour', () => {
    const knip = resolveReviewConfig(
      { prepass: { tools: [{ key: 'knip', command: 'knip -W app' }] } },
      { name: 'r', skillsDir: 's', source: 't' },
    ).prepass.tools.find((tool) => tool.key === 'knip');

    assert.equal(knip.command, 'knip -W app');
    assert.equal(knip.onlyFilesUnderReview, true);
    assert.match(knip.label, /Knip dead-code report/);
  });

  test('rejects a built-in check setting that is not auto or a boolean', () => {
    assert.throws(() => resolve({ prepass: { knip: 'yes' } }), /prepass.knip/);
  });

  test('resolves both repository configs cleanly', () => {
    assert.equal(Object.keys(resolve(webapp).lenses).length, 30);
    assert.equal(Object.keys(resolve(sales).lenses).length, 21);
  });
});

describe('toSource', () => {
  test('round-trips regexes, nesting and strings with quotes', () => {
    const value = {
      pattern: /^a\/(b|c)\.ts$/i,
      list: ['it’s', "a 'quote'", '`tick` ${x}'],
      nested: { n: 1, flag: true, none: null },
    };
    const back = new Function(`return ${toSource(value)};`)();

    assert.equal(back.pattern.toString(), value.pattern.toString());
    assert.deepEqual(back.list, value.list);
    assert.deepEqual(back.nested, value.nested);
  });

  test('rejects a function', () => {
    assert.throws(() => toSource({ f: () => 1 }), /Cannot write a function/);
  });
});

describe('the generated workflow', () => {
  for (const [name, raw, files] of [
    ['defaults', {}, ['src/a.ts', 'migrations/001.sql', 'src/a.test.ts']],
    [
      'web app',
      webapp,
      [
        'src/routes/api/bookings/route.ts',
        'src/components/BookingCard.tsx',
        'db/migrations/1.sql',
      ],
    ],
    [
      'Sales harness',
      sales,
      [
        'packages/service/src/steps/enrich.ts',
        'packages/service/migrations/2.sql',
        'README.md',
      ],
    ],
  ]) {
    test(`runs end to end with the ${name} config`, async () => {
      const source = renderEngine(ENGINE, resolve(raw));
      const { result, calls } = await runWorkflow(source, {
        ...DIFF_ARGS,
        changedFiles: files,
      });

      assert.match(result.markdown, /^# Branch review — `feat\/x`/);
      assert.ok(result.bundlesRun.length > 0);
      assert.ok(result.stats.findings > 0);
      assert.match(
        result.prBody,
        /Full report: `tmp\/code-reviews\/x\.tmp\.md`/,
      );
      assert.ok(calls.some((call) => call.label.startsWith('verify:')));
    });
  }

  test('says in the header which state of the branch was reviewed', async () => {
    const source = renderEngine(ENGINE, resolve({}));
    const run = (treeState) =>
      runWorkflow(source, {
        ...DIFF_ARGS,
        changedFiles: ['src/a.ts'],
        treeState,
      });

    const dirty = (await run('commit abc1234; 2 uncommitted file(s) left out'))
      .result.markdown;
    assert.match(
      dirty,
      /^\*\*State reviewed:\*\* commit abc1234; 2 uncommitted file\(s\) left out$/m,
    );

    assert.doesNotMatch(
      (await run(undefined)).result.markdown,
      /State reviewed/,
    );
  });

  test('carries the skill name in its meta and no leftover markers', () => {
    const source = renderEngine(ENGINE, resolve({}));

    assert.match(source, /^\/\/ Generated by @euanmsm\/skills/);
    assert.match(source, /name: "code-review"/);
    assert.doesNotMatch(source, /__SKILL_NAME__|\/\* CONFIG \*\//);
  });

  test('puts the repository wording into the prompts', async () => {
    const source = renderEngine(
      ENGINE,
      resolve({ prompts: { layerChain: 'handler -> job -> store' } }),
    );
    const { calls } = await runWorkflow(source, {
      ...DIFF_ARGS,
      changedFiles: ['src/a.ts'],
    });
    const reviewer = calls.find((call) => call.label.startsWith('review:'));

    assert.match(reviewer.prompt, /boundary \(handler -> job -> store\)/);
  });

  test('titles a lens whose key ends in a dash', async () => {
    const source = renderEngine(
      ENGINE,
      resolve({
        lenses: {
          'e2e-': {
            judges: 'E.',
            route: { always: 'code' },
            bundle: 'correctness',
          },
        },
      }),
    );
    const { result, calls } = await runWorkflow(source, {
      ...DIFF_ARGS,
      changedFiles: ['src/a.ts'],
    });

    assert.deepEqual(result.bundlesDied, []);
    assert.ok(calls.some((call) => /Pass \d+ — E2e /.test(call.prompt)));
  });

  test('lists each configured tool report for the reviewers', async () => {
    const source = renderEngine(
      ENGINE,
      resolve({
        prepass: {
          tools: [
            { key: 'knip', label: 'Knip report', command: 'knip', json: true },
          ],
        },
      }),
    );
    const { calls } = await runWorkflow(source, {
      ...DIFF_ARGS,
      changedFiles: ['src/a.ts'],
      toolReports: { knip: 't/_knip.tmp.json', sentinel: 't/done.json' },
    });

    assert.match(calls[0].prompt, /- Knip report: `t\/_knip\.tmp\.json`/);
  });

  test('the verifier keeps a finding a branch-wide report lists, in a file the diff left alone', async () => {
    const source = renderEngine(
      ENGINE,
      resolveReviewConfig(
        {},
        {
          name: 'code-review',
          skillsDir: '.claude/skills',
          source: 'test',
          installed: new Set(['@euanmsm/dead-code']),
        },
      ),
    );
    const verifier = async (toolReports) =>
      (
        await runWorkflow(source, {
          ...DIFF_ARGS,
          changedFiles: ['src/a.ts'],
          toolReports,
        })
      ).calls.find((call) => call.label.startsWith('verify:')).prompt;

    const withReport = await verifier({
      deadCode: 't/_deadCode.tmp.json',
      sentinel: 't/done.json',
    });
    assert.match(withReport, /`t\/_deadCode\.tmp\.json`/);
    assert.match(withReport, /lists it under `findings`/);

    assert.doesNotMatch(
      await verifier({ sentinel: 't/done.json' }),
      /lists it under `findings`/,
    );
  });
});

describe('merging findings', () => {
  /**
   * Builds one finding on `src/a.ts` the way a reviewer returns it.
   *
   * @param id - The finding id
   * @param lens - The lens that raised it
   * @param line - The line string
   * @param severity - Its severity
   * @param issue - Its one-line title
   * @returns The finding
   */
  function finding(id, lens, line, severity, issue) {
    return {
      id,
      lens,
      file: 'src/a.ts',
      line,
      severity,
      issue,
      detail: 'detail',
      whyItMatters: 'why',
      evidence: 'evidence',
      convention: null,
    };
  }

  /**
   * Reviews `src/a.ts` on the default config with some replies replaced.
   *
   * @param findings - Findings by reviewer label, less `review:`, in place of that bundle's canned ones
   * @param verdicts - Verdict by finding id, in place of `confirmed`
   * @returns The workflow's result and logs
   */
  function review(findings, verdicts = {}) {
    return runWorkflow(
      renderEngine(ENGINE, resolve({})),
      { ...DIFF_ARGS, changedFiles: ['src/a.ts'] },
      {
        reply: (label, prompt) => {
          const canned = reply(label, prompt);
          const bundle = label.replace(/^review:/, '');

          if (label.startsWith('review:') && findings[bundle]) {
            return { ...canned, findings: findings[bundle] };
          }
          if (label.startsWith('verify:')) {
            return {
              verdicts: canned.verdicts.map((one) =>
                verdicts[one.id]
                  ? { ...one, verdict: verdicts[one.id], reasoning: 'no' }
                  : one,
              ),
            };
          }
          return canned;
        },
      },
    );
  }

  test('keeps a confirmed finding beside a refuted one from the same reviewer', async () => {
    const { result, logs } = await review(
      {
        'correctness-1': [
          finding('bugs-nit', 'bugs', '40', 'low', 'Naming nit'),
          finding('bugs-crit', 'bugs', '42', 'critical', 'Null deref'),
        ],
      },
      { 'bugs-nit': 'refuted' },
    );

    assert.equal(result.stats.critical, 1);
    assert.equal(result.stats.refuted, 1);
    assert.equal(result.stats.twins, 0);
    assert.match(result.markdown, /## \d+ — Null deref/);
    assert.match(result.markdown, /## Refuted and dropped\n\n- \*\*Naming nit/);
    assert.doesNotMatch(result.markdown, /Split verdict/);
    assert.ok(logs.some((line) => /0 cross-bundle twin/.test(line)));
  });

  test('merges one lens’s finding across bundles and shows the most severe', async () => {
    const { result } = await review({
      'correctness-1': [finding('bugs-a', 'bugs', '40', 'low', 'Off by one')],
      security: [
        finding('bugs-b', 'bugs', '41', 'critical', 'Off by one, crashes'),
        finding('sec-a', 'security', '40', 'high', 'Unescaped input'),
      ],
    });

    assert.equal(result.stats.twins, 1);
    assert.equal(result.stats.critical, 1);
    assert.equal(result.stats.low, 0);
    assert.match(result.markdown, /## \d+ — Off by one, crashes/);
    assert.match(result.markdown, /## \d+ — Unescaped input/);
    assert.doesNotMatch(result.markdown, /## \d+ — Off by one\n/);
  });

  test('drops a merged finding only when every verifier refuted it', async () => {
    const twins = {
      'correctness-1': [
        finding('bugs-a', 'bugs', '42', 'critical', 'Null deref'),
      ],
      security: [finding('bugs-b', 'bugs', '42', 'low', 'Null deref, maybe')],
    };

    const split = (await review(twins, { 'bugs-b': 'refuted' })).result;
    assert.equal(split.stats.critical, 1);
    assert.equal(split.stats.refuted, 0);
    assert.equal(split.stats.splitVerdicts, 1);
    assert.match(split.markdown, /Split verdict/);

    const both = (
      await review(twins, { 'bugs-a': 'refuted', 'bugs-b': 'refuted' })
    ).result;
    assert.equal(both.stats.critical, 0);
    assert.equal(both.stats.refuted, 1);
  });

  /**
   * Reviews `src/a.ts` on the default config, letting a function replace any reply.
   *
   * @param override - Returns the reply for a label, or undefined to keep the canned one
   * @returns The workflow's result, calls and logs
   */
  function reviewWith(override) {
    return runWorkflow(
      renderEngine(ENGINE, resolve({})),
      {
        ...DIFF_ARGS,
        changedFiles: ['src/a.ts'],
        toolReports: {
          lint: 't/_lint.tmp.txt',
          importGraph: 't/_import-graph.tmp.md',
          sentinel: 't/_prepass.done.json',
        },
      },
      {
        reply: (label, prompt) => {
          const own = override(label, prompt, reply(label, prompt));
          return own === undefined ? reply(label, prompt) : own;
        },
      },
    );
  }

  test('lists a reviewer that returned nothing as dead, with its banner', async () => {
    const { result } = await reviewWith((label) =>
      label === 'review:security' ? null : undefined,
    );

    assert.deepEqual(result.bundlesDied, ['security']);
    assert.match(
      result.markdown,
      /### Security\n\n\*\*A reviewer for this bundle returned nothing/,
    );
    assert.doesNotMatch(
      result.markdown,
      /### Performance\n\n\*\*A reviewer for this bundle/,
    );
  });

  test('says a finding is unverified because its verifier returned nothing', async () => {
    const { result } = await reviewWith((label) =>
      label.startsWith('verify:') ? null : undefined,
    );

    assert.ok(result.stats.findings > 0);
    assert.equal(result.stats.unverified, result.stats.findings);
    assert.match(
      result.markdown,
      /Not verified — the verifier returned nothing/,
    );
    assert.doesNotMatch(result.markdown, /verification cap/);
  });

  test('says a finding is unverified because its verifier left its id out', async () => {
    const { result } = await reviewWith((label, _prompt, canned) =>
      label.startsWith('verify:')
        ? {
            verdicts: canned.verdicts.filter((one) => one.id !== 'bugs-1'),
          }
        : undefined,
    );

    assert.equal(result.stats.unverified, 1);
    assert.match(
      result.markdown,
      /Not verified — the verifier gave no verdict for this finding/,
    );
  });

  test('says a finding is unverified because it was over the cap', async () => {
    const many = Array.from({ length: 13 }, (_, i) =>
      finding(`bugs-${i}`, 'bugs', String(10 + i * 10), 'medium', `Bug ${i}`),
    );
    const { result } = await review({ 'correctness-1': many });

    assert.equal(result.stats.unverified, 1);
    assert.match(
      result.markdown,
      /Not verified — over the per-bundle verification cap/,
    );
  });

  test('ignores a corrected severity outside the scale', async () => {
    const { result, calls } = await reviewWith((label, _prompt, canned) =>
      label.startsWith('verify:')
        ? {
            verdicts: canned.verdicts.map((one) => ({
              ...one,
              verdict: 'amended',
              corrected: { severity: 'moderate' },
            })),
          }
        : undefined,
    );

    const { critical, high, medium, low, findings } = result.stats;
    assert.equal(critical + high + medium + low, findings);
    assert.doesNotMatch(result.markdown, /\| undefined \|/);

    const corrected = calls.find((call) => call.label.startsWith('verify:'))
      .schema.properties.verdicts.items.properties.corrected;
    assert.deepEqual(corrected.properties.severity.enum, [
      'critical',
      'high',
      'medium',
      'low',
    ]);
    assert.equal(corrected.additionalProperties, false);
  });

  test('keeps each file’s verdict when a reviewer reuses an id across files', async () => {
    const { result } = await reviewWith((label, _prompt, canned) => {
      if (label === 'review:correctness-1') {
        return {
          ...canned,
          findings: [
            finding('bugs-1', 'bugs', '42', 'critical', 'Null deref'),
            {
              ...finding('bugs-1', 'bugs', '10', 'low', 'Naming nit'),
              file: 'src/b.ts',
            },
          ],
        };
      }
      if (label === 'verify:b.ts') {
        return {
          verdicts: canned.verdicts.map((one) => ({
            ...one,
            verdict: 'refuted',
            reasoning: 'no',
          })),
        };
      }
      return undefined;
    });

    assert.match(result.markdown, /## \d+ — Null deref/);
    assert.match(result.markdown, /## Refuted and dropped\n\n- \*\*Naming nit/);
  });

  test('ignores blank fields and an unknown lens in a correction', async () => {
    const blank = Object.fromEntries(
      ['id', 'file', 'line', 'issue', 'detail', 'whyItMatters', 'evidence'].map(
        (key) => [key, ''],
      ),
    );
    const { result } = await reviewWith((label, _prompt, canned) =>
      label.startsWith('verify:')
        ? {
            verdicts: canned.verdicts.map((one, i) => ({
              ...one,
              verdict: 'amended',
              reasoning: 'r',
              corrected: { ...blank, lens: i === 0 ? '' : 'nope' },
            })),
          }
        : undefined,
    );

    assert.ok(result.stats.findings > 0);
    assert.doesNotMatch(result.markdown, /## \d+ — \n/);
    assert.doesNotMatch(result.markdown, /# Nope\n/);
  });

  test('escapes pipes and newlines in a summary table cell', async () => {
    const { result } = await review({
      'correctness-1': [
        finding('bugs-x', 'bugs', '40', 'high', '`a || b`\nswallows 0'),
      ],
    });

    assert.match(result.markdown, /\| `a \\\|\\\| b` swallows 0 \|/);
  });

  test('Recon is told the tool reports exist but never waits for them', async () => {
    const { calls } = await reviewWith(() => undefined);
    const recon = calls.find((call) => call.label === 'recon');
    const reviewer = calls.find((call) => call.label.startsWith('review:'));

    assert.doesNotMatch(
      recon.prompt,
      /_prepass\.done\.json|Wait for the prepass/,
    );
    assert.match(recon.prompt, /If `t\/_import-graph\.tmp\.md` exists/);
    assert.match(reviewer.prompt, /Wait for the prepass/);
    assert.match(reviewer.prompt, /t\/_prepass\.done\.json/);
  });

  test('tells the agents where each file’s patch is', async () => {
    const { calls } = await reviewWith(() => undefined);

    for (const label of ['recon', 'review:security', 'verify:a.ts']) {
      const call = calls.find((one) => one.label === label);
      assert.match(call.prompt, /`tmp\/patch\/<path>\.patch`/, label);
    }
  });
});

describe('sync with code-review', () => {
  /**
   * Makes a repository with code-review switched on and the given review config.
   *
   * @param options - The skill's options
   * @param config - The `.devkit/code-review.mjs` source, or none
   * @returns The repository root
   */
  function reviewRepo(options = {}, config) {
    return makeRepo({
      'skills.json': { skills: { 'code-review': options } },
      ...(config ? { 'code-review.mjs': config } : {}),
    });
  }

  test('writes the skill and the workflow, and no rule without githubReview', async () => {
    const paths = (await plan(reviewRepo())).map((file) => file.path);

    assert.deepEqual(paths.sort(), [
      '.claude/skills/review/SKILL.md',
      '.claude/skills/review/review.workflow.js',
    ]);
  });

  test('githubReview adds the PR mode and the pr-reviews rule', async () => {
    const files = await plan(reviewRepo({ githubReview: true }));
    const skill = files.find((file) => file.path.endsWith('SKILL.md')).content;

    assert.ok(
      files.some((file) => file.path === '.claude/rules/pr-reviews.md'),
    );
    assert.match(skill, /## 6\. Deliver to GitHub/);
    assert.match(skill, /## 7\. Present to the user/);
  });

  test('without githubReview the page says nothing is posted', async () => {
    const files = await plan(reviewRepo());
    const skill = files.find((file) => file.path.endsWith('SKILL.md')).content;

    assert.doesNotMatch(skill, /Deliver to GitHub|pr-reviews/);
    assert.match(skill, /Nothing is posted anywhere/);
    assert.match(skill, /## 6\. Present to the user/);
  });

  test('the page checks the PR, the base, the tree and clears the last run', async () => {
    const files = await plan(reviewRepo({ githubReview: true }));
    const skill = files.find((file) => file.path.endsWith('SKILL.md')).content;

    assert.match(skill, /gh pr view <n> --json number,headRefName,baseRefName/);
    assert.match(skill, /gh pr checkout <n>/);
    assert.match(skill, /BASE_BRANCH="main"\s+# "\$PR_BASE" in pr mode/);
    assert.match(skill, /refs\/remotes\/origin\/\$BASE_BRANCH/);
    assert.match(
      skill,
      /BRANCH_LEAF="detached-\$\(git rev-parse --short HEAD\)"/,
    );
    assert.match(skill, /git status --porcelain/);
    assert.match(skill, /treeState: TREE_STATE/);
    assert.match(skill, /git -c core\.quotePath=false diff --name-only/);
    assert.match(
      skill,
      /rm -f "\$SCRATCH_DIR\/_prepass\.done\.json"[\s\S]*prepass tools/,
    );
    assert.doesNotMatch(skill, /prNumber/);
  });

  test('pr-reviews sets the body once and asks which event to submit', async () => {
    const files = await plan(reviewRepo({ githubReview: true }));
    const rule = files.find((file) =>
      file.path.endsWith('pr-reviews.md'),
    ).content;

    assert.match(rule, /reviews\/<ID>\/events -f event="<EVENT>"\n/);
    assert.doesNotMatch(rule, /events[^\n]*\\\n[^\n]*body=/);
    assert.doesNotMatch(rule, /default unless the user says otherwise/);
    assert.match(rule, /ask which event/);
  });

  test('names the skill folder and slash command after the name option', async () => {
    const files = await plan(reviewRepo({ name: 'review' }));
    const skill = files.find((file) => file.path.endsWith('SKILL.md'));

    assert.equal(skill.path, '.claude/skills/review/SKILL.md');
    assert.match(skill.content, /^name: review$/m);
    assert.match(
      skill.content,
      /scriptPath: "\.claude\/skills\/review\/review\.workflow\.js"/,
    );
  });

  test('refuses a lens whose skill the repository does not have', async () => {
    const root = reviewRepo(
      {},
      "export default { lenses: { security: { skill: 'security' } } };",
    );

    await assert.rejects(
      () => plan(root),
      /security → \.claude\/skills\/security/,
    );

    write(
      root,
      '.claude/skills/security/SKILL.md',
      '---\nname: security\n---\n',
    );
    await assert.doesNotReject(() => plan(root));
  });

  test('refuses a config module with no default export', async () => {
    const root = reviewRepo({}, 'export const review = {};');

    await assert.rejects(() => plan(root), /must export an object/);
  });

  test('check flags the workflow once the review config changes', async () => {
    const root = reviewRepo({}, 'export default {};');
    await sync(root);
    assert.deepEqual(await check(root), []);

    writeFileSync(
      join(root, '.devkit/code-review.mjs'),
      "export default { prompts: { layerChain: 'a -> b' } };",
    );

    assert.deepEqual(
      (await check(root)).map((problem) => problem.path),
      ['.claude/skills/review/review.workflow.js'],
    );
  });

  test('the diff is taken from whichever copy of the base the branch left later', async () => {
    const skill = (await plan(reviewRepo({ githubReview: true }))).find(
      (file) => file.path.endsWith('SKILL.md'),
    ).content;
    const lines = skill.split('\n');
    const start = lines.findIndex((line) => line.startsWith('TARGET='));
    const block = lines.slice(start, lines.indexOf('```', start)).join('\n');

    const expected = {
      local: 'origin/main',
      origin: 'main',
      none: 'main',
      gone: 'origin/main',
    };
    for (const [behind, ref] of Object.entries(expected)) {
      const { repo, fork } = staleBaseRepo({ behind });
      for (const shell of SHELLS) {
        assert.equal(
          runShell(
            shell,
            `BRANCH=feat\n${block}\necho "$BASE_REF $BASE"`,
            repo,
          ),
          `${ref} ${fork}`,
          `${behind} copy behind, in ${shell}`,
        );
      }
    }
  });

  test('the prepass commands get their folders from the current one, and --base as its own argument', async () => {
    const skill = (await plan(reviewRepo())).find((file) =>
      file.path.endsWith('SKILL.md'),
    ).content;
    const line = (start) =>
      skill.split('\n').find((one) => one.startsWith(start));
    const tools = line('npx --no-install skills prepass tools');
    const split = line('npx --no-install skills prepass split');
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'skills-cwd-')));

    // A stand-in npx prints the arguments the skill's line hands it.
    const run = (shell, vars, command) =>
      execFileSync(
        shell,
        ['-c', `npx() { printf '[%s]' "$@"; }\n${vars}\n${command}`],
        { cwd, encoding: 'utf8' },
      );

    for (const shell of SHELLS) {
      assert.equal(
        run(shell, 'SCRATCH_DIR=t', tools),
        `[--no-install][skills][prepass][tools][--scratch][${cwd}/t][--files-from][${cwd}/t/_files.tmp.txt][--base][]`,
        shell,
      );
      assert.equal(
        run(shell, 'SCRATCH_DIR=t; BASE=abc123', tools),
        `[--no-install][skills][prepass][tools][--scratch][${cwd}/t][--files-from][${cwd}/t/_files.tmp.txt][--base][abc123]`,
        shell,
      );
      assert.equal(
        run(shell, 'BASE=abc123; TARGET=feat; PATCH_DIR=t/_patch/x', split),
        `[--no-install][skills][prepass][split][--base][abc123][--target][feat][--out][${cwd}/t/_patch/x]`,
        shell,
      );
    }
  });

  test('the dead-code lens loads the shipped dead-code skill when both are enabled', async () => {
    const root = makeRepo({
      'skills.json': { skills: { 'code-review': {}, 'dead-code': {} } },
    });

    const files = await plan(root);
    const workflow = files.find((file) =>
      file.path.endsWith('review.workflow.js'),
    ).content;

    assert.ok(
      files.some((file) => file.path === '.claude/skills/dead-code/SKILL.md'),
    );
    assert.match(workflow, /"dead-code": \{\s*"skill": "dead-code"/);
  });

  test('removes the whole generated skill folder when switched off', async () => {
    const root = reviewRepo({ githubReview: true });
    await sync(root);

    writeFileSync(
      join(root, '.devkit/skills.json'),
      JSON.stringify({ skills: {} }),
    );
    await sync(root);

    assert.equal(existsSync(join(root, '.claude/skills/review')), false);
    assert.equal(existsSync(join(root, '.claude/rules/pr-reviews.md')), false);
  });
});

describe('prepass', () => {
  const git = (root, ...args) =>
    execFileSync('git', args, { cwd: root, stdio: 'pipe' }).toString();

  /**
   * Makes a real repository with a base commit and a change commit on top.
   *
   * @param base - File contents by path for the first commit; a Buffer is written as it is
   * @param change - Edits for the second commit: contents by path, null to delete, or `{ from }` to rename
   * @param config - Local git settings to apply before diffing, by key
   * @returns The repository root
   */
  function historyRepo(base, change, config = {}) {
    const root = makeRepo();
    execFileSync('rm', ['-r', join(root, '.git')]);
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 't@t');
    git(root, 'config', 'user.name', 't');
    git(root, 'config', 'commit.gpgsign', 'false');

    const commit = (files, message) => {
      for (const [file, body] of Object.entries(files)) {
        if (body === null) git(root, 'rm', '-q', file);
        else if (body?.from) git(root, 'mv', body.from, file);
        else write(root, file, body);
      }
      git(root, 'add', '-A');
      git(root, 'commit', '-q', '--allow-empty', '-m', message);
    };

    commit(base, 'base');
    commit(change, 'change');
    for (const [key, value] of Object.entries(config)) {
      git(root, 'config', key, value);
    }

    return root;
  }

  /**
   * Splits HEAD~1..HEAD into `tmp/patch`.
   *
   * @param root - The repository root
   * @returns The split summary
   */
  const split = (root) =>
    splitPatches(root, { base: 'HEAD~1', target: 'HEAD', out: 'tmp/patch' });

  /**
   * Reads one patch file the split wrote.
   *
   * @param root - The repository root
   * @param file - The changed file's path
   * @returns The patch text
   */
  const patchFor = (root, file) =>
    readFileSync(join(root, 'tmp/patch', `${file}.patch`), 'utf8');

  test('split writes one patch per changed file, mirroring the folder tree', async () => {
    const root = historyRepo(
      { 'a.ts': 'one\n' },
      { 'a.ts': 'two\n', 'src/b c.ts': 'new\n' },
    );

    const summary = await split(root);

    assert.equal(summary.files, 2);
    assert.equal(summary.unnamed, 0);
    assert.equal(summary.largeDiff, false);
    assert.match(patchFor(root, 'a.ts'), /^\+two$/m);
    assert.match(patchFor(root, 'src/b c.ts'), /^\+new$/m);
  });

  test('split keeps a/b.ts and a_b.ts apart', async () => {
    const root = historyRepo(
      { 'keep.ts': 'x\n' },
      { 'src/a/b.ts': 'nested\n', 'src/a_b.ts': 'flat\n' },
    );

    const summary = await split(root);

    assert.equal(summary.files, 2);
    assert.match(patchFor(root, 'src/a/b.ts'), /^\+nested$/m);
    assert.match(patchFor(root, 'src/a_b.ts'), /^\+flat$/m);
  });

  test('split names a deleted file by its old path', async () => {
    const root = historyRepo(
      { 'src/gone.ts': 'bye\n', 'keep.ts': 'x\n' },
      { 'src/gone.ts': null },
    );

    const summary = await split(root);

    assert.equal(summary.files, 1);
    assert.match(patchFor(root, 'src/gone.ts'), /^-bye$/m);
  });

  test('split names a pure rename by its new path', async () => {
    const root = historyRepo(
      { 'src/old.ts': 'same\n' },
      { 'src/new name.ts': { from: 'src/old.ts' } },
    );

    const summary = await split(root);

    assert.equal(summary.files, 1);
    assert.equal(summary.unnamed, 0);
    assert.match(
      patchFor(root, 'src/new name.ts'),
      /^rename to src\/new name\.ts$/m,
    );
  });

  test('split names a binary file from its header', async () => {
    const root = historyRepo(
      { 'keep.ts': 'x\n' },
      { 'img/logo.png': Buffer.from([0, 1, 2, 0, 255, 0]) },
    );

    const summary = await split(root);

    assert.equal(summary.files, 1);
    assert.match(patchFor(root, 'img/logo.png'), /Binary files/);
  });

  test('split names a non-ASCII path as it is, not quoted', async () => {
    const root = historyRepo({ 'keep.ts': 'x\n' }, { 'src/café.ts': 'hi\n' });

    const summary = await split(root);

    assert.equal(summary.files, 1);
    assert.equal(summary.unnamed, 0);
    assert.match(patchFor(root, 'src/café.ts'), /^\+hi$/m);
  });

  test('split names a path git has to quote', async () => {
    const root = historyRepo(
      { 'keep.ts': 'x\n' },
      { 'src/say "hi".ts': 'q\n' },
    );

    const summary = await split(root);

    assert.equal(summary.files, 1);
    assert.match(patchFor(root, 'src/say "hi".ts'), /^\+q$/m);
  });

  test('split ignores the user’s diff prefix, colour and external diff settings', async () => {
    const root = historyRepo(
      { 'a.ts': 'one\n' },
      { 'a.ts': 'two\n' },
      {
        'diff.noprefix': 'true',
        'color.diff': 'always',
        'color.ui': 'always',
        'diff.external': 'echo external',
      },
    );

    const summary = await split(root);

    assert.equal(summary.files, 1);
    assert.equal(summary.unnamed, 0);
    assert.match(patchFor(root, 'a.ts'), /^--- a\/a\.ts$/m);
    assert.doesNotMatch(patchFor(root, 'a.ts'), /\x1b\[/);
  });

  test('split of an empty diff writes nothing and counts nothing', async () => {
    const root = historyRepo({ 'a.ts': 'one\n' }, {});

    assert.deepEqual(await split(root), {
      patchDir: 'tmp/patch',
      files: 0,
      unnamed: 0,
      patchLines: 0,
      largeDiff: false,
    });
    assert.ok(existsSync(join(root, 'tmp/patch')));
  });

  test('tools lands every report, then the sentinel naming each', async () => {
    const root = makeRepo();
    const config = resolve({
      prepass: {
        tools: [
          { key: 'lint', label: 'Lint', command: 'echo lint says hi' },
          {
            key: 'deps',
            label: 'Deps',
            command: `echo 'npm noise {"files":[]} npm tail'`,
            json: true,
          },
        ],
      },
    });

    const status = await runTools(root, config, { scratch: 'tmp', files: [] });

    assert.deepEqual(status, {
      lint: { status: 'ok', exitCode: 0 },
      deps: { status: 'ok', exitCode: 0 },
      importGraph: 'ok',
      files: 0,
    });
    assert.match(
      readFileSync(join(root, 'tmp/_lint.tmp.txt'), 'utf8'),
      /lint says hi/,
    );
    assert.equal(
      readFileSync(join(root, 'tmp/_deps.tmp.json'), 'utf8'),
      '{"files":[]}\n',
    );
    assert.deepEqual(
      JSON.parse(readFileSync(join(root, 'tmp/_prepass.done.json'), 'utf8')),
      status,
    );
  });

  /**
   * Runs one tool through the prepass and reads back what it landed.
   *
   * @param command - The tool's shell command
   * @param options - A `root` to run in, and `timeoutMs` in place of the default
   * @returns The tool's sentinel entry and its report text
   */
  async function runOne(command, { root = makeRepo(), timeoutMs } = {}) {
    const config = resolve({
      prepass: { tools: [{ key: 'one', label: 'One', command }] },
    });
    const status = await runTools(root, config, {
      scratch: 'tmp',
      files: [],
      timeoutMs,
    });

    return {
      entry: status.one,
      report: readFileSync(join(root, 'tmp/_one.tmp.txt'), 'utf8'),
      sentinel: existsSync(join(root, 'tmp/_prepass.done.json')),
    };
  }

  test('a tool that exits non-zero because it found something is ok', async () => {
    const { entry, report } = await runOne('echo "2 problems"; exit 1');

    assert.deepEqual(entry, { status: 'ok', exitCode: 1 });
    assert.match(report, /2 problems/);
  });

  test('a command the shell cannot find is failed', async () => {
    const { entry } = await runOne('definitely-not-a-real-tool --check');

    assert.deepEqual(entry, { status: 'failed', exitCode: 127 });
  });

  test('a command the shell cannot execute is failed', async () => {
    const root = makeRepo();
    write(root, 'not-executable.sh', 'echo hi\n');

    const { entry } = await runOne('./not-executable.sh', { root });

    assert.deepEqual(entry, { status: 'failed', exitCode: 126 });
  });

  test('an npm script the package does not have is failed', async () => {
    const root = makeRepo();
    write(root, 'package.json', '{"name":"x","scripts":{}}\n');

    const { entry, report } = await runOne('npm run lint', { root });

    assert.equal(entry.status, 'failed');
    assert.match(report, /Missing script/);
  });

  test('a tool reading stdin gets end of input rather than hanging', async () => {
    const { entry } = await runOne('cat', { timeoutMs: 5000 });

    assert.deepEqual(entry, { status: 'ok', exitCode: 0 });
  });

  test('a tool past its timeout is stopped, reported and the sentinel still lands', async () => {
    const { entry, report, sentinel } = await runOne(
      'echo started; sleep 30 & wait',
      { timeoutMs: 300 },
    );

    assert.deepEqual(entry, { status: 'timedOut', exitCode: null });
    assert.match(report, /timed out after 0\.3s/);
    assert.match(report, /started/);
    assert.ok(sentinel);
  });

  test('passes the files under review that still exist to an appendFiles tool', async () => {
    const root = makeRepo();
    write(root, "src/it's here.ts", 'x\n');
    const config = resolve({
      prepass: {
        tools: [
          {
            key: 'args',
            label: 'Args',
            command: 'printf "%s\\n"',
            appendFiles: true,
          },
        ],
      },
    });

    await runTools(root, config, {
      scratch: 'tmp',
      files: ["src/it's here.ts", 'src/deleted.ts'],
    });

    assert.equal(
      readFileSync(join(root, 'tmp/_args.tmp.txt'), 'utf8'),
      "src/it's here.ts\n",
    );
  });

  /**
   * Resolves one tool that prints its own arguments, one per line.
   *
   * @param extra - More tool fields
   * @returns The resolved config
   */
  const echoTool = (extra) =>
    resolve({
      prepass: {
        tools: [
          {
            key: 'args',
            label: 'Args',
            command: 'printf "%s\\n" files',
            appendFiles: true,
            baseCommand: 'printf "%s\\n" branch',
            ...extra,
          },
        ],
      },
    });

  test('runs the baseCommand with the base, instead of the files, when given a base', async () => {
    const root = makeRepo();
    write(root, 'src/a.ts', 'x\n');

    await runTools(root, echoTool(), {
      scratch: 'tmp',
      files: ['src/a.ts'],
      base: "abc'123",
    });

    assert.equal(
      readFileSync(join(root, 'tmp/_args.tmp.txt'), 'utf8'),
      "branch\nabc'123\n",
    );
  });

  test('runs the command with the files when there is no base', async () => {
    const root = makeRepo();
    write(root, 'src/a.ts', 'x\n');

    await runTools(root, echoTool(), { scratch: 'tmp', files: ['src/a.ts'] });

    assert.equal(
      readFileSync(join(root, 'tmp/_args.tmp.txt'), 'utf8'),
      'files\nsrc/a.ts\n',
    );
  });

  test('a tool without a baseCommand ignores the base', async () => {
    const root = makeRepo();
    write(root, 'src/a.ts', 'x\n');

    await runTools(root, echoTool({ baseCommand: undefined }), {
      scratch: 'tmp',
      files: ['src/a.ts'],
      base: 'abc',
    });

    assert.equal(
      readFileSync(join(root, 'tmp/_args.tmp.txt'), 'utf8'),
      'files\nsrc/a.ts\n',
    );
  });

  test('an exit code the tool names as its own error is failed, and its message kept', async () => {
    const root = makeRepo();
    const config = resolve({
      prepass: {
        tools: [
          {
            key: 'dc',
            label: 'Dead code',
            command: 'echo "dead-code: bad config {x}" >&2; exit 2',
            json: true,
            errorExitCodes: [2],
          },
          {
            key: 'found',
            label: 'Found',
            command: `echo '{"findings":[1]}'; exit 1`,
            json: true,
            errorExitCodes: [2],
          },
        ],
      },
    });

    const status = await runTools(root, config, { scratch: 'tmp', files: [] });

    assert.deepEqual(status.dc, { status: 'failed', exitCode: 2 });
    assert.match(
      readFileSync(join(root, 'tmp/_dc.tmp.json'), 'utf8'),
      /dead-code: bad config/,
    );
    assert.deepEqual(status.found, { status: 'ok', exitCode: 1 });
    assert.equal(
      readFileSync(join(root, 'tmp/_found.tmp.json'), 'utf8'),
      '{"findings":[1]}\n',
    );
  });

  test('prepass tools hands --base to the tools', async () => {
    const root = makeRepo({
      'skills.json': { skills: { 'code-review': {} } },
      'code-review.mjs': `export default ${JSON.stringify({
        prepass: {
          tools: [
            {
              key: 'args',
              label: 'Args',
              command: 'printf "%s\\n" files',
              baseCommand: 'printf "%s\\n" branch',
            },
          ],
        },
      })};`,
    });
    write(root, 'tmp/list.txt', 'src/a.ts\n');

    const log = console.log;
    console.log = () => {};
    try {
      await prepass(
        [
          'tools',
          '--scratch',
          'tmp',
          '--files-from',
          'tmp/list.txt',
          '--base',
          'abc123',
        ],
        root,
      );
    } finally {
      console.log = log;
    }

    assert.equal(
      readFileSync(join(root, 'tmp/_args.tmp.txt'), 'utf8'),
      'branch\nabc123\n',
    );
  });

  test('prepass tools reads an empty --base as no base, and still lands the sentinel', async () => {
    const root = makeRepo({
      'skills.json': { skills: { 'code-review': {} } },
      'code-review.mjs': `export default ${JSON.stringify({
        prepass: {
          tools: [
            {
              key: 'args',
              label: 'Args',
              command: 'printf "%s\\n" files',
              appendFiles: true,
              baseCommand: 'printf "%s\\n" branch',
            },
          ],
        },
      })};`,
    });
    write(root, 'src/a.ts', 'x\n');
    write(root, 'tmp/list.txt', 'src/a.ts\n');

    const log = console.log;
    console.log = () => {};
    try {
      await prepass(
        [
          'tools',
          '--scratch',
          'tmp',
          '--files-from',
          'tmp/list.txt',
          '--base',
          '',
        ],
        root,
      );
    } finally {
      console.log = log;
    }

    assert.equal(
      readFileSync(join(root, 'tmp/_args.tmp.txt'), 'utf8'),
      'files\nsrc/a.ts\n',
    );
    assert.ok(existsSync(join(root, 'tmp/_prepass.done.json')));
  });

  test('prepass tools matches a ./ or absolute listed path against the paths a tool reports', async () => {
    const report = JSON.stringify({
      issues: [{ file: 'src/a.ts' }, { file: 'src/b.ts' }, { file: 'x.ts' }],
    });
    const root = makeRepo({
      'skills.json': { skills: { 'code-review': {} } },
      'code-review.mjs': `export default ${JSON.stringify({
        prepass: {
          tools: [
            {
              key: 'unused',
              label: 'Unused',
              command: `printf '%s' '${report}'`,
              json: true,
              onlyFilesUnderReview: true,
            },
          ],
        },
      })};`,
    });
    write(root, 'src/a.ts', 'x\n');
    write(root, 'src/b.ts', 'x\n');
    write(root, 'tmp/list.txt', `./src/a.ts\n${join(root, 'src/b.ts')}\n`);

    const log = console.log;
    console.log = () => {};
    try {
      await prepass(
        ['tools', '--scratch', 'tmp', '--files-from', 'tmp/list.txt'],
        root,
      );
    } finally {
      console.log = log;
    }

    assert.deepEqual(
      JSON.parse(readFileSync(join(root, 'tmp/_unused.tmp.json'), 'utf8')),
      {
        issues: [{ file: 'src/a.ts' }, { file: 'src/b.ts' }],
        filesOutsideReview: 1,
      },
    );
  });

  /**
   * Runs one JSON tool through the prepass and reads back what it landed.
   *
   * @param command - The tool's shell command
   * @returns The tool's sentinel entry and its report text
   */
  async function runJson(command) {
    const root = makeRepo();
    const config = resolve({
      prepass: {
        tools: [
          { key: 'js', label: 'JS', command, json: true, errorExitCodes: [2] },
        ],
      },
    });
    const status = await runTools(root, config, { scratch: 'tmp', files: [] });

    return {
      entry: status.js,
      report: readFileSync(join(root, 'tmp/_js.tmp.json'), 'utf8'),
    };
  }

  /**
   * Runs an appending tool and a plain one over one long-named file listed many times.
   *
   * @param count - How many times the file is listed
   * @returns The sentinel's contents and the appending tool's report
   */
  async function runMany(count) {
    const root = makeRepo();
    const file = `${'f'.repeat(200)}.ts`;
    write(root, file, 'x\n');
    const config = resolve({
      prepass: {
        tools: [
          {
            key: 'each',
            label: 'Each',
            command: "printf '%s\\n'",
            appendFiles: true,
          },
          { key: 'plain', label: 'Plain', command: 'echo plain' },
        ],
      },
    });
    const status = await runTools(root, config, {
      scratch: 'tmp',
      files: Array(count).fill(file),
    });

    return {
      status,
      report: readFileSync(join(root, 'tmp/_each.tmp.txt'), 'utf8'),
    };
  }

  test('an appending tool gets every file when together they pass one argument’s limit', async () => {
    // About 200 KB of paths, over Linux's 128 KiB limit on any one argument.
    const { status, report } = await runMany(1000);

    assert.equal(status.each.status, 'ok');
    assert.equal(report.split('\n').filter(Boolean).length, 1000);
  });

  test('a file list past the system’s argument limit fails that tool alone, and the sentinel lands', async () => {
    // About 8 MB of paths, over the whole-command limit on macOS and Linux.
    const { status, report } = await runMany(40000);

    assert.equal(status.each.status, 'failed');
    assert.match(report, /E2BIG/);
    assert.equal(status.plain.status, 'ok');
  });

  test('a JSON tool’s report is its stdout, with stderr kept in the sentinel', async () => {
    const { entry, report } = await runJson(
      `echo 'knip reported errors: {"issues":[]} and {x}' >&2; echo '{"findings":[1]}'; exit 1`,
    );

    assert.equal(report, '{"findings":[1]}\n');
    assert.deepEqual(entry, {
      status: 'ok',
      exitCode: 1,
      stderr: 'knip reported errors: {"issues":[]} and {x}',
    });
  });

  test('a JSON tool failing with a JSON report keeps the JSON as its report', async () => {
    const { entry, report } = await runJson(
      `echo '{"findings":[],"errors":["plugin failed"]}'; echo 'knip reported errors' >&2; exit 2`,
    );

    assert.equal(entry.status, 'failed');
    assert.equal(entry.exitCode, 2);
    assert.deepEqual(JSON.parse(report).errors, ['plugin failed']);
  });

  test('a JSON tool exiting non-zero with no JSON is failed, its output kept', async () => {
    const { entry, report } = await runJson('echo "it broke"; exit 1');

    assert.deepEqual(entry, { status: 'failed', exitCode: 1 });
    assert.match(report, /it broke/);
  });

  test('npx failing to find a package it may not install is failed', async () => {
    for (const noise of [
      'npm error code E404\nnpm error 404 Not Found - GET https://registry.npmjs.org/dead-code',
      'npm error could not determine executable to run',
      'npm error npx canceled due to missing packages and no YES option: ["x@1"]',
    ]) {
      const { entry, report } = await runOne(
        `printf '%s\\n' '${noise.replace(/\n/g, "' '")}' >&2; exit 1`,
      );

      assert.deepEqual(entry, { status: 'failed', exitCode: 1 }, noise);
      assert.match(report, /npm error/);
    }
  });

  test('keepFilesUnderReview trims a knip report to the files under review', () => {
    const report = JSON.stringify({
      issues: [
        { file: 'src/a.ts', exports: [{ name: 'x' }] },
        { file: 'src/b.ts', exports: [{ name: 'y' }] },
      ],
      files: ['src/a.ts', 'src/c.ts'],
    });

    assert.deepEqual(JSON.parse(keepFilesUnderReview(report, ['src/a.ts'])), {
      issues: [{ file: 'src/a.ts', exports: [{ name: 'x' }] }],
      files: ['src/a.ts'],
      filesOutsideReview: 2,
    });
  });

  test('keepFilesUnderReview leaves output that is not JSON alone', () => {
    assert.equal(keepFilesUnderReview('knip crashed', ['a']), 'knip crashed');
  });

  const hasRipgrep = (() => {
    try {
      execFileSync('rg', ['--version'], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  })();

  test('graph lists callers and orphans', { skip: !hasRipgrep }, async () => {
    const root = makeRepo();
    write(
      root,
      'src/a.ts',
      'export function usedThing() {}\nexport const lonelyThing = 1;\n',
    );
    write(root, 'src/b.ts', "import { usedThing } from './a';\nusedThing();\n");

    const graph = await buildImportGraph(root, resolve({}), ['src/a.ts']);

    assert.match(
      graph,
      /### `usedThing` — defined at src\/a\.ts:1\n\n- src\/b\.ts:1,2/,
    );
    assert.match(graph, /- `lonelyThing` — src\/a\.ts:2/);
  });

  test(
    'graph finds callers of a name holding a $',
    { skip: !hasRipgrep },
    async () => {
      const root = makeRepo();
      write(root, 'src/a.ts', 'export const $store = 1;\n');
      write(root, 'src/b.ts', "import { $store } from './a';\nx.$store;\n");

      const graph = await buildImportGraph(root, resolve({}), ['src/a.ts']);

      assert.match(
        graph,
        /### `\$store` — defined at src\/a\.ts:1\n\n- src\/b\.ts:1,2/,
      );
    },
  );

  test(
    'graph keeps the matches when ripgrep cannot read one file',
    { skip: !hasRipgrep || process.getuid?.() === 0 },
    async () => {
      const root = makeRepo();
      write(root, 'src/a.ts', 'export function usedThing() {}\n');
      write(root, 'src/b.ts', 'usedThing();\n');
      write(root, 'src/c.ts', 'usedThing();\n');
      chmodSync(join(root, 'src/c.ts'), 0o000);

      const graph = await buildImportGraph(root, resolve({}), ['src/a.ts']);

      assert.match(graph, /- src\/b\.ts:1/);
      assert.doesNotMatch(graph, /unavailable/);
    },
  );
});
