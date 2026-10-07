// ============================================================================
// PR Prepass Tests
// ============================================================================
//
// The facts `skills pr prepass` gathers: the base, the diff, layers and
// sections, tests beside each file, importers, stories and seed files.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { resolvePrConfig } from '../src/pr/config.mjs';
import {
  classifyFiles,
  findImporters,
  findStories,
  globToRegExp,
  importOnlyFiles,
  parseNameStatus,
  triageHints,
  prPrepass,
  renderFacts,
  ripgrep,
  testsBeside,
} from '../src/pr/prepass.mjs';
import { makeRepo, write } from './repo.mjs';

const hasRg = (() => {
  try {
    execFileSync('rg', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const LAYERS = [
  {
    key: 'db',
    title: 'Data Model',
    paths: ['migrations/'],
    section: 'backend',
  },
  { key: 'api', title: 'API', paths: [/^src\/api\//], section: 'backend' },
  {
    key: 'ui',
    title: 'UI',
    paths: [/^src\/ui\//, 'src/shared/'],
    section: 'frontend',
  },
  {
    key: 'shared',
    title: 'Shared',
    paths: ['src/shared/'],
    section: 'backend',
  },
];

const CONFIG = resolvePrConfig(
  {
    layers: LAYERS,
    sections: { frontend: { title: 'Human Frontend Checks' } },
    boot: { read: ['seed/*.sql', '.env.example'] },
    storybook: true,
  },
  { skillsDir: '.claude/skills', source: 'test' },
);

const git = (root, ...args) =>
  execFileSync('git', args, { cwd: root, stdio: 'pipe' }).toString();

/**
 * Makes a git repository with a `main` commit and a feature branch changing it.
 *
 * @returns The root, with the feature branch checked out
 */
function branchRepo() {
  const root = makeRepo();
  rmSync(join(root, '.git'), { recursive: true });
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 't@t');
  git(root, 'config', 'user.name', 't');

  write(root, 'src/api/users.ts', 'export const users = 1;\n');
  write(
    root,
    'src/api/__tests__/users.test.ts',
    "import { users } from '../users';\n",
  );
  write(root, 'src/ui/Badge.tsx', 'export const Badge = 1;\n');
  write(
    root,
    'src/ui/Badge.stories.tsx',
    "export default { title: 'Components/Badge' };\n",
  );
  write(root, 'src/ui/Page.tsx', "import { Badge } from './Badge';\n");
  write(root, 'src/old.ts', 'export const old = 1;\n');
  write(root, 'seed/01-users.sql', 'insert into users values (1);\n');
  write(root, '.env.example', 'PORT=3000\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'base');

  git(root, 'checkout', '-q', '-b', 'feature/badge');
  write(root, 'src/api/users.ts', 'export const users = 2;\n');
  write(root, 'src/ui/Badge.tsx', 'export const Badge = 2;\n');
  write(
    root,
    'migrations/002_add.sql',
    'alter table users add column x int;\n',
  );
  write(root, 'README.md', '# Readme\n');
  rmSync(join(root, 'src/old.ts'));
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'change');

  return root;
}

describe('pr prepass — pure helpers', () => {
  it('sorts files into layers, marking every section a file touches', () => {
    const result = classifyFiles(
      ['migrations/1.sql', 'src/shared/types.ts', 'README.md'],
      LAYERS,
    );

    assert.deepEqual(result.layers, {
      db: ['migrations/1.sql'],
      api: [],
      ui: ['src/shared/types.ts'],
      shared: ['src/shared/types.ts'],
    });
    assert.deepEqual(result.sections, { backend: true, frontend: true });
    assert.deepEqual(result.unmatched, ['README.md']);
  });

  it('reports an untouched section as false', () => {
    const result = classifyFiles(['migrations/1.sql'], LAYERS);
    assert.deepEqual(result.sections, { backend: true, frontend: false });
  });

  it('finds the tests beside each changed file', () => {
    const tracked = [
      'src/a/users.ts',
      'src/a/users.test.ts',
      'src/a/__tests__/users.int.test.ts',
      'src/a/__tests__/deep/users.test.ts',
      'src/b/users.test.ts',
      'src/a/other.test.ts',
    ];
    const result = testsBeside(
      ['src/a/users.ts', 'src/a/other.test.ts', 'src/a/none.ts'],
      tracked,
      CONFIG.tests,
    );

    assert.deepEqual(result, [
      {
        file: 'src/a/users.ts',
        tests: [
          'src/a/users.test.ts',
          'src/a/__tests__/users.int.test.ts',
          'src/a/__tests__/deep/users.test.ts',
        ],
      },
      { file: 'src/a/other.test.ts', tests: ['src/a/other.test.ts'] },
      { file: 'src/a/none.ts', tests: [] },
    ]);
  });

  it('turns globs into path regexes', () => {
    assert.ok(globToRegExp('seed/*.sql').test('seed/1.sql'));
    assert.ok(!globToRegExp('seed/*.sql').test('seed/a/1.sql'));
    assert.ok(globToRegExp('seed/**').test('seed/a/b.sql'));
    assert.ok(globToRegExp('**/seed.ts').test('seed.ts'));
    assert.ok(globToRegExp('**/seed.ts').test('a/b/seed.ts'));
    assert.ok(globToRegExp('supabase/seed*').test('supabase/seed.sql'));
    assert.ok(globToRegExp('a?.ts').test('ab.ts'));
    assert.ok(!globToRegExp('.env.example').test('xenvxexample'));
  });

  it('finds a component’s stories and reads their titles', () => {
    const root = makeRepo();
    write(
      root,
      'src/Badge.stories.tsx',
      "export default { title: 'UI/Badge' };\n",
    );
    write(root, 'src/Card.stories.tsx', 'export default {};\n');

    const stories = findStories(
      root,
      ['src/Badge.tsx', 'src/Card.stories.tsx', 'src/Other.tsx'],
      ['src/Badge.stories.tsx', 'src/Card.stories.tsx', 'src/Badge.tsx'],
    );

    assert.deepEqual(stories, [
      {
        storyFile: 'src/Badge.stories.tsx',
        component: 'src/Badge.tsx',
        title: 'UI/Badge',
      },
      {
        storyFile: 'src/Card.stories.tsx',
        component: 'src/Card.stories.tsx',
        title: null,
      },
    ]);
  });

  it('finds a story that imports a changed file, wherever it sits', () => {
    const root = makeRepo();
    write(
      root,
      'app/login/login.stories.tsx',
      "export default { title: 'Routes/Login' };\n",
    );
    write(root, 'src/_stories/Card.stories.tsx', 'export default {};\n');
    write(root, 'src/Card.stories.tsx', 'export default {};\n');
    const tracked = [
      'app/login/login.stories.tsx',
      'src/_stories/Card.stories.tsx',
      'src/Card.stories.tsx',
    ];
    // The first importer is past the listed ones, so the full list is what counts.
    const importers = {
      'app/login/page.tsx': {
        importers: [],
        more: 1,
        all: ['app/login/login.stories.tsx', 'app/login/layout.tsx'],
      },
      'src/Card.tsx': {
        importers: ['src/_stories/Card.stories.tsx'],
        more: 0,
        all: ['src/_stories/Card.stories.tsx'],
      },
    };
    const changed = ['app/login/page.tsx', 'src/Card.tsx'];
    const files = (match) =>
      findStories(root, changed, tracked, { importers, match }).map(
        (story) => `${story.storyFile} ← ${story.component}`,
      );

    assert.deepEqual(files('both'), [
      'app/login/login.stories.tsx ← app/login/page.tsx',
      'src/Card.stories.tsx ← src/Card.tsx',
      'src/_stories/Card.stories.tsx ← src/Card.tsx',
    ]);
    assert.deepEqual(files('stem'), ['src/Card.stories.tsx ← src/Card.tsx']);
    assert.deepEqual(files('imports'), [
      'app/login/login.stories.tsx ← app/login/page.tsx',
      'src/_stories/Card.stories.tsx ← src/Card.tsx',
    ]);
    assert.deepEqual(
      findStories(root, changed, tracked, { importers: null }).length,
      1,
      'without ripgrep only the name match is left',
    );
  });

  it('finds every importer in one ripgrep pass, capped, and says when ripgrep is missing', () => {
    const many = Array.from(
      { length: 35 },
      (_, i) =>
        `./src/f${String(i).padStart(2, '0')}.ts\0import { Badge } from './ui/Badge'`,
    );
    const searches = [];
    const rg = (args) => {
      searches.push(args);
      return [
        ...many,
        "./src/ui/Badge.tsx\0import { x } from './Badge'",
        "./src/ui/Page.tsx\0from './Badge.js'",
        "./src/ui/Page.tsx\0from './util'",
      ].join('\n');
    };
    const result = findImporters(
      '/',
      ['src/ui/Badge.tsx', 'src/ui/util.ts'],
      rg,
    );

    assert.equal(searches.length, 1);
    assert.match(searches[0].join(' '), /\\b\(Badge\|util\)/);
    assert.equal(result['src/ui/Badge.tsx'].importers.length, 30);
    assert.equal(result['src/ui/Badge.tsx'].more, 6);
    assert.ok(
      !result['src/ui/Badge.tsx'].importers.includes('src/ui/Badge.tsx'),
    );
    assert.deepEqual(result['src/ui/util.ts'], {
      importers: ['src/ui/Page.tsx'],
      more: 0,
      all: ['src/ui/Page.tsx'],
    });
    assert.equal(result['src/ui/Badge.tsx'].all.length, 36);

    assert.equal(
      findImporters('/', ['src/a.ts'], () => null),
      null,
    );
    assert.deepEqual(findImporters('/', [], rg), {});
    assert.equal(searches.length, 1, 'no search with nothing to look for');
  });

  it('counts an import only when its path leads to the changed file', () => {
    const rg = () =>
      [
        // Relative imports resolve against the importing file.
        "./src/a/x.ts\0from './utils'",
        "./src/b/y.ts\0from './utils'",
        "./src/b/z.ts\0from '../a/utils.js'",
        // Aliased or package imports must end in the file's own path.
        "./src/c/w.ts\0from '@/a/utils'",
        "./src/c/v.ts\0from '@/b/utils'",
        "./src/c/u.ts\0require('lodash/utils')",
        // An index file is imported by its folder.
        "./src/c/t.ts\0import('../ui/badge')",
        "./src/c/s.ts\0from '../other/badge'",
        "./src/c/r.ts\0from '@/ui/badge/index'",
      ].join('\n');
    const result = findImporters(
      '/',
      ['src/a/utils.ts', 'src/ui/badge/index.ts'],
      rg,
    );

    assert.deepEqual(result['src/a/utils.ts'].importers, [
      'src/a/x.ts',
      'src/b/z.ts',
      'src/c/w.ts',
    ]);
    assert.deepEqual(result['src/ui/badge/index.ts'].importers, [
      'src/c/r.ts',
      'src/c/t.ts',
    ]);
  });

  it('writes the facts a model would otherwise rediscover', () => {
    const text = renderFacts({
      branch: 'feature/x',
      base: 'main',
      touched: classifyFiles(['src/api/a.ts', 'notes.txt'], LAYERS),
      deleted: ['src/gone.ts'],
      tests: [
        { file: 'src/api/a.ts', tests: ['src/api/a.test.ts'] },
        { file: 'notes.txt', tests: [] },
      ],
      importers: { 'src/api/a.ts': { importers: ['src/b.ts'], more: 2 } },
      stories: [{ storyFile: 's.stories.tsx', component: 's.tsx', title: 'S' }],
      readFiles: ['seed/1.sql'],
      layers: LAYERS,
    });

    assert.match(text, /^# PR QA facts — `feature\/x` against `main`/);
    assert.match(text, /### API \(backend section\)\n\n- `src\/api\/a\.ts`/);
    assert.doesNotMatch(text, /### Data Model/);
    assert.match(text, /## Changed files in no layer\n\n- `notes\.txt`/);
    assert.match(text, /## Deleted files\n\n- `src\/gone\.ts`/);
    assert.match(text, /- `src\/api\/a\.ts` → `src\/api\/a\.test\.ts`/);
    assert.match(text, /- `notes\.txt` → no test beside it/);
    assert.match(text, /- `src\/api\/a\.ts` ← `src\/b\.ts` and 2 more/);
    assert.match(text, /- `s\.stories\.tsx` — title `S` — for `s\.tsx`/);
    assert.match(
      text,
      /## Seed, fixture and env files to read\n\n- `seed\/1\.sql`/,
    );

    const noRg = renderFacts({
      branch: 'b',
      base: 'main',
      touched: classifyFiles([], LAYERS),
      deleted: [],
      tests: [],
      importers: null,
      stories: [],
      readFiles: [],
      layers: LAYERS,
    });
    assert.match(noRg, /ripgrep \(`rg`\) is not installed/);
    assert.match(noRg, /## Moved files\n\n- \(none\)/);
    assert.doesNotMatch(noRg, /## Stories/);
  });
});

describe('pr prepass — name status', () => {
  it('keeps a moved file apart from a deleted one', () => {
    const stdout = [
      'R087',
      'src/api/users.ts',
      'src/legacy/users.ts',
      'C100',
      'src/a.ts',
      'src/b.ts',
      'D',
      'src/gone.ts',
      'M',
      'src/ui/Pré.tsx',
      'A',
      'src/new.ts',
      '',
    ].join('\0');

    assert.deepEqual(parseNameStatus(stdout), {
      changed: [
        'src/legacy/users.ts',
        'src/b.ts',
        'src/ui/Pré.tsx',
        'src/new.ts',
      ],
      added: ['src/new.ts'],
      deleted: ['src/gone.ts'],
      moved: [
        { from: 'src/api/users.ts', to: 'src/legacy/users.ts', similarity: 87 },
      ],
    });
  });
});

describe('pr prepass — triage hints', () => {
  const layers = [
    { key: 'db', section: 'backend', touches: ['database'] },
    { key: 'api', section: 'backend', touches: ['api', 'database'] },
    { key: 'ui', section: 'frontend', touches: ['page'] },
    { key: 'misc', section: 'backend', touches: null },
  ];
  const touched = (keys) => ({
    layers: Object.fromEntries(
      layers.map((l) => [l.key, keys.includes(l.key) ? ['x'] : []]),
    ),
  });
  const hints = (extra) =>
    triageHints({
      touched: touched([]),
      layers,
      questions: [],
      files: [],
      added: [],
      deleted: [],
      moved: [],
      importOnly: new Set(),
      ...extra,
    });

  it('unions what the touched layers need, and gives an untagged one its section’s needs', () => {
    assert.deepEqual(hints({ touched: touched(['ui']) }).touches, ['page']);
    assert.deepEqual(hints({ touched: touched(['db', 'ui']) }).touches, [
      'database',
      'page',
    ]);
    // An untagged backend layer needs the database and the API, never a page.
    assert.deepEqual(hints({ touched: touched(['misc']) }).touches, [
      'database',
      'api',
    ]);
    assert.deepEqual(
      triageHints({
        touched: { layers: { web: ['x'] } },
        layers: [{ key: 'web', section: 'frontend', touches: null }],
        questions: [],
        files: [],
        added: [],
        deleted: [],
        moved: [],
        importOnly: new Set(),
      }).touches,
      ['page'],
    );
  });

  it('calls a diff of tests and files in no layer a tooling candidate', () => {
    const tests = [/\.test\.ts$/];
    const layered = {
      ...touched([]),
      layers: { ...touched([]).layers, api: ['src/a.ts', 'src/a.test.ts'] },
    };

    assert.equal(
      hints({ touched: layered, files: ['src/a.test.ts', 'README.md'], tests })
        .toolingCandidate,
      true,
    );
    assert.equal(
      hints({ touched: layered, files: ['src/a.ts', 'src/a.test.ts'], tests })
        .toolingCandidate,
      false,
    );
  });

  it('calls a diff of near-identical moves and import rewiring a pure move candidate', () => {
    const moved = [{ from: 'a/x.ts', to: 'b/x.ts', similarity: 96 }];
    const files = ['b/x.ts', 'a/y.ts', 'a/x.ts'];

    assert.equal(
      hints({ moved, files, importOnly: new Set(['a/y.ts']) })
        .pureMoveCandidate,
      true,
    );
    assert.equal(hints({ moved, files }).pureMoveCandidate, false);
    assert.equal(
      hints({
        moved: [{ ...moved[0], similarity: 60 }],
        files,
        importOnly: new Set(['a/y.ts']),
      }).pureMoveCandidate,
      false,
    );
    assert.equal(
      hints({
        moved,
        files,
        importOnly: new Set(['a/y.ts']),
        added: ['c.ts'],
      }).pureMoveCandidate,
      false,
    );
    assert.equal(
      hints({ files: ['a/y.ts'], importOnly: new Set(['a/y.ts']) })
        .pureMoveCandidate,
      false,
    );
  });

  it('answers an outside-the-repo question yes when a changed path matches it', () => {
    const questions = [
      { ask: 'Hosting config?', paths: [/(^|\/)vercel\.json$/] },
      { ask: 'New env var?', paths: ['lib/env/'] },
      { ask: 'New service?', paths: [] },
    ];

    assert.deepEqual(
      hints({ questions, files: ['apps/web/vercel.json', 'src/a.ts'] })
        .outsideRepo,
      [{ ask: 'Hosting config?', files: ['apps/web/vercel.json'] }],
    );
    assert.deepEqual(
      hints({ questions, files: ['lib/env/manifest.ts'] }).outsideRepo,
      [{ ask: 'New env var?', files: ['lib/env/manifest.ts'] }],
    );
  });

  it('finds the files whose changed lines only rewire imports', () => {
    const diff = [
      'diff --git a/src/a.ts b/src/a.ts',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1 +1 @@',
      "-import { x } from './old/x';",
      "+import { x } from './new/x';",
      'diff --git a/src/b.ts b/src/b.ts',
      '--- a/src/b.ts',
      '+++ b/src/b.ts',
      '@@ -1,3 +1,4 @@',
      '-import {',
      '+import {',
      '   x,',
      "-} from './old/x';",
      "+} from './new/x';",
      "+export { y } from './new/y';",
      'diff --git a/src/c.ts b/src/c.ts',
      '--- a/src/c.ts',
      '+++ b/src/c.ts',
      '@@ -1 +1 @@',
      '-const x = 1;',
      '+const x = 2;',
      'diff --git a/src/list.ts b/src/list.ts',
      '--- a/src/list.ts',
      '+++ b/src/list.ts',
      '@@ -4,5 +4,5 @@ import {',
      '   a,',
      '   b,',
      '-  c,',
      '+  d,',
      '   e,',
      " } from './x';",
      'diff --git a/src/old.ts b/src/new.ts',
      'similarity index 100%',
      'rename from src/old.ts',
      'rename to src/new.ts',
    ].join('\n');

    assert.deepEqual(
      [...importOnlyFiles(diff)],
      ['src/a.ts', 'src/b.ts', 'src/list.ts', 'src/new.ts'],
    );
  });

  it('never takes a behaviour edit, a comment line or a binary file for import rewiring', () => {
    const diff = [
      'diff --git a/db/x.sql b/db/x.sql',
      '--- a/db/x.sql',
      '+++ b/db/x.sql',
      '@@ -1,2 +1 @@',
      '--- drop the seats cap',
      ' select 1;',
      'diff --git a/src/loop.ts b/src/loop.ts',
      '--- a/src/loop.ts',
      '+++ b/src/loop.ts',
      '@@ -1,3 +1,3 @@',
      '   if (done) {',
      '-    return',
      '+    continue',
      '   }',
      'diff --git a/src/flags.ts b/src/flags.ts',
      '--- a/src/flags.ts',
      '+++ b/src/flags.ts',
      '@@ -1,3 +1,3 @@',
      ' const flags = [',
      '-  false,',
      '+  true,',
      ' ];',
      'diff --git a/src/meta.ts b/src/meta.ts',
      '--- a/src/meta.ts',
      '+++ b/src/meta.ts',
      '@@ -1 +1 @@',
      '-import.meta.env.OLD;',
      '+import.meta.env.NEW;',
      'diff --git a/public/logo.png b/public/logo.png',
      'index 1111111..2222222 100644',
      'Binary files a/public/logo.png and b/public/logo.png differ',
    ].join('\n');

    assert.deepEqual([...importOnlyFiles(diff)], []);
  });
});

describe('pr prepass — against a real branch', () => {
  it(
    'writes the diff, patches and facts, and prints the workflow args',
    { skip: !hasRg && 'ripgrep is not installed' },
    async () => {
      const root = branchRepo();
      const args = await prPrepass(root, CONFIG, {
        scratch: 'tmp/scratch',
        baseBranch: 'main',
      });

      assert.equal(args.branch, 'feature/badge');
      assert.equal(args.base, 'main');
      assert.equal(args.ahead, 1);
      assert.equal(args.headSha, git(root, 'rev-parse', 'HEAD').trim());
      assert.deepEqual(args.layers, {
        db: true,
        api: true,
        ui: true,
        shared: false,
      });
      assert.deepEqual(args.sections, { backend: true, frontend: true });
      assert.equal(args.storyCount, 1);
      assert.equal(args.largeDiff, false);
      assert.equal(args.scratchDir, join(root, 'tmp/scratch'));
      assert.ok(args.agentCap >= 4 && args.agentCap <= 16);
      assert.match(args.diffStat, /src\/ui\/Badge\.tsx/);

      const diff = readFileSync(args.diffPath, 'utf8');
      assert.match(diff, /\+export const Badge = 2;/);
      assert.match(diff, /deleted file mode/);
      assert.equal(
        readdirSync(args.patchDir, { recursive: true }).filter((entry) =>
          entry.endsWith('.patch'),
        ).length,
        5,
      );

      const facts = readFileSync(args.factsPath, 'utf8');
      assert.match(
        facts,
        /- `src\/api\/users\.ts` → `src\/api\/__tests__\/users\.test\.ts`/,
      );
      assert.match(facts, /- `src\/ui\/Badge\.tsx` ← `src\/ui\/Page\.tsx`/);
      assert.match(
        facts,
        /`src\/ui\/Badge\.stories\.tsx` — title `Components\/Badge`/,
      );
      assert.match(facts, /## Deleted files\n\n- `src\/old\.ts`/);
      assert.match(facts, /## Changed files in no layer\n\n- `README\.md`/);
      assert.match(facts, /- `\.env\.example`\n- `seed\/01-users\.sql`/);
    },
  );

  it('reports a branch with nothing ahead of its base', async () => {
    const root = branchRepo();
    git(root, 'checkout', '-q', 'main');
    git(root, 'checkout', '-q', '-b', 'empty');

    const args = await prPrepass(root, CONFIG, {
      scratch: 'tmp/s',
      baseBranch: 'main',
    });
    assert.deepEqual(args, {
      ahead: 0,
      base: 'main',
      baseSource: 'default branch',
      branch: 'empty',
    });
    assert.ok(!existsSync(join(root, 'tmp/s')));
  });

  it('takes the base from the stack, and from an override', async () => {
    const root = branchRepo();
    git(root, 'checkout', '-q', '-b', 'feature/next');
    write(root, 'src/api/more.ts', 'export const more = 1;\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'more');

    const run = (command, args, cwd) =>
      command === 'gh'
        ? JSON.stringify({
            branches: [{ name: 'feature/badge' }, { name: 'feature/next' }],
          })
        : execFileSync(command, args, { cwd, encoding: 'utf8' });
    const rg = () => '';

    const fromStack = await prPrepass(root, CONFIG, {
      scratch: 't1',
      baseBranch: 'main',
      run,
      rg,
    });
    assert.equal(fromStack.base, 'feature/badge');
    assert.equal(fromStack.baseSource, 'gh stack');
    assert.equal(fromStack.ahead, 1);
    assert.deepEqual(fromStack.sections, { backend: true, frontend: false });

    const overridden = await prPrepass(root, CONFIG, {
      scratch: 't2',
      baseBranch: 'main',
      base: 'main',
      run,
      rg,
    });
    assert.equal(overridden.base, 'main');
    assert.equal(overridden.baseSource, 'given');
    assert.equal(overridden.ahead, 2);
  });

  it('diffs a stacked branch against the parent it was created from', async () => {
    const root = branchRepo();
    git(root, 'branch', 'feature/next', 'feature/badge');
    git(root, 'checkout', '-q', 'feature/next');
    write(root, 'src/api/more.ts', 'export const more = 1;\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'more');

    const args = await prPrepass(root, CONFIG, {
      scratch: 't',
      baseBranch: 'main',
      rg: () => '',
    });

    assert.equal(args.base, 'feature/badge');
    assert.equal(args.baseSource, 'the branch reflog');
    assert.equal(args.ahead, 1);
    assert.doesNotMatch(readFileSync(args.diffPath, 'utf8'), /Badge = 2/);
    assert.match(
      readFileSync(args.factsPath, 'utf8'),
      /against `feature\/badge` \(the branch reflog\)/,
    );
  });

  it('fetches the base and diffs against origin over a stale local copy', async () => {
    const root = branchRepo();
    // The branch was cut from a newer origin/main than the local main.
    git(root, 'checkout', '-q', 'main');
    write(root, 'src/upstream.ts', 'export const up = 1;\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'upstream');
    git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    git(root, 'checkout', '-q', '-b', 'feature/fresh');
    write(root, 'src/api/fresh.ts', 'export const fresh = 1;\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'fresh');
    git(root, 'branch', '-f', 'main', 'HEAD~2');

    const commands = [];
    const run = (command, args, cwd) => {
      commands.push([command, ...args].join(' '));
      return execFileSync(command, args, {
        cwd,
        encoding: 'utf8',
        stdio: 'pipe',
      });
    };
    const args = await prPrepass(root, CONFIG, {
      scratch: 's',
      baseBranch: 'main',
      run,
      rg: () => '',
    });

    assert.ok(commands.includes('git fetch --quiet origin main'));
    assert.equal(args.ahead, 1);
    assert.doesNotMatch(readFileSync(args.diffPath, 'utf8'), /upstream/);
  });

  it('falls back to the remote base, then fails clearly', async () => {
    const root = branchRepo();
    git(root, 'update-ref', 'refs/remotes/origin/trunk', 'main');

    const args = await prPrepass(root, CONFIG, {
      scratch: 's',
      baseBranch: 'trunk',
      rg: () => '',
    });
    assert.equal(args.base, 'trunk');
    assert.equal(args.ahead, 1);

    await assert.rejects(
      prPrepass(root, CONFIG, {
        scratch: 's',
        baseBranch: 'nope',
        rg: () => '',
      }),
      /No nope branch, locally or as origin\/nope/,
    );
  });

  it(
    'counts a moved file at its old path, and reads non-ASCII paths unquoted',
    { skip: !hasRg && 'ripgrep is not installed' },
    async () => {
      const root = branchRepo();
      git(root, 'checkout', '-q', '-b', 'feature/move');
      git(root, 'config', 'diff.renames', 'false');
      mkdirSync(join(root, 'src/legacy'));
      git(root, 'mv', 'src/api/users.ts', 'src/legacy/users.ts');
      write(root, 'src/ui/Préférences.tsx', 'export const P = 1;\n');
      write(root, 'src/ui/Use.tsx', "import { P } from './Préférences';\n");
      git(root, 'add', '-A');
      git(root, 'commit', '-qm', 'move');

      const args = await prPrepass(root, CONFIG, {
        scratch: 's',
        baseBranch: 'feature/badge',
      });

      assert.equal(args.layers.api, true);
      assert.deepEqual(args.sections, { backend: true, frontend: true });
      const facts = readFileSync(args.factsPath, 'utf8');
      assert.match(
        facts,
        /### API \(backend section\)\n\n- `src\/api\/users\.ts` — moved to `src\/legacy\/users\.ts`/,
      );
      assert.match(facts, /## Deleted files\n\n- \(none\)/);
      assert.deepEqual(args.triage, {
        touches: ['database', 'api', 'page'],
        pureMoveCandidate: false,
        toolingCandidate: false,
        outsideRepo: [],
      });
      assert.match(
        facts,
        /## Triage hints\n\n- Needs running to test: database, api, page\n- Pure move candidate: no\n- Tooling candidate: no/,
      );
      assert.match(
        facts,
        /## Moved files\n\n- `src\/api\/users\.ts` → `src\/legacy\/users\.ts` \(100% similar\)/,
      );
      assert.match(facts, /- `src\/ui\/Préférences\.tsx`\n/);
      assert.match(
        facts,
        /- `src\/ui\/Préférences\.tsx` ← `src\/ui\/Use\.tsx`/,
      );
      assert.doesNotMatch(facts, /\\303/);
    },
  );

  it('writes a plain unified diff whatever the git config says', async () => {
    const root = branchRepo();
    git(root, 'config', 'color.ui', 'always');
    git(root, 'config', 'diff.noprefix', 'true');
    git(root, 'config', 'diff.external', 'echo EXTERNAL');

    const args = await prPrepass(root, CONFIG, {
      scratch: 's',
      baseBranch: 'main',
      rg: () => '',
    });

    const diff = readFileSync(args.diffPath, 'utf8');
    assert.match(diff, /^diff --git a\/\S+ b\//);
    assert.match(diff, /\+export const Badge = 2;/);
    assert.doesNotMatch(diff, /EXTERNAL|\u001b/);
    assert.match(args.diffStat, /src\/ui\/Badge\.tsx/);
    assert.doesNotMatch(args.diffStat, /\u001b/);
  });

  it('refuses a detached HEAD', async () => {
    const root = branchRepo();
    git(root, 'checkout', '-q', '--detach');
    await assert.rejects(
      prPrepass(root, CONFIG, { scratch: 's', baseBranch: 'main' }),
      /HEAD is detached/,
    );
  });
});

describe('pr prepass — edges', () => {
  it('reads no title from a story file it cannot open', () => {
    const stories = findStories(
      makeRepo(),
      ['src/Gone.tsx'],
      ['src/Gone.stories.tsx'],
    );
    assert.deepEqual(stories, [
      {
        storyFile: 'src/Gone.stories.tsx',
        component: 'src/Gone.tsx',
        title: null,
      },
    ]);
  });

  it(
    'treats no ripgrep match as empty and rethrows a real failure',
    { skip: !hasRg && 'ripgrep is not installed' },
    () => {
      const root = makeRepo();
      write(root, 'a.ts', 'hello\n');

      assert.equal(
        ripgrep(['--files-with-matches', '-e', 'absent', '.'], root),
        '',
      );
      assert.throws(() => ripgrep(['-e', '(unclosed', '.'], root));
    },
  );

  it(
    'keeps the matches ripgrep found when some paths are unreadable',
    {
      skip:
        (!hasRg && 'ripgrep is not installed') ||
        (process.getuid?.() === 0 && 'root reads every file'),
    },
    () => {
      const root = makeRepo();
      write(root, 'a.ts', 'hello\n');
      write(root, 'b.ts', 'hello\n');
      chmodSync(join(root, 'b.ts'), 0o000);

      try {
        const args = ['--no-messages', '-e'];
        assert.match(ripgrep([...args, 'hello', '.'], root), /a\.ts/);
        assert.equal(ripgrep([...args, 'absent', '.'], root), '');
        assert.throws(() => ripgrep([...args, '(unclosed', '.'], root));
      } finally {
        chmodSync(join(root, 'b.ts'), 0o644);
      }
    },
  );
});
