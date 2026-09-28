// ============================================================================
// Postinstall Allowlist
// ============================================================================
//
// Runs install and postinstall scripts for trusted packages while `.npmrc`'s
// `ignore-scripts=true` blocks lifecycle scripts for everyone else.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve, win32 } from 'node:path';

import { loadConfig, repoRoot } from '@euanmsm/devkit-core';

const CONFIG_NAME = 'vouch.json';
const DEFAULT_TIMEOUT_MS = 300_000;

/**
 * Lists the directories whose `node_modules` may hold an allowlisted package.
 *
 * It walks up from the cwd to the git root as Node's module resolution does,
 * so a workspace member finds packages hoisted to the workspace root, and
 * appends npm's local prefix if an outer `npm run` left it off that walk.
 *
 * @param cwd - Directory vouch was started from
 * @param top - Git root to stop at, or null to walk to the filesystem root
 * @param env - Environment to read npm's prefix from
 * @returns The directories, nearest first
 */
export function searchDirs(cwd = process.cwd(), top = null, env = process.env) {
  const dirs = [];
  for (let dir = resolve(cwd); ; dir = dirname(dir)) {
    dirs.push(dir);
    if (dir === top || dirname(dir) === dir) break;
  }

  const prefix = env.npm_config_local_prefix;
  if (prefix && !dirs.includes(resolve(prefix))) dirs.push(resolve(prefix));
  return dirs;
}

/**
 * Builds the call that runs npm with some arguments.
 *
 * Windows ships npm as `npm.cmd`, which Node will not spawn without a shell,
 * so it runs npm's own script through node or, failing that, through cmd.
 *
 * @param args - Arguments for npm
 * @param platform - Platform to build the call for
 * @param env - Environment to read `npm_execpath` from
 * @returns The file, arguments and extra spawn options
 * @throws When cmd would need to quote an argument it cannot quote safely
 */
export function npmCommand(
  args,
  platform = process.platform,
  env = process.env,
) {
  if (platform !== 'win32') return ['npm', args, {}];

  const cli = env.npm_execpath;
  if (cli && /^npm-cli\.[cm]?js$/.test(win32.basename(cli))) {
    return [process.execPath, [cli, ...args], {}];
  }

  const unsafe = args.find((arg) => /["%]/.test(arg));
  if (unsafe) throw new Error(`cannot pass ${unsafe} to npm through cmd`);
  return ['npm', args.map((arg) => `"${arg}"`), { shell: true }];
}

/**
 * Runs every allowed lifecycle script that has a package installed.
 *
 * Each package runs from the first directory whose `node_modules` holds it.
 *
 * @param entries - Allowlist entries, each naming a package and its script
 * @param dirs - Directory, or directories nearest first, holding `node_modules`
 * @returns One message per failure, empty when every script succeeded
 */
export function run(entries, dirs) {
  const roots = [dirs].flat();
  const failures = [];

  for (const { pkg, script, reason, timeout } of entries) {
    const root = roots.find((dir) =>
      existsSync(join(dir, 'node_modules', pkg)),
    );
    if (!root) {
      const paths = roots.map((dir) => join(dir, 'node_modules', pkg));
      console.log(`  Skipping ${pkg} — not installed at ${paths.join(', ')}`);
      continue;
    }

    console.log(`  Running ${script} for ${pkg} (${reason})`);

    try {
      const [file, args, options] = npmCommand([
        'explore',
        '--prefix',
        root,
        pkg,
        '--',
        'npm',
        'run',
        script,
      ]);
      execFileSync(file, args, {
        ...options,
        cwd: root,
        stdio: 'inherit',
        timeout: timeout ?? DEFAULT_TIMEOUT_MS,
      });
    } catch (error) {
      failures.push(`${script} for ${pkg} failed: ${error.message}`);
    }
  }

  return failures;
}

/** Reads the allowlist and runs it, exiting non-zero on any failure. */
export function main() {
  let top = null;
  try {
    top = repoRoot();
  } catch {
    // No .git, as in a Docker build or a tarball: a project holds .devkit.
  }
  const dirs = searchDirs(process.cwd(), top);
  const configRoot =
    top ??
    dirs.find((dir) => existsSync(join(dir, '.devkit', CONFIG_NAME))) ??
    dirs[0];
  const config = loadConfig(CONFIG_NAME, { allowed: [] }, configRoot);
  const entries = config.allowed ?? [];

  if (entries.length === 0) {
    console.log(
      `No allowlist entries in .devkit/${CONFIG_NAME} — nothing to run.`,
    );
    return;
  }

  const failures = run(entries, dirs);
  if (failures.length === 0) return;

  console.error('\nPostinstall allowlist failures:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
