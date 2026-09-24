// ============================================================================
// Shell Gate — Tests
// ============================================================================
//
// Covers which Bash commands count as editing a repository file, and the hook
// end to end: where it finds the repository, its off switch and failing open.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { findShellEdit } from '../src/gate.mjs';

const BIN = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'bin',
  'shellgate.mjs',
);

const REPO = '/repo';

/** Runs the gate as if the command ran from the repository root. */
function check(command) {
  return findShellEdit(command, REPO, REPO);
}

describe('findShellEdit blocks', () => {
  const blocked = [
    ['sed -i on macOS', "sed -i '' 's/a/b/' src/file.ts"],
    ['sed with combined flags', "sed -Ei 's/a/b/' src/file.ts"],
    ['sed --in-place', "sed --in-place 's/a/b/' src/file.ts"],
    ['perl -pi', "perl -pi -e 's/a/b/' src/file.ts"],
    ['perl -i with a backup suffix', "perl -i.bak -pe 's/a/b/' src/file.ts"],
    ['a redirect into the repo', 'echo hi > src/file.ts'],
    ['an appending heredoc', "cat >> notes.md <<'EOF'\nline > other\nEOF"],
    ['a quoted redirect target', 'echo hi > "src/my file.ts"'],
    ['a redirect after cd', 'cd apps/main && echo x > .env.local'],
    ['tee into the repo', 'printf x | tee -a apps/main/a.ts'],
    [
      'a Python heredoc that writes',
      "python3 - <<'EOF'\nopen('a.ts', 'w').write('x')\nEOF",
    ],
    [
      'a Python pathlib write',
      "python3 -c \"from pathlib import Path; Path('a').write_text('x')\"",
    ],
    ['a node -e write', "node -e \"require('fs').writeFileSync('a.ts', 'x')\""],
    ['git apply', 'git apply fix.patch'],
    ['patch', 'patch -p1 < fix.patch'],
    [
      'a redirect after cd into the repo',
      'cd /tmp && cd /repo/src && echo x > a.ts',
    ],
    [
      'a read-modify-write script after cd into the repo',
      "cd /repo/src; python3 - <<'EOF'\np='a.ts'; s=open(p).read()\nopen(p,'w').write(s)\nEOF",
    ],
  ];

  for (const [name, command] of blocked) {
    test(name, () => {
      assert.notEqual(check(command), null);
    });
  }
});

describe('findShellEdit allows', () => {
  const allowed = [
    ['sed printing lines', "sed -n '1,80p' src/file.ts"],
    ['a search for the text sed -i', 'grep -rn "sed -i" .claude'],
    ['stderr to /dev/null', 'git log --oneline 2>/dev/null'],
    ['stderr merged into stdout', 'npm run build 2>&1 | tail -20'],
    ['a comparison inside quotes', "jq '.[] | select(.n > 1)' data.json"],
    [
      'a redirect outside the repo',
      'curl -s https://example.com > /tmp/out.json',
    ],
    ['a redirect to a variable path', 'echo x > "$SCRATCH/out.txt"'],
    [
      'a commit message heredoc',
      'git commit -m "$(cat <<\'EOF\'\nfix: a > b\nEOF\n)"',
    ],
    [
      'a read-only node script',
      "node -e \"console.log(require('fs').readFileSync('a', 'utf8'))\"",
    ],
    ['a read-only Python script', 'python3 -c "import json; print(1 > 0)"'],
    ['tee to stderr', 'echo x | tee /dev/stderr'],
    ['git apply --check', 'git apply --check fix.patch'],
    ['perl with a module flag', "perl -Mstrict -e 'print 1'"],
    ['a here-string', "grep x <<< 'a > b'"],
    ['a formatter', 'npx prettier --write src/file.ts'],
    ['git apply to the index only', 'git apply --cached fix.patch'],
    [
      'a redirect after cd out of the repo',
      'cd ~/.claude/memory && echo x >> MEMORY.md',
    ],
    [
      'a script writing to a scratch directory',
      "S=/private/tmp/scratchpad; python3 - \"$S\" <<'EOF'\nimport sys\nopen(sys.argv[1]+'/body.md','w').write('x')\nEOF",
    ],
  ];

  for (const [name, command] of allowed) {
    test(name, () => {
      assert.equal(check(command), null);
    });
  }
});

/**
 * Creates a throwaway repository with a subdirectory.
 *
 * @returns The repository root
 */
function makeRepo() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'shellgate-')));
  mkdirSync(join(root, '.git'));
  mkdirSync(join(root, 'sub'));
  return root;
}

/**
 * Runs the hook binary over a Bash payload.
 *
 * @param payload - The raw stdin the hook receives
 * @param env - Variables added to a clean environment
 * @returns The hook's stdout, empty when it allowed the command
 */
function runHook(payload, env = {}) {
  const { CLAUDE_PROJECT_DIR, SHELLGATE, ...rest } = process.env;
  const result = spawnSync(process.execPath, [BIN], {
    input: payload,
    encoding: 'utf8',
    env: { ...rest, ...env },
  });
  assert.equal(result.status, 0);
  return result.stdout;
}

describe('the hook end to end', () => {
  test('denies a redirect into the repository', () => {
    const root = makeRepo();
    const out = runHook(
      JSON.stringify({ tool_input: { command: 'echo x > a.ts' }, cwd: root }),
    );

    assert.match(out, /"permissionDecision":"deny"/);
    assert.match(out, /redirect into a\.ts/);
  });

  test('finds the repository root from CLAUDE_PROJECT_DIR in a subdirectory', () => {
    const root = makeRepo();
    const out = runHook(
      JSON.stringify({
        tool_input: { command: `echo x > ${join(root, 'a.ts')}` },
        cwd: tmpdir(),
      }),
      { CLAUDE_PROJECT_DIR: join(root, 'sub') },
    );

    assert.match(out, /"permissionDecision":"deny"/);
  });

  test('allows a command that edits nothing', () => {
    const root = makeRepo();
    const payload = JSON.stringify({
      tool_input: { command: 'git status' },
      cwd: root,
    });

    assert.equal(runHook(payload), '');
  });

  test('allows everything when SHELLGATE is off', () => {
    const root = makeRepo();
    const payload = JSON.stringify({
      tool_input: { command: 'echo x > a.ts' },
      cwd: root,
    });

    assert.equal(runHook(payload, { SHELLGATE: 'off' }), '');
  });

  test('allows the command when the payload is malformed', () => {
    assert.equal(runHook('not json'), '');
  });

  test('allows the command outside any repository', () => {
    const outside = realpathSync(mkdtempSync(join(tmpdir(), 'shellgate-')));
    const payload = JSON.stringify({
      tool_input: { command: 'echo x > a.ts' },
      cwd: outside,
    });

    assert.equal(runHook(payload), '');
  });
});
