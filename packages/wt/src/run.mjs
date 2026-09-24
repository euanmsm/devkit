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
 * Runs each hook command in order, warning on any that fail.
 *
 * @param commands - Shell command lines
 * @param cwd - Directory to run them in
 * @param env - Extra environment for every command
 * @returns How many commands failed
 */
export async function runHooks(commands, cwd, env) {
  let failed = 0;

  for (const command of commands) {
    console.log(`Running ${command}...`);
    const code = await shell(command, { cwd, env });

    if (code !== 0) {
      failed += 1;
      console.warn(
        `  Warning: "${command}" exited ${code}. Run it by hand in ${cwd}.`,
      );
    }
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
