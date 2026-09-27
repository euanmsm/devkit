// ============================================================================
// Code Review Tests
// ============================================================================
//
// The review config, the generated workflow script and SKILL.md, and the
// prepass that feeds them.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import { check } from '../src/check.mjs';
import { resolveReviewConfig } from '../src/review/config.mjs';
import {
  buildImportGraph,
  extractJson,
  keepFilesUnderReview,
  runTools,
  splitPatches,
} from '../src/review/prepass.mjs';
import { toSource } from '../src/review/serialise.mjs';
import { plan, renderEngine, sync } from '../src/sync.mjs';
import curricular from './fixtures/review/curricular.mjs';
import sales from './fixtures/review/sales.mjs';
import { makeRepo, write } from './repo.mjs';
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

  test('keeps the repository’s lens order ahead of the built-ins', () => {
    const review = resolve({
      lenses: { events: { judges: 'E.', bundle: 'correctness' }, bugs: {} },
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
      { lenses: { x: { judges: 'X.' } } },
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
  ]) {
    test(`rejects ${what}`, () => {
      assert.throws(() => resolve(raw), message);
    });
  }

  test('adds the comment and knip checks when the tools are installed', () => {
    const keys = (installed, prepass) =>
      resolveReviewConfig(
        { prepass },
        {
          name: 'r',
          skillsDir: 's',
          source: 't',
          installed: new Set(installed),
        },
      ).prepass.tools.map((tool) => tool.key);

    assert.deepEqual(keys([]), ['tsc', 'lint']);
    assert.deepEqual(keys(['@euanmsm/terse', 'knip']), [
      'tsc',
      'lint',
      'comments',
      'knip',
    ]);
    assert.deepEqual(keys(['knip'], { knip: false }), ['tsc', 'lint']);
    assert.deepEqual(keys([], { comments: true }), ['tsc', 'lint', 'comments']);
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
    assert.equal(Object.keys(resolve(curricular).lenses).length, 30);
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
      'Curricular',
      curricular,
      [
        'apps/main/src/app/api/rooms/route.ts',
        'apps/main/src/lib/x/Card.tsx',
        'supabase/migrations/1.sql',
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
      '.claude/skills/code-review/SKILL.md',
      '.claude/skills/code-review/review.workflow.js',
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
      ['.claude/skills/code-review/review.workflow.js'],
    );
  });

  test('removes the whole generated skill folder when switched off', async () => {
    const root = reviewRepo({ githubReview: true });
    await sync(root);

    writeFileSync(
      join(root, '.devkit/skills.json'),
      JSON.stringify({ skills: {} }),
    );
    await sync(root);

    assert.equal(existsSync(join(root, '.claude/skills/code-review')), false);
    assert.equal(existsSync(join(root, '.claude/rules/pr-reviews.md')), false);
  });
});

describe('prepass', () => {
  const git = (root, ...args) =>
    execFileSync('git', args, { cwd: root, stdio: 'pipe' }).toString();

  test('split writes one patch per changed file', async () => {
    const root = makeRepo();
    execFileSync('rm', ['-r', join(root, '.git')]);
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 't@t');
    git(root, 'config', 'user.name', 't');
    write(root, 'a.ts', 'one\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'base');
    write(root, 'a.ts', 'two\n');
    write(root, 'src/b c.ts', 'new\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'change');

    const summary = await splitPatches(root, {
      base: 'HEAD~1',
      target: 'HEAD',
      out: 'tmp/patch',
    });

    assert.equal(summary.files, 2);
    assert.equal(summary.largeDiff, false);
    assert.ok(existsSync(join(root, 'tmp/patch/a.ts.patch')));
    assert.ok(existsSync(join(root, 'tmp/patch/src_b c.ts.patch')));
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
      lint: 'ok',
      deps: 'ok',
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

  test('extractJson leaves output with no JSON in it alone', () => {
    assert.equal(extractJson('no json here'), 'no json here');
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
});
