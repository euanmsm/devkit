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
  const root = repoRoot();
  const config = loadConfig('secure.json', {}, root);

  const result = spawnSync('bash', [join(SH, script)], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      DEVKIT_GITIGNORE_REQUIRED: (config.gitignoreRequired ?? []).join('\n'),
      DEVKIT_SEMGREP_CONFIGS: (config.semgrepConfigs ?? []).join('\n'),
      DEVKIT_LOCKFILE_HOSTS: (config.lockfileAllowedHosts ?? ['npm']).join(','),
      DEVKIT_MAX_CONFIG_LINE: String(config.maxConfigLineLength ?? 200),
      DEVKIT_DOCS_URL: config.docsUrl ?? '',
    },
  });

  process.exit(result.status ?? 1);
}
