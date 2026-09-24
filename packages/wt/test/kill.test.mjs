// ============================================================================
// Kill Tests
// ============================================================================
//
// Starts real servers and watchers in throwaway worktrees, then checks what
// `wt kill` and `wt -d` stop and what they leave running.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { afterEach, describe, test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';

import {
  isProtected,
  lanePorts,
  parseDockerPorts,
  parseLsof,
  programName,
} from '../src/kill.mjs';
import { makeRepo, wt } from './repo.mjs';

const CONFIG = {
  dir: '../app-wt',
  ports: { services: { app: 41000 } },
  open: 'none',
};

const children = [];

afterEach(() => {
  for (const child of children.splice(0)) child.kill('SIGKILL');
});

/**
 * Starts a long-running node child, waiting until it reports ready.
 *
 * @param cwd - Directory to run it in
 * @param script - Code that prints `ready` once it is up
 * @returns The child process
 */
async function start(cwd, script) {
  const child = spawn(process.execPath, ['-e', script], {
    cwd,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  children.push(child);

  await new Promise((resolve, reject) => {
    child.stdout.on('data', (d) => d.toString().includes('ready') && resolve());
    child.on('exit', () => reject(new Error(`child exited early: ${script}`)));
  });
  return child;
}

/**
 * Starts an HTTP server on a port.
 *
 * @param cwd - Directory to run it in
 * @param port - The port to listen on
 * @returns The child process
 */
function server(cwd, port) {
  return start(
    cwd,
    `require('http').createServer(() => {}).listen(${port}, () => console.log('ready'))`,
  );
}

/**
 * Waits briefly, then reports whether a child is still running.
 *
 * @param child - A child process
 * @returns Whether it has not exited
 */
async function running(child) {
  await sleep(200);
  return child.exitCode === null && child.signalCode === null;
}

/**
 * Builds a repo with one worktree named `feat` in slot 1.
 *
 * @returns The temp folder, the repo root and the worktree path
 */
function fixture() {
  const { base, root } = makeRepo({ '.devkit/wt.json': CONFIG });
  wt(root, ['feat', '-b', 'feat']);
  return { base, root, feat: join(base, 'app-wt', 'feat') };
}

describe('wt kill', () => {
  test('stops the server on the worktree port and leaves main alone', async () => {
    const { root, feat } = fixture();
    const mine = await server(feat, 41100);
    const mains = await server(root, 41000);

    const { status, out } = wt(root, ['kill', 'feat']);

    assert.equal(status, 0, out);
    assert.match(out, /Stopping node \(pid \d+\) on app :41100/);
    assert.equal(await running(mine), false);
    assert.equal(await running(mains), true);
  });

  test('lists what it would stop and stops nothing on a dry run', async () => {
    const { root, feat } = fixture();
    const mine = await server(feat, 41100);

    const { out } = wt(root, ['kill', 'feat', '--dry-run']);

    assert.match(out, /Would stop node \(pid \d+\) on app :41100/);
    assert.equal(await running(mine), true);
  });

  test('stops folder processes only with --all, never a shell', async () => {
    const { root, feat } = fixture();
    const watcher = await start(
      feat,
      "console.log('ready'); setInterval(() => {}, 1000)",
    );
    const shell = spawn('/bin/sh', ['-c', 'while true; do sleep 1; done'], {
      cwd: feat,
      stdio: 'ignore',
    });
    children.push(shell);

    wt(root, ['kill', 'feat']);
    assert.equal(await running(watcher), true);

    wt(root, ['kill', 'feat', '--all']);
    assert.equal(await running(watcher), false);
    assert.equal(await running(shell), true);
  });

  test('stops the worktree it is run from when given no name', async () => {
    const { feat } = fixture();
    const mine = await server(feat, 41100);

    const { status } = wt(feat, ['kill']);

    assert.equal(status, 0);
    assert.equal(await running(mine), false);
  });

  test('refuses to run nameless from the main checkout', () => {
    const { root } = fixture();

    const { status, out } = wt(root, ['kill']);

    assert.equal(status, 1);
    assert.match(out, /Name a worktree/);
  });

  test('stops every worktree with --every', async () => {
    const { base, root, feat } = fixture();
    wt(root, ['other', '-b', 'other']);
    const one = await server(feat, 41100);
    const two = await server(join(base, 'app-wt', 'other'), 41200);

    wt(root, ['kill', '--every']);

    assert.equal(await running(one), false);
    assert.equal(await running(two), false);
  });

  test('runs before a delete', async () => {
    const { root, feat } = fixture();
    const mine = await server(feat, 41100);

    const { status, out } = wt(root, ['-d', 'feat']);

    assert.equal(status, 0, out);
    assert.equal(await running(mine), false);
  });
});

describe('kill helpers', () => {
  test('reads lsof field output, one entry per process', () => {
    const text =
      'p1086\nccom.docker.backend\nf133\nn*:54327\nf150\nn*:54321\np42\ncnode\nf20\nn127.0.0.1:3100\n';

    assert.deepEqual(parseLsof(text), [
      {
        pid: 1086,
        command: 'com.docker.backend',
        names: ['*:54327', '*:54321'],
      },
      { pid: 42, command: 'node', names: ['127.0.0.1:3100'] },
    ]);
  });

  test('reads host ports, including ranges, from docker ps', () => {
    const text =
      'supabase_db_x|0.0.0.0:55322->5432/tcp, [::]:55322->5432/tcp\nmeta|8080/tcp\nweb|0.0.0.0:8000-8001->80-81/tcp\n';

    assert.deepEqual(parseDockerPorts(text), [
      { name: 'supabase_db_x', ports: [55322] },
      { name: 'meta', ports: [] },
      { name: 'web', ports: [8000, 8001] },
    ]);
  });

  test("lists a slot's ports without any the main checkout uses", () => {
    const config = {
      ports: { step: 100, services: { app: 3000, other: 3100 } },
      supabase: null,
    };

    assert.deepEqual(lanePorts(config, 1), [{ port: 3200, label: 'other' }]);
  });

  test('adds the Supabase range when configured', () => {
    const config = {
      ports: { step: 100, services: { app: 3000 } },
      supabase: { basePort: 54320, step: 1000 },
    };

    const ports = lanePorts(config, 1).map((l) => l.port);

    assert.deepEqual(ports, [
      3100,
      ...Array.from({ length: 10 }, (_, k) => 55320 + k),
    ]);
  });

  test('names a process by its program, not its thread name', () => {
    assert.equal(programName('/usr/local/bin/node -e x', 'MainThread'), 'node');
    assert.equal(programName(undefined, 'next-server'), 'next-server');
  });

  test('protects shells, editors and Claude sessions', () => {
    for (const name of [
      'zsh',
      '-bash',
      'sh',
      'Code Helper (Plugin)',
      'nvim',
      'claude',
    ]) {
      assert.ok(isProtected(name), name);
    }
    assert.ok(isProtected('node', 'node /usr/local/bin/claude --resume'));
    assert.ok(!isProtected('node', 'node vitest --watch'));
  });
});
