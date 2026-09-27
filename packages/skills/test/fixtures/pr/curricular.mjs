// ============================================================================
// PR Config — Curricular
// ============================================================================
//
// The PR config that reproduces Curricular's `pull-requests` skill: its
// layers, the Frontend and Storybook sections, the Supabase boot and the
// stacked-branch base. Copied to `.devkit/pr.mjs` when Curricular adopts the
// package.

export default {
  base: 'stack',

  layers: [
    {
      key: 'dataModel',
      title: 'Data Model',
      paths: [/(^|\/)supabase\/migrations\//],
      section: 'backend',
    },
    {
      key: 'dataAccess',
      title: 'Data Access',
      paths: [/lib\/features\/[^/]+\/services\/_data-access\//],
      section: 'backend',
    },
    {
      key: 'service',
      title: 'Service',
      paths: [/lib\/features\/[^/]+\/services\/(?!_data-access\/)/],
      section: 'backend',
    },
    { key: 'api', title: 'API', paths: [/\/app\/api\//], section: 'backend' },
    {
      key: 'frontend',
      title: 'Frontend',
      paths: [
        // Every route folder under app/, grouped or not, apart from the API.
        /\/src\/app\/(?!api\/)/,
        /\/_hooks\//,
        /\/elements\//,
        /\/_components\//,
        /\.stories\.tsx$/,
      ],
      section: 'frontend',
    },
  ],

  sections: {
    backend: {
      tools:
        'SQL, curl with a bearer token, psql catalog reads, migration behaviour',
      scope: `Scope: migrations, data-access functions, services, API routes, jobs.
Cover status codes, response shapes, grants/RLS, side effects, deleted
behaviour (a removed export or route is an entry — what can no longer happen).`,
      gapExamples: 'needs load, needs prod',
    },
    frontend: {
      title: 'Human Frontend Checks',
      label: 'Frontend',
      where: 'a rendered page',
      audience: 'a signed-in user',
      surface:
        'a page and its route, or a dialog, card or section and the page and state it appears in',
      surfacesBrief:
        'Trace shared components through their importers (`grep -rl "ComponentName" apps/main/src --include=*.tsx`) — a changed component used on N pages is N surfaces.',
      inventoryBrief: `Scope: every user-visible surface — use the surface list below and verify
it against the diff. Each render site of a changed component is its own entry.
Include copy changes, empty/error/loading states, and interactions.`,
      firstStep:
        'signing in: name the ONE seeded account (email, the shared local seed password, role — read `supabase/seed*` for real values) that covers every page in the section; a second account is introduced in the step that first needs it',
      stepNames: 'the platform and route',
      coveredBy: 'an e2e spec or a story play function',
    },
  },

  actors: ['teacher', 'student', 'school admin', 'super admin'],

  dimensions: {
    authorisation: 'roles who must be REJECTED, not just allowed',
    tenancy: 'org-scoped data needs a cross-organisation negative',
    concurrency: 'two tabs, two users',
    'production parity': 'dev versus `npm run build`',
    accessibility: 'keyboard and screen reader for new interactive UI',
    configuration: false,
  },

  verify: {
    preconditions: ['cookies versus bearer'],
    identifiers: ['story title', 'story export'],
  },

  boot: {
    start: [
      `docker ps --filter "name=supabase_db_" --format '{{.Names}}\\t{{.Status}}'`,
      'npm run supabase:start',
      "npm run supabase:reset   # re-runs migrations + seed, so THIS branch's migration applies",
      'npm run dev',
    ],
    stop: 'npm run supabase:stop',
    variables: {
      PORT: 'the dev server port; the scripts resolve the right worktree, so no explanation of why',
      DB_CONTAINER: {
        from: 'the Supabase database container',
        backendOnly: true,
      },
      TOKEN: {
        from: 'minted for the seeded teacher account: find it and the shared password in supabase/seed*, and the token-minting shape this repo uses',
        backendOnly: true,
      },
    },
    read: ['supabase/seed*', 'supabase/seed/**', 'apps/main/.env.example'],
  },

  tests: [/\.test\.tsx?$/, /\.spec\.tsx?$/, /\.stories\.tsx$/],

  storybook: true,

  localCi: [
    'Review agents (run locally before merge)',
    'Full test suite passes (unit, integration, API, e2e — run locally)',
  ],
  localCiNote:
    'Storybook tests are dispatch-only: `gh workflow run pr-main.yml --ref {{branch}}`.',

  prompts: {
    testKinds:
      'unit, integration, .api.test.ts, e2e specs, story play functions',
    auditCallers:
      'every render site of every changed component, and every importer of changed code',
    bootCaveats: 'a feature flag forced on under dev, a prod-build divergence',
    gating: 'feature flags gating the touched routes',
  },
};
