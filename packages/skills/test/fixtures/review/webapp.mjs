// ============================================================================
// Review Config — Web app
// ============================================================================
//
// A fictional bookings web app with a full review roster: 30 lenses, bundles
// with splits, prepass tools and roster notes. Used by the tests.

export default {
  files: {
    code: /\.(ts|tsx|js|mjs)$/,
    tests: /(\.test\.tsx?|\.spec\.ts|\.stories\.tsx)$|e2e\//,
    targetExtensions: ['ts', 'tsx', 'sql', 'md'],
  },
  prepass: {
    tools: [
      {
        key: 'tsc',
        label: 'TypeScript errors',
        command: 'npx tsc --noEmit',
      },
      {
        key: 'lint',
        label: 'ESLint output',
        command: 'npm run lint',
      },
    ],
    graph: {
      sources: /\.tsx?$/,
      searchGlobs: ['*.ts', '*.tsx', '*.js', '*.mjs'],
    },
  },
  lenses: {
    bugs: {
      skill: null,
      route: { always: 'code' },
      judges:
        'Logic errors, off-by-one, wrong operator, unhandled branch, races, broken invariants.',
    },
    'error-handling': {
      skill: 'error-handling',
      route: { always: 'code' },
      judges:
        'The whole failure path from query to UI: swallowed errors, an error reported twice or not at all, the wrong error shape for the layer.',
    },
    observability: {
      skill: 'observability',
      route: { always: 'code' },
      judges:
        'How an event is recorded: log fields, levels, noise, and user data kept out of logs.',
    },
    security: {
      skill: 'security',
      route: {
        always: 'code',
        paths: [/^db\/migrations\//, /\.sql$/],
      },
      judges:
        'Missing authorisation, injection, unvalidated input, secret handling, data exposure.',
    },
    authentication: {
      skill: 'authentication',
      route: {
        paths: [/^src\/server\/auth\//, /^src\/middleware\.ts$/],
        judgment:
          'fires on the auth module already. ADD it if any file under review checks a session, a role or an ownership relationship.',
      },
      judges:
        'Sessions checked before anything else, ownership checked through the shared helpers, never inlined.',
    },
    performance: {
      skill: 'performance',
      route: { always: 'code' },
      judges:
        'Work done per item that could be done once: N+1 queries, sequential awaits, unbounded reads, needless re-renders.',
    },
    codebase: {
      skill: 'codebase',
      route: {
        judgment:
          'pure judgment, never routed. ADD it if the target adds a module, moves a file, or imports across a module boundary.',
      },
      judges: 'Which folder code belongs in, module boundaries and exports.',
    },
    dry: {
      skill: 'dry',
      route: { always: 'codeOrDocs' },
      judges:
        'Does this already exist, and is it duplicated knowledge rather than duplicated shape.',
      title: 'DRY',
    },
    readability: {
      skill: 'readability',
      route: { always: 'codeOrDocs' },
      judges: 'File size, naming, nesting depth, entry point first.',
    },
    typing: {
      skill: 'typing',
      route: { always: 'code' },
      judges: '`any` and unsafe casts, types that drift from the schema.',
    },
    comments: {
      skill: 'comments',
      route: { always: 'codeOrDocs' },
      judges: 'Comments and docs that are missing, bloated or wrong.',
    },
    'dead-code': {
      skill: 'dead-code',
      route: { always: 'code' },
      judges:
        'Unreachable branches, unused params, orphaned exports. Treat the dead-code report as evidence, not a verdict.',
    },
    'api-routes': {
      skill: 'api-routes',
      route: { paths: [/^src\/routes\/api\/.*\.ts$/] },
      judges:
        'Route handlers as thin HTTP adapters: guard order, status codes, the response shape, no business logic.',
      title: 'API Routes',
    },
    services: {
      skill: 'services',
      route: { paths: [/^src\/server\/[^/]+\/services\/.*\.tsx?$/] },
      judges:
        'One service per operation, no HTTP, typed results, no pass-through services.',
    },
    'data-access': {
      skill: 'data-access',
      route: { paths: [/\/queries\/.*\.tsx?$/] },
      judges:
        'One question per query function, no throwing, no business rules, narrow return types.',
      title: 'Data Access',
    },
    'feature-flags': {
      skill: 'feature-flags',
      route: {
        paths: [/^src\/flags\//],
        judgment:
          'fires on the flag definitions already. ADD it if a flag is read or removed anywhere under review.',
      },
      judges: 'Flags resolved on the server and passed down, never read twice.',
    },
    database: {
      skill: 'database',
      route: { paths: [/^db\/migrations\/.*\.sql$/, /\.sql$/] },
      judges:
        'A migration read as a migration: locking, expand and contract, constraints, indexes for real queries.',
    },
    'backwards-compat': {
      skill: null,
      route: {
        paths: [/^db\/migrations\//, /^src\/routes\/api\//],
        judgment:
          'fires on migrations and API routes already. ADD it if a public export changed its name or shape.',
      },
      judges:
        'Diff-only. Does this break the code that is deployed now? Old and new code run together during a deploy.',
      title: 'Backwards Compatibility',
    },
    frontend: {
      skill: 'frontend',
      route: { paths: [/\.tsx$/, /\/hooks\/.*\.tsx?$/] },
      judges:
        'Client conventions: page structure, data fetching, cache invalidation, loading states. NOT error surfaces, which `error-handling` owns.',
    },
    'react-correctness': {
      skill: null,
      route: { paths: [/\.tsx$/] },
      judges:
        'Effect dependencies, stale closures, state derived in an effect, unstable keys.',
      title: 'React Correctness',
    },
    accessibility: {
      skill: 'accessibility',
      route: { paths: [/\.tsx$/] },
      judges:
        'WCAG 2.2 AA: semantics, names, keyboard and focus, forms, contrast.',
    },
    'unit-testing': {
      skill: 'unit-testing',
      route: {
        paths: [/\.test\.tsx?$/],
        coverage: [/^src\/.*\.ts$/],
      },
      judges:
        'Mock only the layer below, one concept per test, every branch covered.',
    },
    'integration-testing': {
      skill: 'integration-testing',
      route: {
        paths: [/\.integration\.test\.ts$/],
        coverage: [/\/queries\/.*\.ts$/, /\/services\/.*\.ts$/],
      },
      judges:
        'A real database, per-file seeding and cleanup, assertions on outcomes.',
    },
    'api-testing': {
      skill: 'api-testing',
      route: {
        paths: [/\.api\.test\.ts$/],
        coverage: [/^src\/routes\/api\/.*\.ts$/],
      },
      judges:
        'Only the auth boundary mocked, status and body asserted, each route covered for auth, validation, success and failure.',
      title: 'API Testing',
    },
    'e2e-testing': {
      skill: 'e2e-testing',
      route: {
        paths: [/e2e\//],
        coverage: [/^src\/routes\/(bookings|account|admin)\//],
      },
      judges:
        'Spec-owned data, page objects, web-first assertions, parallel safety.',
      title: 'E2E Testing',
    },
    storybook: {
      skill: 'storybook',
      route: {
        paths: [/\.stories\.tsx$/],
        coverage: [/\/components\/.*\.tsx$/],
      },
      judges: 'The states a component owes, story anatomy, mocking boundary.',
    },
    'system-prompts': {
      skill: 'system-prompts',
      route: { paths: [/\/prompts\//] },
      judges: 'Prompt structure, clear constraints, token budget.',
      title: 'System Prompts',
    },
    'agent-tooling': {
      skill: 'agent-tooling',
      route: { paths: [/\/tools\/.*\.tsx?$/] },
      judges:
        'Tool naming and granularity, clear descriptions, confirmation for risky actions.',
      title: 'Agent Tooling',
    },
    'claude-skills': {
      skill: 'claude-skills',
      route: { paths: [/^\.claude\/skills\//, /^\.claude\/agents\//] },
      judges: 'Skill file shape, description quality, directory placement.',
      title: 'Claude Skills',
    },
    'github-actions': {
      skill: 'github-actions',
      route: { paths: [/^\.github\/workflows\/.*\.ya?ml$/] },
      judges: 'Job graph, required checks, caching, legible PR checks.',
      title: 'GitHub Actions',
    },
    testing: false,
    ci: false,
  },
  bundles: [
    {
      key: 'correctness',
      title: 'Correctness',
      scope: 'target',
      model: 'opus',
      lenses: ['bugs', 'error-handling', 'observability'],
      split: [
        { lenses: ['bugs'], model: 'opus' },
        { lenses: ['error-handling', 'observability'], model: 'opus' },
      ],
    },
    {
      key: 'security',
      title: 'Security',
      scope: 'target',
      model: 'opus',
      lenses: ['security', 'authentication'],
    },
    {
      key: 'performance',
      title: 'Performance',
      scope: 'target',
      model: 'opus',
      lenses: ['performance'],
    },
    {
      key: 'craft',
      title: 'Craft',
      scope: 'target',
      model: 'opus',
      lenses: [
        'codebase',
        'dry',
        'readability',
        'typing',
        'comments',
        'dead-code',
      ],
      split: [
        {
          lenses: ['codebase', 'dry', 'readability', 'dead-code'],
          model: 'opus',
        },
        { lenses: ['typing', 'comments'], model: 'sonnet' },
      ],
    },
    {
      key: 'server-layers',
      title: 'Server Layers',
      scope: 'slice',
      model: 'opus',
      lenses: ['api-routes', 'services', 'data-access', 'feature-flags'],
    },
    {
      key: 'database',
      title: 'Database',
      scope: 'slice',
      model: 'opus',
      lenses: ['database', 'backwards-compat'],
    },
    {
      key: 'frontend',
      title: 'Frontend',
      scope: 'slice',
      model: 'opus',
      lenses: ['frontend', 'react-correctness', 'accessibility'],
      split: [
        { lenses: ['frontend', 'react-correctness'], model: 'opus' },
        { lenses: ['accessibility'], model: 'sonnet' },
      ],
    },
    {
      key: 'tests-server',
      title: 'Server Tests',
      scope: 'slice',
      model: 'sonnet',
      lenses: ['unit-testing', 'integration-testing', 'api-testing'],
    },
    {
      key: 'tests-ui',
      title: 'UI Tests',
      scope: 'slice',
      model: 'sonnet',
      lenses: ['e2e-testing', 'storybook'],
    },
    {
      key: 'agents',
      title: 'Agent Code',
      scope: 'slice',
      model: 'sonnet',
      lenses: ['system-prompts', 'agent-tooling', 'claude-skills'],
    },
    {
      key: 'ci',
      title: 'CI',
      scope: 'slice',
      model: 'sonnet',
      lenses: ['github-actions'],
    },
  ],
  splitOrder: ['craft', 'correctness', 'frontend'],
  prompts: {
    fileRoles:
      'route handler, service, query, component, page, hook, type, migration, test, story, config',
    neighbours:
      'the existing tests, the stories, and the migrations for any table it queries',
    removalExample:
      'a `.tsx` that renders no interactive or text content firing `accessibility`',
    concernExample:
      'this query runs once per booking instead of once for the list',
    toolCost: '`tsc` over the whole app',
    databaseReading: 'the migrations for the affected tables',
    coverageUnits:
      'new functions, branches, error paths, edge cases, UI states',
    coverageLocation: 'the test or story file beside the code',
    coverageExamples:
      '"no integration test for createBooking", "no story for BookingCard error state"',
    coverageSeverity:
      'an untested error path on a write is high, a missing cosmetic story is low',
    whyItMatters:
      'the failed request, the wrong total on screen, the booking a member can see but should not',
    coverageFiles:
      '`*.test.ts`, `*.integration.test.ts`, `*.api.test.ts`, `e2e/**/*.spec.ts`, a sibling `*.stories.tsx`',
    errorIdentifier: 'error code',
    authCheck: 'middleware or a wrapping service',
    deadCodeReferences:
      'dynamic references, re-exports, string-keyed lookups and tests',
    blastRadius:
      'data — row counts, flag defaults, whether a write path exists',
  },
  rosterNotes:
    "#### Where the overlapping lenses stop\n\n- `dry` leaves dead branches to `dead-code` and naming to `readability`\n- `database` reads a migration as a migration; `security` and `performance`\n  only glance at it\n- `react-correctness` judges React itself; `frontend` judges this app's\n  conventions\n- `error-handling` owns **where** a failure is reported; `observability`\n  owns **how** it is written\n- **Overlap between bundles is expected.** The dedup step handles collisions",
};
