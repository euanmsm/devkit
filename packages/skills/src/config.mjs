// ============================================================================
// Config
// ============================================================================
//
// Reads `.devkit/skills.json` and fills in every default, refusing a skill or
// option name it does not know so a typo fails loudly instead of doing nothing.

import { loadConfig } from '@euanmsm/devkit-core';

import { SKILLS } from './skills.mjs';

/** Name of the config file under `.devkit/`. */
export const CONFIG_NAME = 'skills.json';

/** Top-level settings every skill shares. */
const SHARED_DEFAULTS = {
  skillsDir: '.claude/skills',
  agentsDir: '.claude/agents',
  rulesDir: '.claude/rules',
  baseBranch: 'main',
};

/**
 * Reads the repository's skills config with every default applied.
 *
 * @param root - The repository root
 * @returns The shared settings, plus `skills` mapping each enabled skill to its options
 * @throws When the config is missing, or names a skill or option that does not exist
 */
export function readConfig(root) {
  const raw = loadConfig(CONFIG_NAME, null, root);
  if (!raw) {
    throw new Error(
      `No .devkit/${CONFIG_NAME}. Copy skills.example.json from this package to start one.`,
    );
  }

  const { skills = {}, ...shared } = raw;

  for (const key of Object.keys(shared)) {
    if (!(key in SHARED_DEFAULTS)) {
      throw new Error(`Unknown setting "${key}" in .devkit/${CONFIG_NAME}`);
    }
  }

  const enabled = {};

  for (const [name, options] of Object.entries(skills)) {
    const skill = SKILLS[name];
    if (!skill) {
      throw new Error(
        `Unknown skill "${name}". Available: ${Object.keys(SKILLS).join(', ')}`,
      );
    }

    for (const key of Object.keys(options ?? {})) {
      if (!(key in skill.defaults)) {
        throw new Error(`Unknown option "${key}" for skill "${name}"`);
      }
    }

    enabled[name] = { ...skill.defaults, ...options };
  }

  return { ...SHARED_DEFAULTS, ...shared, skills: enabled };
}
