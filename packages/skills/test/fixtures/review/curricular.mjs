// ============================================================================
// Curricular Review Config
// ============================================================================
//
// Curricular's code review as it ran before moving into this package. Used by
// the tests, and copied to `.devkit/code-review.mjs` when Curricular adopts it.

export default {
  files: {
    code: /\.(ts|tsx|js|mjs)$/,
    tests: /(\.test\.tsx?|\.spec\.ts|\.stories\.tsx)$|__e2e__\//,
    targetExtensions: ['ts', 'tsx', 'sql', 'md'],
  },
  prepass: {
    tools: [
      {
        key: 'tsc',
        label: 'TypeScript errors',
        command: 'npx -w apps/main tsc --noEmit',
      },
      {
        key: 'lint',
        label: 'ESLint output',
        command: 'npm run lint',
      },
      // Knip is a dependency of apps/main, so it runs as that workspace.
      {
        key: 'knip',
        command: 'npx --no-install knip --workspace apps/main --reporter json',
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
      route: {
        always: 'code',
      },
      judges:
        'Logic errors, off-by-one, wrong operator, unhandled branch, races, incorrect state transitions, broken invariants.',
    },
    'error-handling': {
      skill: 'error-handling',
      route: {
        always: 'code',
      },
      judges:
        'The WHOLE failure path as one chain — data access up through service, route, and the UI surface. Swallowed errors, an error reported at two layers or at none, wrong error shape for the layer, thrown-vs-returned mismatch, a message that leaks schema, the wrong UI surface for the failure, an expected DB error treated as an incident. NOT how an event is recorded: `observability` owns the channel, the attributes and the Issue-vs-log choice.',
    },
    observability: {
      skill: 'observability',
      route: {
        always: 'code',
      },
      judges:
        'How an event is RECORDED, both channels. Sentry: identity set anywhere but the isolation scope, `orgId`/`role` given only an attribute or only a tag, a client sign-out that never clears the user, filterable dimensions buried in `extra`, a log line missing `feature`/`operation`/`outcome`, values interpolated into a message instead of attributes, an `info` line on a pure read or per data-access call, a failure sent as BOTH `captureException` and `logger.error`, an expected failure raised as an Issue, user content or a request body in any channel, an unwrapped Server Action, a Supabase client factory with no `supabaseIntegration`, `sendOperationData` left to its default. `debug` package: orphaned `->` with no `<-`, logging inside a loop, a missing `#region debug` wrapper, `console.*` anywhere under `src/`, truncated UUIDs.',
    },
    security: {
      skill: 'security',
      route: {
        always: 'code',
        paths: [/^supabase\/migrations\//, /\.sql$/],
      },
      judges:
        'Follow the review decision tree in the skill. AuthZ gaps and BOLA, injection, unvalidated input, secret handling, RLS and grant assumptions, org scoping, data exposure, file upload and storage paths, rate limiting, supply-chain patterns in config files.',
    },
    authentication: {
      skill: 'authentication',
      route: {
        paths: [
          /^apps\/main\/src\/lib\/auth\//,
          /\/_auth\//,
          /^apps\/main\/src\/middleware\.ts$/,
        ],
        judgment:
          'fires on `lib/auth/**`, `_auth/**` and `middleware.ts` already. ADD it if any file under review checks a session, a JWT claim, a role, or an ownership relationship anywhere else.',
      },
      judges:
        'Whether the auth helpers are used the way the module intends — `authenticateFromRequest` first, ownership through `authenticateAndAuthorize*` rather than inlined, collection routes scoped by user id, `useAuthenticatedFetch` on the client.',
    },
    performance: {
      skill: 'performance',
      route: {
        always: 'code',
      },
      judges:
        'One idea in four disguises — work done per item that could be done once for the set. N+1 in a data-access function, sequential awaits in a service, uncapped fan-out, a re-render loop in a table. Plus unbounded list reads, `select("*")`, reflexive memo, bundle weight, and anything cached server-side.',
    },
    codebase: {
      skill: 'codebase',
      route: {
        judgment:
          'pure judgment, never routed. ADD it if the target adds or moves a barrel export, creates a `_`-prefixed directory, imports across a module boundary, or adds or relocates a hook, type or schema. Judge by what you read, NOT by path: editing a function body inside `lib/features/` is not a codebase concern.',
      },
      judges:
        'WHICH TREE code belongs in — the reach test, barrel surfaces, module boundaries, cross-feature imports of a private directory, hook tier, route placement, the closed `_`-prefixed vocabulary.',
    },
    dry: {
      skill: 'dry',
      route: {
        always: 'codeOrDocs',
      },
      judges:
        'Three questions only: does this already exist, is it duplicated knowledge rather than duplicated shape, is it at the right altitude.',
      title: 'DRY',
    },
    readability: {
      skill: 'readability',
      route: {
        always: 'codeOrDocs',
      },
      judges:
        'File size and splitting, entry-point-first composition, where a file sits in the tree, the naming vocabulary, nesting depth.',
    },
    typing: {
      skill: 'typing',
      route: {
        always: 'code',
      },
      judges:
        '`any` and unsafe casts, drift from DB-canonical types, a hand-written interface mirroring a table, a schema paired with a hand-written type, weak generics, view models that only rename keys.',
    },
    comments: {
      skill: 'comments',
      route: {
        always: 'codeOrDocs',
      },
      judges:
        'File headers, JSDoc, logic comments, README accuracy — judged in BOTH directions, missing AND bloated. Caps: file header 8 lines, JSDoc 4 prose lines, logic comment 1. Two banned habits: a comment block opening a function instead of one-liners at each decision point, and a JSDoc body narrating the implementation.',
    },
    'dead-code': {
      skill: 'dead-code',
      route: {
        always: 'code',
      },
      judges:
        'Unreachable branches, unused params, orphaned exports, stale barrel entries. A knip report is in the tool reports — treat it as evidence, not a verdict, and apply the standing false positives from the skill. The generated import graph lists every export with no call site outside its own file; that is a lead, not a verdict.',
    },
    'api-routes': {
      skill: 'api-routes',
      route: {
        paths: [/^apps\/main\/src\/app\/api\/.*\/route\.ts$/],
      },
      judges:
        'Route handlers as HTTP adapters — the five responsibilities, guard-clause order (hand-written: path shape, auth, rate limit, validation, delegate; declared with route(): flag, auth, access, rate limit, params, resource, query/body), the response envelope, status choice, and no business logic.',
      title: 'API Routes',
    },
    services: {
      skill: 'services',
      route: {
        paths: [/\/_services\/.*\.tsx?$/],
      },
      judges:
        'One service per business operation, no HTTP anywhere, no raw Supabase queries, typed result shapes, and whether the service should exist at all rather than being a pass-through.',
    },
    'data-access': {
      skill: 'data-access',
      route: {
        paths: [/\/_data-access\/.*\.tsx?$/],
      },
      judges:
        'One question per function, never throws, returns `{ data, error }`, no ownership checks or branching on data values, no DAF calling another DAF, CRUD verb naming, narrowed return types.',
      title: 'Data Access',
    },
    'feature-flags': {
      skill: 'feature-flags',
      route: {
        paths: [
          /^apps\/main\/src\/lib\/feature-flags\//,
          /^apps\/main\/src\/app\/\.well-known\/vercel\/flags\//,
        ],
        judgment:
          'fires on the flag definitions already. ADD it if a flag is being READ, passed as a prop, or removed anywhere under review.',
      },
      judges:
        'Flags resolved server-side and passed down as `<key>Flag` props, never read in a client component, and a dark feature answering 404 before it authenticates.',
    },
    database: {
      skill: 'database',
      route: {
        paths: [/^supabase\/migrations\/.*\.sql$/, /\.sql$/],
      },
      judges:
        'A migration read as a migration — atomicity and `lock_timeout`, expand/backfill/contract where the change breaks running code, RLS enabled with real policies, every write policy carrying `WITH CHECK`, explicit grants, `ON DELETE` on every foreign key, indexes only for queries that exist.',
    },
    'backwards-compat': {
      skill: null,
      route: {
        paths: [
          /^supabase\/migrations\//,
          /^apps\/main\/src\/app\/api\/.*\/route\.ts$/,
        ],
        judgment:
          'fires on migrations and API routes already. ADD it if a public export in a barrel changed its name, its shape, or its meaning.',
      },
      judges:
        'Diff-only. Does this break the code that is currently deployed? Migrations against populated tables, response-shape changes on a live API, removed or renamed exports a caller outside this branch still uses. Old and new code run together for the length of a deploy.',
      title: 'Backwards Compatibility',
    },
    frontend: {
      skill: 'frontend',
      route: {
        paths: [
          /\.tsx$/,
          /^apps\/main\/src\/lib\/queryKeys\.ts$/,
          /\/_hooks\/.*\.tsx?$/,
        ],
      },
      judges:
        "Project conventions for the client — page and shell structure, the RSC boundary, providers and gates, query keys from the central factory, invalidation, prefetch, skeletons. NOT error surfaces: `error-handling` owns the whole failure path including this layer's part of it, so leave toasts, `PageErrorState` and 401 handling alone.",
    },
    'react-correctness': {
      skill: null,
      route: {
        paths: [/\.tsx$/],
      },
      judges:
        "React's own rules, not project convention: effect dependencies, stale closures, state derived in an effect instead of computed, unstable keys, state updates during render.",
      title: 'React Correctness',
    },
    accessibility: {
      skill: 'accessibility',
      route: {
        paths: [/\.tsx$/],
      },
      judges:
        'WCAG 2.2 AA — semantics and accessible naming, keyboard and focus, forms and errors, contrast and motion, live regions. This lens also owns what users see, since visual design has no other written conventions.',
    },
    'unit-testing': {
      skill: 'unit-testing',
      route: {
        paths: [/\.test\.tsx?$/],
        coverage: [/^apps\/main\/src\/.*\.ts$/],
      },
      judges:
        'Mock only the layer below, AAA structure, one assertion concept per test, every discriminated-union branch covered, no testing of mock wiring or third-party libraries.',
    },
    'integration-testing': {
      skill: 'integration-testing',
      route: {
        paths: [/\.integration\.test\.ts$/],
        coverage: [/\/_data-access\/.*\.ts$/, /\/_services\/.*\.ts$/],
      },
      judges:
        'Real database, per-file seeding and cleanup, unique identifiers, no assumption of an empty database, assertions on observable outcomes rather than the query.',
    },
    'api-testing': {
      skill: 'api-testing',
      route: {
        paths: [/\.api\.test\.ts$/],
        coverage: [/^apps\/main\/src\/app\/api\/.*\/route\.ts$/],
      },
      judges:
        'Only the auth seam mocked (`authenticateFromRequest` for legacy routes, `resolvePrincipal` for routes on route()), status plus envelope asserted, seeded data, isolation, and per-route coverage of the auth/validation/success/failure quadrants.',
      title: 'API Testing',
    },
    'e2e-testing': {
      skill: 'e2e-testing',
      route: {
        paths: [/__e2e__\//],
        coverage: [/^apps\/main\/src\/app\/(teacher|student|admin|\(auth\))\//],
      },
      judges:
        'Seed and spec pairing, page objects, web-first assertions, parallel safety (spec-owned data only, no global counts, no row-order dependence), and the mocking boundary.',
      title: 'E2E Testing',
    },
    storybook: {
      skill: 'storybook',
      route: {
        paths: [/\.stories\.tsx$/],
        coverage: [/\/_components\/.*\.tsx$/, /\/(page|shell)\.tsx$/],
      },
      judges:
        'Page-level stories only, the state matrix a page owes (empty, populated, loading, error, dialogs, form states), CSF3 anatomy, and mocking at the right boundary.',
    },
    'system-prompts': {
      skill: 'system-prompts',
      route: {
        paths: [/\/_prompts\//, /[Ss]ystemPrompt[^/]*\.tsx?$/],
      },
      judges:
        'Section order, instruction design, measurable constraints, positive framing, and the token budget of any prompt string.',
      title: 'System Prompts',
    },
    'agent-tooling': {
      skill: 'agent-tooling',
      route: {
        paths: [/\/_tools\/.*\.tsx?$/, /\/agent\/.*\.tsx?$/],
      },
      judges:
        'Tool naming and granularity, description completeness, no overlap between tools, safety and confirmation for risky actions, error recovery.',
      title: 'Agent Tooling',
    },
    'claude-skills': {
      skill: 'claude-skills',
      route: {
        paths: [/^\.claude\/skills\//, /^\.claude\/agents\//],
      },
      judges:
        'Skill and sub-agent file shape, description budget and routing quality, directory placement directly under `.claude/skills/`, and the preprocessor `cat` lines resolving.',
      title: 'Claude Skills',
    },
    'github-actions': {
      skill: 'github-actions',
      route: {
        paths: [/^\.github\/workflows\/.*\.ya?ml$/],
      },
      judges:
        'Workflow naming, job graph and gate jobs, required status checks, matrix rendering, caching, and keeping the PR checks UI legible.',
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
        {
          lenses: ['bugs'],
          model: 'opus',
        },
        {
          lenses: ['error-handling', 'observability'],
          model: 'opus',
        },
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
        {
          lenses: ['typing', 'comments'],
          model: 'sonnet',
        },
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
        {
          lenses: ['frontend', 'react-correctness'],
          model: 'opus',
        },
        {
          lenses: ['accessibility'],
          model: 'sonnet',
        },
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
      'route handler, service, data-access function, barrel, component, page, hook, type or schema, migration, agent tool, prompt, test, story, config',
    neighbours:
      "the sibling barrel, the existing tests, the stories, the migrations and RLS policies on any table it queries, the feature's `_errors/` registry",
    removalExample:
      'a `.tsx` that renders no interactive or text content firing `accessibility`',
    concernExample:
      'this data-access function fans out one query per row instead of a single IN clause',
    toolCost: '`tsc` over this monorepo',
    databaseReading:
      'the migrations and the RLS policies on the affected tables',
    coverageUnits:
      'new functions, branches, error paths, edge cases, UI states',
    coverageLocation:
      'the corresponding test or story files at their conventional locations',
    coverageExamples:
      '"no integration test for createRoom DAF", "createRoom error branch untested", "no story for RoomCard error state"',
    coverageSeverity:
      'an untested error path on a mutation is high, a missing cosmetic variant story is low',
    whyItMatters:
      'the failed request, the wrong number on screen, the row a student can read but should not',
    coverageFiles:
      '`*.test.ts`, `*.integration.test.ts`, `*.api.test.ts`, `__e2e__/**/*.spec.ts`, a sibling `*.stories.tsx`',
    errorIdentifier: 'issue key',
    authCheck: 'middleware, an RLS policy or a wrapping service',
    deadCodeReferences:
      'dynamic references, barrels, string-keyed lookups and tests',
    blastRadius:
      'data — row counts, feature-flag defaults, whether a write path even exists',
  },
  rosterNotes:
    '#### Two structural notes\n\n**`layer-boundaries` is not a lens.** It used to be, because six layer agents\neach saw one layer and nobody saw the chain. `server-layers` loads that skill\nset by construction, so a crossing — business logic in a data-access function, a\nSupabase query in a route, a service importing the client barrel, authorization\ndecided at the wrong layer — is something the bundle notices, not a seventh\nagent re-reading everything the other six read.\n\n**`error-handling` stays whole**, despite chapters named `3-frontend`, `4-api`,\n`5-services` and `6-data-access`. Splitting it by layer would be wrong and both\nends of the repo say so in the same words: `error-handling/1-START-HERE.md` —\n"there is one place to read the whole failure path" — and\n`frontend/1-START-HERE.md`, which hands its own error surfaces over "alongside\nthe other layers, so the whole failure path reads in one place". So\n`correctness` traces data access → service → route → toast as one chain, and the\n`frontend` lens is told explicitly that it does **not** judge error surfaces.\n\n#### Where the overlapping lenses stop\n\n- `dry` leaves dead branches to `dead-code`, magic values and misplaced\n  responsibility to `readability`, repeated prose to `comments` — and a\n  "merge these two" finding must argue same knowledge, not merely same shape\n- `codebase` owns **which tree** a file belongs in; `readability` owns **where\n  inside that tree** and what it is called; `dry` owns **which rung** a shared\n  thing sits on\n- `database` reads a migration as a migration, which `security` (glancing at a\n  policy) and `performance` (at a missing index) do not\n- `performance` owns what an RLS predicate **costs**; `database` owns what it\n  **says**\n- `react-correctness` judges React itself — effect dependencies, stale closures,\n  state derived in an effect, keys, updates during render. `frontend` judges\n  this project\'s conventions: page structure, the RSC boundary, query keys,\n  invalidation, skeletons\n- Visual design has no written conventions any more, so what users see belongs\n  to `accessibility`\n- **There is no `gdpr` lens.** Personal data splits between `security` (who can\n  read the row) and `database` (retention, cascade, what the column holds)\n- `error-handling` owns **whether a failure is reported at the right layer and\n  in the right shape**; `observability` owns **how that report is written** —\n  which Sentry product, which channel each fact goes in, what the log line\n  carries. One failure logged at both the service and the route is\n  `error-handling`; the same failure sent as an exception *and* a `logger.error`\n  is `observability`\n- **Overlap between bundles is expected.** `security` and `server-layers` will\n  both look at an auth check. The dedup step handles collisions, and two agents\n  reaching the same conclusion is signal',
};
