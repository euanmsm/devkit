// ============================================================================
// Skills
// ============================================================================
//
// Every skill this package can install: its options with their defaults, the
// files it writes, and the values its templates are rendered with.

import { loadConfig } from '@euanmsm/devkit-core';

/** Where `terse-docs` writes the comment contract when `rulesDoc` is unset. */
const DEFAULT_RULES_DOC = '.devkit/comment-rules.md';

/**
 * Finds the comment contract the repository's terse config points at.
 *
 * @param root - The repository root
 * @returns The contract's repo-relative path
 */
function rulesDocFor(root) {
  return loadConfig('terse.json', {}, root).rulesDoc || DEFAULT_RULES_DOC;
}

/**
 * The installable skills by name.
 *
 * Each `files` entry names a template under `templates/`, the config key of
 * the directory it lands in, and its path inside that directory.
 */
export const SKILLS = {
  'clean-commit-history': {
    defaults: {
      commitRules: '',
      layerOrder: [
        'migrations',
        'generated types',
        'shared schemas',
        'data access',
        'services',
        'routes',
        'UI',
        'tests',
        'docs',
        'cleanup',
      ],
    },
    files: [
      {
        template: 'clean-commit-history/SKILL.md',
        dir: 'skillsDir',
        path: 'clean-commit-history/SKILL.md',
      },
    ],
    values: (options) => ({
      commitStyle: options.commitRules
        ? `Follow the project's commit rules in \`${options.commitRules}\`.`
        : "Follow the project's commit message convention if it documents one, otherwise Conventional Commits (`type(scope): imperative subject`).",
      layerOrder: options.layerOrder.join(' → '),
    }),
  },

  'clean-comments': {
    defaults: { preloadSkills: ['comments'], typecheck: '' },
    files: [
      {
        template: 'clean-comments/SKILL.md',
        dir: 'skillsDir',
        path: 'clean-comments/SKILL.md',
      },
      {
        template: 'agents/comments-specialist.md',
        dir: 'agentsDir',
        path: 'comments-specialist.md',
      },
    ],
    values: (options, root) => ({
      rulesDoc: rulesDocFor(root),
      typecheck: options.typecheck,
      preloadCalls: options.preloadSkills
        .map((skill) => `Skill(skill: "${skill}")`)
        .join('\n'),
      preloadYaml: options.preloadSkills
        .map((skill) => `  - ${skill}`)
        .join('\n'),
    }),
  },
};
