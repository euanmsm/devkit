// ============================================================================
// Skills
// ============================================================================
//
// Every skill this package can install: its options with their defaults, the
// files it writes, and the values its templates are rendered with.

import { loadConfig } from '@euanmsm/devkit-core';

import { loadReviewConfig } from './review/config.mjs';
import { skillValues } from './review/roster.mjs';

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
 * A `files` entry, or a function of the options returning them, names a
 * template, its directory setting and its path; `engine` marks the workflow.
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

  'code-review': {
    defaults: {
      name: 'code-review',
      config: '.devkit/code-review.mjs',
      githubReview: false,
    },
    files: (options) => [
      {
        template: 'code-review/SKILL.md',
        dir: 'skillsDir',
        path: `${options.name}/SKILL.md`,
      },
      {
        template: 'code-review/review.workflow.js',
        dir: 'skillsDir',
        path: `${options.name}/review.workflow.js`,
        engine: true,
      },
      ...(options.githubReview
        ? [
            {
              template: 'code-review/pr-reviews.md',
              dir: 'rulesDir',
              path: 'pr-reviews.md',
            },
          ]
        : []),
    ],
    values: async (options, root, shared) => {
      const review = await loadReviewConfig(root, options, shared);
      return { ...skillValues(review, options, shared), review };
    },
  },
};
