// ============================================================================
// PR Config — Web app
// ============================================================================
//
// A fictional bookings web app with every PR feature switched on: layered
// backend paths, a browser section, Storybook, a database boot with
// backend-only variables, a stop command, Local CI and the stacked-branch base.

export default {
  base: 'stack',

  layers: [
    {
      key: 'dataModel',
      title: 'Data Model',
      paths: [/(^|\/)db\/migrations\//],
      section: 'backend',
    },
    {
      key: 'dataAccess',
      title: 'Data Access',
      paths: [/server\/[^/]+\/queries\//],
      section: 'backend',
    },
    {
      key: 'service',
      title: 'Service',
      paths: [/server\/[^/]+\/(?!queries\/)/],
      section: 'backend',
    },
    {
      key: 'api',
      title: 'API',
      paths: [/\/routes\/api\//],
      section: 'backend',
    },
    {
      key: 'frontend',
      title: 'Frontend',
      paths: [
        // Every page route apart from the API.
        /\/src\/routes\/(?!api\/)/,
        /\/hooks\//,
        /\/components\//,
        /\.stories\.tsx$/,
      ],
      section: 'frontend',
    },
  ],

  sections: {
    backend: {
      tools: 'SQL, curl with a bearer token, schema reads',
      scope: `Scope: migrations, queries, services, API routes, jobs.
Cover status codes, response shapes, permissions and side effects.`,
      gapExamples: 'needs load, needs prod',
    },
    frontend: {
      title: 'Human Browser Checks',
      label: 'Frontend',
      where: 'a rendered page',
      audience: 'a signed-in member',
      surface: 'a page and its route, or a dialog and the page it opens from',
      surfacesBrief:
        'Trace shared components through their importers — a changed component used on N pages is N surfaces.',
      inventoryBrief: `Scope: every user-visible surface. Each render site of a changed
component is its own entry. Include copy, empty, error and loading states.`,
      firstStep:
        'signing in: name the ONE seeded account (email, password, role — read `db/seed*`) that covers every page in the section',
      stepNames: 'the page and route',
      coveredBy: 'an e2e spec or a story play function',
    },
  },

  actors: ['member', 'staff', 'admin', 'owner'],

  dimensions: {
    authorisation: 'roles who must be REJECTED, not just allowed',
    tenancy: 'venue-scoped data needs a cross-venue negative',
    concurrency: 'two tabs, two members',
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
      'npm run db:start',
      "npm run db:reset   # re-runs migrations + seed, so THIS branch's migration applies",
      'npm run dev',
    ],
    stop: 'npm run db:stop',
    variables: {
      PORT: 'the dev server port',
      DB_CONTAINER: {
        from: 'the database container',
        backendOnly: true,
      },
      TOKEN: {
        from: 'minted for the seeded member account in db/seed*',
        backendOnly: true,
      },
    },
    read: ['db/seed*', 'db/seed/**', '.env.example'],
  },

  tests: [/\.test\.tsx?$/, /\.spec\.tsx?$/, /\.stories\.tsx$/],

  storybook: true,

  localCi: [
    'Review agents (run locally before merge)',
    'Full test suite passes (unit, integration, e2e — run locally)',
  ],
  localCiNote:
    'Storybook tests run on demand: `gh workflow run storybook.yml --ref {{branch}}`.',

  prompts: {
    testKinds: 'unit, integration, e2e specs, story play functions',
    auditCallers:
      'every render site of every changed component, and every importer of changed code',
    bootCaveats: 'a feature flag forced on under dev, a prod-build divergence',
    gating: 'feature flags gating the touched routes',
  },
};
