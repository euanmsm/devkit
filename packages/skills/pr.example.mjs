// ============================================================================
// PR Config
// ============================================================================
//
// Copy to `.devkit/pr.mjs`. Only `layers` is required; everything else has a
// generic default described in docs/pr.md.

export default {
  // Changed paths sorted into layers; each layer switches its section on.
  layers: [
    {
      key: 'dataModel',
      title: 'Data Model',
      paths: ['migrations/'],
      section: 'backend',
    },
    {
      key: 'api',
      title: 'API',
      paths: [/^src\/app\/api\//],
      section: 'backend',
    },
    {
      key: 'frontend',
      title: 'Frontend',
      paths: [/^src\/app\/(?!api\/)/, 'src/components/'],
      section: 'frontend',
    },
  ],

  // The sections a person runs; the backend section is built in.
  sections: {
    frontend: {
      title: 'Human Frontend Checks',
      where: 'a rendered page',
      audience: 'a signed-in user',
      surface: 'a page and its route, and the state it must be in',
      firstStep: 'signing in as the one seeded account that reaches every page',
      stepNames: 'the page and route',
      coveredBy: 'a Playwright spec',
      // Optional: splits the section in two. Steps an agent can run with
      // Claude in Chrome go under this heading; only steps that need a
      // person's judgement stay under the title above.
      // agent: { title: 'Agent-Runnable Frontend Checks' },
    },
  },

  actors: ['member', 'admin', 'API caller'],

  // Cross-cutting questions added to the built-ins.
  dimensions: {
    tenancy:
      'data scoped to one organisation needs a cross-organisation negative',
  },

  boot: {
    start: ['docker compose up -d', 'npm run db:migrate', 'npm run dev'],
    stop: 'docker compose down',
    variables: {
      PORT: 'the port `npm run dev` prints',
      TOKEN: {
        from: 'a bearer token for the seeded admin',
        backendOnly: true,
      },
    },
    read: ['db/seed/**', '.env.example'],
  },

  localCi: ['`npm run lint && npm run typecheck`', '`npm test`'],
};
