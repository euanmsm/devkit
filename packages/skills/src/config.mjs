// ============================================================================
// Config
// ============================================================================
//
// Reads `.devkit/skills.json` and fills in every default, refusing a skill or
// option name it does not know, or a value of the wrong type, so a typo fails
// loudly instead of doing nothing.

import { normalize } from 'node:path';

import { loadConfig } from '@euanmsm/devkit-core';

import { isPlainObject, isStringList } from './review/config.mjs';
import { SKILLS } from './skills.mjs';

/** Name of the config file under `.devkit/`. */
export const CONFIG_NAME = 'skills.json';

/** Top-level settings every skill shares. */
const SHARED_DEFAULTS = {
  skillsDir: '.claude/skills',
  agentsDir: '.claude/agents',
  rulesDir: '.claude/rules',
  baseBranch: 'main',
  format: 'none',
};

/** Shared settings limited to a fixed set of values. */
const SHARED_CHOICES = { format: ['none', 'prettier'] };

/** The shared settings that name a folder, compared as paths during cleanup. */
const DIR_SETTINGS = ['skillsDir', 'agentsDir', 'rulesDir'];

/** The config file's repo-relative path, as error messages name it. */
const WHERE = `.devkit/${CONFIG_NAME}`;

/**
 * Reads the repository's skills config with every default applied.
 *
 * @param root - The repository root
 * @returns The shared settings, with no trailing slash on a folder, plus `skills` mapping each enabled skill to its options
 * @throws When the config is missing, names a skill or option that does not exist, or gives a value of the wrong type
 */
export function readConfig(root) {
  const raw = loadConfig(CONFIG_NAME, null, root);
  if (!raw) {
    throw new Error(
      `No ${WHERE}. Copy skills.example.json from this package to start one.`,
    );
  }
  if (!isPlainObject(raw)) throw new Error(`${WHERE} must hold an object`);

  const { skills = {}, ...shared } = raw;

  for (const [key, value] of Object.entries(shared)) {
    if (!(key in SHARED_DEFAULTS)) {
      throw new Error(`Unknown setting "${key}" in ${WHERE}`);
    }
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(
        `Setting "${key}" in ${WHERE} must be a non-empty string`,
      );
    }
    if (SHARED_CHOICES[key] && !SHARED_CHOICES[key].includes(value)) {
      throw new Error(
        `Setting "${key}" in ${WHERE} must be one of ${SHARED_CHOICES[key].map((c) => `"${c}"`).join(', ')}`,
      );
    }
  }

  if (!isPlainObject(skills)) {
    throw new Error(
      `"skills" in ${WHERE} must be an object mapping each skill's name to its options`,
    );
  }

  const enabled = {};

  for (const [name, options] of Object.entries(skills)) {
    const skill = SKILLS[name];
    if (!skill) {
      throw new Error(
        `Unknown skill "${name}" in ${WHERE}. Available: ${Object.keys(SKILLS).join(', ')}`,
      );
    }

    if (options === false) {
      throw new Error(
        `Skill "${name}" in ${WHERE} is false. Remove the key to leave the skill out.`,
      );
    }
    if (!isPlainObject(options)) {
      throw new Error(
        `Skill "${name}" in ${WHERE} must be an object of its options, {} for the defaults`,
      );
    }

    for (const [key, value] of Object.entries(options)) {
      if (!(key in skill.defaults)) {
        throw new Error(
          `Unknown option "${key}" for skill "${name}" in ${WHERE}`,
        );
      }
      const problem = skill.validate?.[key]
        ? skill.validate[key](value)
        : optionProblem(value, skill.defaults[key], skill.patterns?.[key]);
      if (problem) {
        throw new Error(
          `Option "${key}" for skill "${name}" in ${WHERE} must be ${problem}`,
        );
      }
    }

    enabled[name] = { ...skill.defaults, ...options };
  }

  const settings = { ...SHARED_DEFAULTS, ...shared };
  for (const key of DIR_SETTINGS) settings[key] = trimDir(settings[key]);

  return { ...settings, skills: enabled };
}

/**
 * Says what an option's value should have been, when it is wrong.
 *
 * @param value - The value the config gives
 * @param fallback - The option's default, whose type the value must share
 * @param pattern - `{ test, means }` a string must also match, when the option has one
 * @returns What the value must be, or null when it is fine
 */
function optionProblem(value, fallback, pattern) {
  if (Array.isArray(fallback)) {
    return isStringList(value) ? null : 'a list of strings';
  }
  if (typeof fallback === 'boolean') {
    return typeof value === 'boolean' ? null : 'true or false';
  }
  if (typeof value !== 'string') return 'a string';
  return pattern && !pattern.test.test(value) ? pattern.means : null;
}

/**
 * Normalises a folder setting so it compares equal to the same path built by `join`.
 *
 * @param dir - The folder, relative to the repository root
 * @returns The folder with `.` and doubled separators resolved and no trailing slash
 */
function trimDir(dir) {
  return normalize(dir).replace(/[\\/]+$/, '') || '.';
}
