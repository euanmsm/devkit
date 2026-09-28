// ============================================================================
// Skills
// ============================================================================
//
// Every skill this package can install: its options with their defaults, the
// files it writes, and the values its templates are rendered with.

import { loadConfig } from '@euanmsm/devkit-core';

import { loadPrConfig } from './pr/config.mjs';
import { prValues, qaGateProblem } from './pr/values.mjs';
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

/** A skill name that becomes a folder under skillsDir and the slash command. */
const NAME_PATTERN = {
  test: /^[a-z0-9][a-z0-9-]*$/,
  means:
    'lowercase letters, digits and dashes, starting with a letter or digit',
};

/**
 * Words limiting the typecheck to changes under some folders.
 *
 * @param paths - Path prefixes, relative to the repository root
 * @returns The clause to append, empty when the typecheck always runs
 */
function typecheckScope(paths) {
  if (paths.length === 0) return '';
  const list = paths.map((path) => `\`${path}\``).join(', ');
  return `. Run it only when a changed file sits under ${list}; otherwise say it was skipped and why`;
}

/**
 * The installable skills by name, each file naming its template, directory
 * setting (none for the repository root) and path; `engine` names the value
 * holding a workflow's config, and `seed` marks a file written only once.
 * `patterns` holds string options that must also match a pattern, with what
 * the pattern asks for. `requires` names a package the skill runs, which sync
 * warns about when the repository does not depend on it.
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
    defaults: {
      preloadSkills: ['comments'],
      typecheck: '',
      typecheckPaths: [],
    },
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
      typecheckScope: typecheckScope(options.typecheckPaths),
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
      name: 'review',
      config: '.devkit/code-review.mjs',
      githubReview: false,
    },
    patterns: { name: NAME_PATTERN },
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
        engine: 'review',
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

  'dead-code': {
    defaults: { typecheck: '' },
    requires: '@euanmsm/dead-code',
    files: [
      {
        template: 'dead-code/SKILL.md',
        dir: 'skillsDir',
        path: 'dead-code/SKILL.md',
      },
    ],
    values: (options) => ({ typecheck: options.typecheck }),
  },

  pr: {
    defaults: { name: 'pr', config: '.devkit/pr.mjs', qaGate: false },
    patterns: { name: NAME_PATTERN },
    validate: { qaGate: qaGateProblem },
    files: (options, values) => [
      {
        template: 'pr/SKILL.md',
        dir: 'skillsDir',
        path: `${options.name}/SKILL.md`,
      },
      {
        template: 'pr/pr-qa.workflow.js',
        dir: 'skillsDir',
        path: `${options.name}/pr-qa.workflow.js`,
        engine: 'pr',
      },
      { template: 'pr/TRAPS.md', dir: null, path: values.pr.traps, seed: true },
      ...(options.qaGate
        ? [
            {
              template: 'pr/pr-manual-qa.yml',
              dir: null,
              path: '.github/workflows/pr-manual-qa.yml',
            },
          ]
        : []),
    ],
    values: async (options, root, shared) =>
      prValues(await loadPrConfig(root, options, shared), options, shared),
  },
};
