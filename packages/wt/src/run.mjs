// ============================================================================
// Processes
// ============================================================================
//
// Runs hook commands and outside tools with their output shown to the user.

import { spawn, spawnSync } from 'node:child_process';

/**
 * Runs a command through the shell and waits for it.
 *
 * @param command - A shell command line
 * @param options - `cwd` and extra `env` for the command
 * @returns The exit code, or 1 when it was killed by a signal
 */
export function shell(command, { cwd, env = {} } = {}) {
  return exec(command, [], { cwd, env, shell: true });
}

/**
 * Runs a program with arguments and waits for it.
 *
 * @param program - The program to run
 * @param args - Its arguments
 * @param options - `cwd`, extra `env` and whether to use the `shell`
 * @returns The exit code, 127 when the program is missing, 1 on a signal
 */
export function exec(program, args, { cwd, env = {}, shell = false } = {}) {
  return new Promise((done) => {
    const child = spawn(program, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: 'inherit',
      shell,
    });

    child.on('error', () => done(127));
    child.on('close', (code) => done(code ?? 1));
  });
}

/**
 * Runs each hook in order, stopping at a required one that fails.
 *
 * @param hooks - Command lines, or `{ run, optional }` objects
 * @param cwd - Directory to run them in
 * @param env - Extra environment for every command
 * @returns How many optional hooks failed
 * @throws When a required hook exits non-zero
 */
export async function runHooks(hooks, cwd, env) {
  let failed = 0;

  for (const hook of hooks) {
    const { run, optional = false } =
      typeof hook === 'string' ? { run: hook } : hook;

    console.log(`Running ${run}...`);
    const code = await shell(run, { cwd, env });
    if (code === 0) continue;

    if (!optional) throw new Error(`"${run}" exited ${code} in ${cwd}.`);

    failed += 1;
    console.warn(
      `  Warning: "${run}" exited ${code}. Run it by hand in ${cwd}.`,
    );
  }

  return failed;
}

/**
 * True when a program can be found on the PATH.
 *
 * @param program - The program's name
 * @returns Whether running it with `--version` started
 */
export function onPath(program) {
  return !spawnSync(program, ['--version'], { stdio: 'ignore' }).error;
}

/**
 * Lists the process ids listening on a TCP port.
 *
 * @param port - The port
 * @returns The listening process ids, empty when none or `lsof` is missing
 */
export function listeners(port) {
  const result = spawnSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], {
    encoding: 'utf8',
  });
  if (result.error || !result.stdout) return [];

  return result.stdout.split('\n').map(Number).filter(Boolean);
}
