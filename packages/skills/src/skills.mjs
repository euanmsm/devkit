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

/** The trackers the issues skill knows, in the order its sections appear. */
const TRACKERS = ['linear', 'github'];

/** How each tracker is named in the issues skill's prose. */
const TRACKER_NAMES = { linear: 'Linear', github: 'GitHub' };

/**
 * Says what the issues skill's `trackers` option should have been, when it is wrong.
 *
 * @param value - The value the config gives
 * @returns What the value must be, or null when it is fine
 */
function trackersProblem(value) {
  const valid =
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((tracker) => TRACKERS.includes(tracker)) &&
    new Set(value).size === value.length;
  return valid
    ? null
    : `a list of one or both of ${TRACKERS.map((tracker) => `"${tracker}"`).join(' and ')}, without repeats`;
}

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

  issues: {
    defaults: {
      name: 'issues',
      trackers: ['linear', 'github'],
      layerOrder: ['migrations', 'data access', 'services', 'API routes', 'UI'],
      testingRules: '',
    },
    patterns: { name: NAME_PATTERN },
    validate: { trackers: trackersProblem },
    files: (options) => [
      {
        template: 'issues/SKILL.md',
        dir: 'skillsDir',
        path: `${options.name}/SKILL.md`,
      },
    ],
    values: (options) => {
      const trackers = TRACKERS.filter((tracker) =>
        options.trackers.includes(tracker),
      );
      return {
        name: options.name,
        linear: trackers.includes('linear'),
        github: trackers.includes('github'),
        both: trackers.length === 2,
        trackerNames: trackers
          .map((tracker) => TRACKER_NAMES[tracker])
          .join(' or '),
        layerOrder: options.layerOrder.join(' → '),
        testingStyle: options.testingRules
          ? `Follow the testing conventions in \`${options.testingRules}\` for which kind of test each layer gets and which config it runs under`
          : 'Match the test to the layer the code lives in — integration tests for code that talks to the database, unit tests for pure logic, request-level tests for API routes — following what the repository already does',
      };
    },
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

  'reading-order': {
    defaults: { outputDir: 'tmp' },
    patterns: {
      outputDir: {
        test: /^(?!\/)(?!.*(^|\/)\.\.(\/|$))[^\s]+$/,
        means:
          'a folder inside the repository, relative to its root, with no spaces',
      },
    },
    files: [
      {
        template: 'reading-order/SKILL.md',
        dir: 'skillsDir',
        path: 'reading-order/SKILL.md',
      },
    ],
    values: (options) => ({
      outputDir: options.outputDir.replace(/\/+$/, ''),
    }),
  },

  'review-page': {
    defaults: { outputDir: 'tmp', editor: 'vscode' },
    patterns: {
      outputDir: {
        test: /^(?!\/)(?!.*(^|\/)\.\.(\/|$))[^\s]+$/,
        means:
          'a folder inside the repository, relative to its root, with no spaces',
      },
      editor: { test: /^(vscode|cursor)$/, means: 'vscode or cursor' },
    },
    files: [
      {
        template: 'review-page/SKILL.md',
        dir: 'skillsDir',
        path: 'review-page/SKILL.md',
      },
      {
        template: 'review-page/notes-format.md',
        dir: 'skillsDir',
        path: 'review-page/notes-format.md',
      },
    ],
    values: (options) => ({
      outputDir: options.outputDir.replace(/\/+$/, ''),
      editor: options.editor,
    }),
  },
};
