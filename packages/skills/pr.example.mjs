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
      // What a change here needs running to test: database, api or page.
      touches: ['database'],
    },
    {
      key: 'api',
      title: 'API',
      paths: [/^src\/app\/api\//],
      section: 'backend',
      touches: ['api', 'database'],
    },
    {
      key: 'frontend',
      title: 'Frontend',
      paths: [/^src\/app\/(?!api\/)/, 'src/components/'],
      section: 'frontend',
      touches: ['page'],
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

  // Each command and variable runs only when the diff touches what it is for.
  boot: {
    start: [
      { run: 'docker compose up -d', when: ['database'] },
      { run: 'npm run db:migrate', when: ['database'] },
      { run: 'npm run dev', when: ['api', 'page'] },
    ],
    stop: { run: 'docker compose down', when: ['database'] },
    variables: {
      PORT: { from: 'the port `npm run dev` prints', when: ['api', 'page'] },
      TOKEN: { from: 'a bearer token for the seeded admin', when: ['api'] },
    },
    read: ['db/seed/**', '.env.example'],
  },

  // What a diff can depend on outside the repo; each yes becomes a deploy check.
  outsideRepo: [
    {
      ask: 'Does it change vercel.json or a Vercel project setting?',
      paths: [/(^|\/)vercel\.json$/],
    },
    {
      ask: 'Does it add an env var that needs a production value?',
      paths: ['.env.example'],
    },
    {
      ask: 'Does it add a migration that will run on production data?',
      paths: ['migrations/'],
    },
    { ask: 'Does it call an external service it did not call before?' },
  ],

  // Optional: the step cap per size of diff, and the minutes target.
  // budget: { move: 2, small: 8, large: 20, minutes: 30 },

  localCi: ['`npm run lint && npm run typecheck`', '`npm test`'],
};
