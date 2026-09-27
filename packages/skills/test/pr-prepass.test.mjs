// ============================================================================
// PR Prepass Tests
// ============================================================================
//
// The facts `skills pr prepass` gathers: the base, the diff, layers and
// sections, tests beside each file, importers, stories and seed files.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { resolvePrConfig } from '../src/pr/config.mjs';
import {
  classifyFiles,
  findImporters,
  findStories,
  globToRegExp,
  prPrepass,
  renderFacts,
  ripgrep,
  stackParent,
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

  it('finds the parent branch in a gh stack', () => {
    const run = (stack) => () => JSON.stringify(stack);

    assert.equal(
      stackParent(run({ branches: [{ name: 'a' }, { name: 'b' }] }), '/', 'b'),
      'a',
    );
    assert.equal(
      stackParent(
        run([{ branch: 'a' }, { branch: 'b' }, { branch: 'c' }]),
        '/',
        'c',
      ),
      'b',
    );
    assert.equal(stackParent(run(['a', 'b']), '/', 'b'), 'a');
    assert.equal(
      stackParent(run({ branches: [{ name: 'a' }] }), '/', 'a'),
      null,
    );
    assert.equal(
      stackParent(run({ branches: [{ name: 'a' }] }), '/', 'z'),
      null,
    );
    assert.equal(
      stackParent(
        () => {
          throw new Error('not in a stack');
        },
        '/',
        'a',
      ),
      null,
    );
    assert.equal(
      stackParent(() => 'not json', '/', 'a'),
      null,
    );
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

  it('lists importers from ripgrep, capped, and says when ripgrep is missing', () => {
    const many = Array.from(
      { length: 35 },
      (_, i) => `./src/f${String(i).padStart(2, '0')}.ts`,
    );
    const rg = (args) => {
      assert.match(args[3], /\\bBadge/);
      return [...many, './src/ui/Badge.tsx'].join('\n');
    };
    const result = findImporters('/', ['src/ui/Badge.tsx'], rg);

    assert.equal(result['src/ui/Badge.tsx'].importers.length, 30);
    assert.equal(result['src/ui/Badge.tsx'].more, 5);
    assert.ok(
      !result['src/ui/Badge.tsx'].importers.includes('src/ui/Badge.tsx'),
    );

    assert.equal(
      findImporters('/', ['src/a.ts'], () => null),
      null,
    );
  });

  it('searches an index file by its folder name', () => {
    let searched;
    findImporters('/', ['src/ui/badge/index.ts'], (args) => {
      searched = args[3];
      return '';
    });
    assert.match(searched, /\\bbadge/);
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
    assert.doesNotMatch(noRg, /## Stories/);
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
      assert.equal(readdirSync(args.patchDir).length, 5);

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
    assert.deepEqual(args, { ahead: 0, base: 'main', branch: 'empty' });
    assert.ok(!existsSync(join(root, 'tmp/s')));
  });

  it('takes the base from the stack, and from an override', async () => {
    const root = branchRepo();
    git(root, 'checkout', '-q', '-b', 'feature/next');
    write(root, 'src/api/more.ts', 'export const more = 1;\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'more');

    const stacked = { ...CONFIG, base: 'stack' };
    const run = (command, args, cwd) =>
      command === 'gh'
        ? JSON.stringify({
            branches: [{ name: 'feature/badge' }, { name: 'feature/next' }],
          })
        : execFileSync(command, args, { cwd, encoding: 'utf8' });
    const rg = () => '';

    const fromStack = await prPrepass(root, stacked, {
      scratch: 't1',
      baseBranch: 'main',
      run,
      rg,
    });
    assert.equal(fromStack.base, 'feature/badge');
    assert.deepEqual(fromStack.sections, { backend: true, frontend: false });

    const overridden = await prPrepass(root, stacked, {
      scratch: 't2',
      baseBranch: 'main',
      base: 'main',
      run,
      rg,
    });
    assert.equal(overridden.base, 'main');
    assert.equal(overridden.ahead, 2);
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
      /The base branch "nope" does not exist locally or on origin/,
    );
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
});
