// ============================================================================
// Code Review Config
// ============================================================================
//
// Copy to `.devkit/code-review.mjs`. Every key is optional: an empty object
// runs the review with the built-in lenses, bundles and wording.

export default {
  // What routing counts as code, docs and tests.
  files: {
    code: /\.(ts|tsx|js|mjs)$/,
    tests: /\.test\.tsx?$/,
    targetExtensions: ['ts', 'tsx', 'sql', 'md'],
  },

  // Commands run before the reviewers start; `json: true` keeps only the JSON.
  prepass: {
    tools: [
      { key: 'tsc', label: 'TypeScript errors', command: 'npx tsc --noEmit' },
      { key: 'lint', label: 'ESLint output', command: 'npm run lint' },
    ],
  },

  lenses: {
    // Point a built-in lens at the repository's own conventions skill.
    security: { skill: 'security' },

    // Switch a built-in off.
    ci: false,

    // Add a lens of the repository's own, into an existing bundle.
    'api-routes': {
      skill: 'api-routes',
      route: { paths: [/^src\/app\/api\/.*\/route\.ts$/] },
      judges:
        'Route handlers as thin adapters — auth, validation and the response envelope, with no business logic.',
      bundle: 'correctness',
    },
  },

  // Reword any prompt paragraph in the repository's own terms.
  prompts: {
    layerChain: 'route -> service -> data access',
  },
};
