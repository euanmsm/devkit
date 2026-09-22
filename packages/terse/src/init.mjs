// ============================================================================
// Init
// ============================================================================
//
// Writes a complete `.devkit/terse.json` into the repository — every rule and
// every cap spelled out, so a reader edits what is in front of them rather than
// discovering defaults in a README.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '@euanmsm/devkit-core';
import { RULES, config } from './scanner.mjs';
const CONFIG_NAME = 'terse.json';

/**
 * Builds the config file's text, every rule and cap spelled out.
 *
 * @returns JSON carrying a `_rules` key describing what each switch does
 */
export function template() {
  const rules = Object.fromEntries(
    Object.keys(RULES).map((name) => [name, true]),
  );
  const about = Object.fromEntries(
    Object.entries(RULES).map(([name, r]) => [
      name,
      `${r.about} (rule ${r.number})`,
    ]),
  );

  const body = {
    _readme:
      'Every rule and cap this repository applies. Set a rule to false to switch it off. `bans` replaces the defaults rather than adding to them.',
    _rules: about,
    rules,
    governed: config.governed,
    exclude: config.exclude,
    headerMax: config.headerMax,
    jsdocProseMax: config.jsdocProseMax,
    commentMaxChars: config.commentMaxChars,
    bannerMinCode: config.bannerMinCode,
    todoPrefix: config.todoPrefix,
    allowedTags: config.allowedTags,
    jsdocScope: config.jsdocScope,
    jsdocScopeExclude: config.jsdocScopeExclude,
    rulesDoc: '',
    examplesDoc: '',
    bans: config.bans,
  };

  return `${JSON.stringify(body, null, 2)}\n`;
}

/** Writes the config, refusing to overwrite one the repo already has. */
export function main() {
  const dir = join(repoRoot(), '.devkit');
  const path = join(dir, CONFIG_NAME);

  if (existsSync(path) && !process.argv.includes('--force')) {
    console.error(
      `.devkit/${CONFIG_NAME} already exists. Pass --force to replace it, or edit it in place.`,
    );
    process.exit(1);
  }

  mkdirSync(dir, { recursive: true });
  writeFileSync(path, template());

  console.log(
    `Wrote .devkit/${CONFIG_NAME} — every rule listed, all switched on.`,
  );
  console.log('Edit it to turn rules off, then run `terse` to check a branch.');
}
