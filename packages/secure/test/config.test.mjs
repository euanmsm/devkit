// ============================================================================
// Config Integrity Check Tests
// ============================================================================

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../sh/config.sh', import.meta.url));
const BIN = fileURLToPath(new URL('../bin/secure-config.mjs', import.meta.url));

/** Builds a throwaway git repo holding the given files. */
function repo(files) {
  const root = mkdtempSync(join(tmpdir(), 'devkit-'));
  spawnSync('git', ['init', '-q'], { cwd: root });
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

/** Runs config.sh in a repo and returns its exit code and output. */
function check(root, env = {}) {
  const result = spawnSync('bash', [SCRIPT], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return { status: result.status, output: result.stdout + result.stderr };
}

describe('Check A: config file patterns', () => {
  test('skips a config file inside a gitignored directory', () => {
    const root = repo({
      '.gitignore': '.output/\n',
      '.output/app.config.mjs': 'eval(x);\n',
    });
    const { status, output } = check(root);

    assert.equal(status, 0, output);
  });

  test('reads a config file whose name looks like an awk assignment', () => {
    const root = repo({ 'a=b.config.js': `${'x'.repeat(300)}\n` });
    const { status, output } = check(root);

    assert.equal(status, 1);
    assert.match(output, /Lines exceeding 200 chars in \.\/a=b\.config\.js/);
  });

  test('fails a config file that is not ignored', () => {
    const root = repo({ 'app.config.mjs': 'eval(x);\n' });
    const { status, output } = check(root);

    assert.equal(status, 1);
    assert.match(output, /eval\(\) found in config files/);
  });
});

describe('Check B: required .gitignore patterns', () => {
  test('passes a pattern the .gitignore still ignores', () => {
    const root = repo({ '.gitignore': '*.pem\n.env.local\n' });
    const { status, output } = check(root, {
      DEVKIT_GITIGNORE_REQUIRED: '*.pem\n.env.local',
    });

    assert.equal(status, 0, output);
  });

  test('fails a pattern that a later negation un-ignores', () => {
    const root = repo({ '.gitignore': '.env\n!.env\n' });
    const { status, output } = check(root, {
      DEVKIT_GITIGNORE_REQUIRED: '.env',
    });

    assert.equal(status, 1);
    assert.match(output, /contains \.env but no longer ignores \.env/);
  });

  test('passes a pattern with a trailing space, which git drops', () => {
    const root = repo({ '.gitignore': 'foo \n' });
    const { status, output } = check(root, {
      DEVKIT_GITIGNORE_REQUIRED: 'foo ',
    });

    assert.equal(status, 0, output);
  });

  test('passes a .gitignore saved with CRLF line endings', () => {
    const root = repo({ '.gitignore': '.env.local\r\n' });
    const { status, output } = check(root, {
      DEVKIT_GITIGNORE_REQUIRED: '.env.local',
    });

    assert.equal(status, 0, output);
  });

  test('passes a .gitignore holding bytes that are not UTF-8', () => {
    const root = repo({
      '.gitignore': Buffer.from('.env.local\n\xe9t\xe9/\n', 'latin1'),
    });
    const { status, output } = check(root, {
      LANG: 'C.UTF-8',
      LC_ALL: 'C.UTF-8',
      DEVKIT_GITIGNORE_REQUIRED: '.env.local',
    });

    assert.equal(status, 0, output);
  });

  test('passes a glob when only one narrow name is negated', () => {
    const root = repo({ '.gitignore': '*.pem\n!x.pem\n' });
    const { status, output } = check(root, {
      DEVKIT_GITIGNORE_REQUIRED: '*.pem',
    });

    assert.equal(status, 0, output);
  });

  test('fails a pattern that a nested .gitignore negates', () => {
    const root = repo({
      '.gitignore': '.env.local\n',
      'x/.gitignore': '!.env.local\n',
    });
    const { status, output } = check(root, {
      DEVKIT_GITIGNORE_REQUIRED: '.env.local',
    });

    assert.equal(status, 1);
    assert.match(output, /no longer ignores x\/\.env\.local/);
  });

  test('ignores a nested negation that cannot reach an anchored pattern', () => {
    const root = repo({
      '.gitignore': '/secret\n',
      'x/.gitignore': '!secret\n',
    });
    const { status, output } = check(root, {
      DEVKIT_GITIGNORE_REQUIRED: '/secret',
    });

    assert.equal(status, 0, output);
  });

  test('ignores a nested .gitignore inside an ignored directory', () => {
    const root = repo({
      '.gitignore': '.env\nbuild/\n',
      'build/.gitignore': '!.env\n',
    });
    const { status, output } = check(root, {
      DEVKIT_GITIGNORE_REQUIRED: '.env',
    });

    assert.equal(status, 0, output);
  });
});

describe('Check C: staged obfuscation', () => {
  /** Stages one file in a fresh repo and runs the pre-commit checks. */
  function staged(content) {
    const root = repo({ 'a.js': content });
    spawnSync('git', ['add', 'a.js'], { cwd: root });
    return check(root, { PRE_COMMIT: '1' });
  }

  test("fails a staged global['...'] lookup", () => {
    const { status, output } = staged("global['x'] = 1;\n");

    assert.equal(status, 1);
    assert.match(output, /Suspicious global/);
  });

  test("passes a name that only ends in global['...']", () => {
    const { status, output } = staged("myglobal['x'] = 1;\n");

    assert.equal(status, 0, output);
  });
});

describe('launcher', () => {
  /** Runs the secure-config bin in a directory and returns its result. */
  function launch(cwd, env = {}) {
    const result = spawnSync(process.execPath, [BIN], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, ...env },
    });
    return { status: result.status, output: result.stdout + result.stderr };
  }

  test('names the config file when a list field holds a string', () => {
    const root = repo({
      '.devkit/secure.json': '{ "gitignoreRequired": ".env.local" }',
    });
    const { status, output } = launch(root);

    assert.equal(status, 1);
    assert.match(output, /secure\.json: gitignoreRequired must be a list/);
  });

  test('rejects a config that is not an object', () => {
    const root = repo({ '.devkit/secure.json': 'null' });
    const { status, output } = launch(root);

    assert.equal(status, 1);
    assert.match(output, /must hold a JSON object/);
  });

  test('runs with the defaults when the config is a list', () => {
    const root = repo({ '.devkit/secure.json': '[]' });
    const { status, output } = launch(root);

    assert.equal(status, 0, output);
  });

  test('prints one line when there is no repository', () => {
    const { status, output } = launch(mkdtempSync(join(tmpdir(), 'devkit-')));

    assert.equal(status, 1);
    assert.match(output, /^secure: No git repository above/);
    assert.doesNotMatch(output, /\n\s+at /);
  });

  test('says so when bash cannot be started', () => {
    const { status, output } = launch(repo({}), { PATH: '/nonexistent' });

    assert.equal(status, 1);
    assert.match(output, /secure: could not run bash/);
  });
});
