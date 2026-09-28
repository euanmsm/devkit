// ============================================================================
// Shell Runner
// ============================================================================
//
// Reads .devkit/secure.json and hands it to one of the bash scripts as
// DEVKIT_* variables, so the scripts hold no repo-specific values themselves.

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfig, repoRoot } from '@euanmsm/devkit-core';

const SH = join(dirname(fileURLToPath(import.meta.url)), '..', 'sh');

/**
 * Runs one of the package's bash scripts against the consuming repository.
 *
 * @param script - File name inside `sh/`
 * @returns Never — exits with the script's status
 */
export function runScript(script) {
  let root, config;
  try {
    root = repoRoot();
    config = loadConfig('secure.json', {}, root);
  } catch (error) {
    fail(error.message);
  }

  // A hand-edited config can hold the wrong types, which .join() would crash on.
  if (config === null) {
    fail('.devkit/secure.json must hold a JSON object');
  }
  for (const key of [
    'gitignoreRequired',
    'semgrepConfigs',
    'lockfileAllowedHosts',
  ]) {
    if (config[key] != null && !Array.isArray(config[key])) {
      fail(`.devkit/secure.json: ${key} must be a list`);
    }
  }

  const result = spawnSync('bash', [join(SH, script)], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      DEVKIT_GITIGNORE_REQUIRED: (config.gitignoreRequired ?? []).join('\n'),
      DEVKIT_SEMGREP_CONFIGS: (config.semgrepConfigs ?? []).join('\n'),
      DEVKIT_LOCKFILE_HOSTS: (config.lockfileAllowedHosts ?? ['npm']).join(
        '\n',
      ),
      DEVKIT_MAX_CONFIG_LINE: String(config.maxConfigLineLength ?? 200),
      DEVKIT_DOCS_URL: config.docsUrl ?? '',
    },
  });

  if (result.error) fail(`could not run bash — ${result.error.message}`);
  process.exit(result.status ?? 1);
}

/**
 * Prints a one-line error and exits 1.
 *
 * @param message - What went wrong
 */
function fail(message) {
  process.stderr.write(`secure: ${message}\n`);
  process.exit(1);
}
