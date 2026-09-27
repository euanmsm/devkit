// ============================================================================
// PR Config — Sales harness
// ============================================================================
//
// The PR config that reproduces Sales harness's `pr` skill: the service
// layers, the TUI section, the Docker Compose boot and its own Local CI
// commands. Copied to `.devkit/pr.mjs` when Sales harness adopts the package.

export default {
  layers: [
    {
      key: 'dataModel',
      title: 'Data Model',
      paths: ['packages/service/migrations/'],
      section: 'backend',
    },
    {
      key: 'clients',
      title: 'Clients',
      paths: ['packages/service/src/clients/'],
      section: 'backend',
    },
    {
      key: 'service',
      title: 'Service units',
      paths: [
        /^packages\/service\/src\/(steps|checks|verbs|flows|core|internal)\//,
        'packages/service/src/server.ts',
        'packages/service/config/',
        // The contract between the service and the TUI counts as both.
        'packages/shared/',
      ],
      section: 'backend',
    },
    {
      key: 'api',
      title: 'API',
      paths: ['packages/service/src/api/'],
      section: 'backend',
    },
    {
      key: 'tui',
      title: 'TUI',
      paths: ['packages/tui/', 'packages/shared/'],
      section: 'tui',
    },
  ],

  sections: {
    backend: {
      tools:
        'SQL through `docker compose exec postgres psql`, curl with a bearer token, redis-cli reads, migration behaviour, worker-loop observation through the events table',
      scope: `Scope: migrations, clients, steps, checks, verbs, flows, core machinery,
API routes, the worker loop. Cover status codes, response shapes, state
transitions, event rows, retry classification, side effects, and deleted
behaviour (a removed unit or route is an entry — what can no longer happen).`,
      gapExamples: 'needs a live provider key, needs load',
    },
    tui: {
      title: 'Human TUI Checks',
      label: 'TUI',
      where: 'a running terminal UI',
      audience: 'a person driving the system',
      surface:
        'a TUI screen or view, the command that reaches it, the state it must be in, and the API endpoint behind it',
      surfacesBrief:
        'A change to an API response shape the TUI renders is also a surface, even when no file under `packages/tui/` changed — the `shared` package is the contract between them.',
      inventoryBrief: `Scope: every operator-visible surface — use the surface list below and
verify it against the diff. Each screen reached by changed code is its own
entry. Include changed output strings, empty/error/loading states, keyboard
interactions, and anything the TUI renders from a changed API response.`,
      firstStep:
        'starting the TUI against the local service and confirming it is connected: name the command, the box URL and the token the operator points it at (read `packages/tui/` and `.env.example` for the real names)',
      stepNames: 'the screen and the command that reaches it',
      coveredBy: 'an integration test',
    },
  },

  actors: ['worker loop', 'API caller', 'TUI operator', 'inbound webhook'],

  dimensions: {
    'error classification': 'transient retries versus terminal failures',
    events:
      'the row that must commit in the same transaction as the change it describes',
    idempotency: 'the same webhook or step run twice',
    'failure paths':
      'what runs when an external call fails, times out or rate-limits',
    concurrency: 'two workers claiming the same lead, two TUI sessions',
  },

  verify: {
    preconditions: [
      'lead state',
      'claimed rows',
      'Redis keys',
      'retry counters',
    ],
    masking: ['the route middleware chain', 'the worker loop'],
    identifiers: ['route path', 'settings key', 'event kind'],
  },

  boot: {
    start: [
      'npm run db:up              # waits until both services are healthy',
      "npm run migrate            # applies THIS branch's migrations",
    ],
    stop: 'docker compose down',
    variables: {
      PORT: 'from `.env`',
      DB: {
        from: 'the psql invocation, with the database connection from `.env`',
        backendOnly: true,
      },
      TOKEN: {
        from: 'one of the comma-separated values in `TEAM_TOKENS`; read the token names from .env.example and the auth check in packages/service/src/core/http/route.ts',
        backendOnly: true,
      },
    },
    read: ['.env.example', 'packages/service/migrations/**'],
  },

  tests: [/\.test\.ts$/, /(^|\/)__tests__\//],

  storybook: false,

  localCi: [
    '`npm run format:check && npm run lint && npm run typecheck`',
    '`npm test && npm run test:integration`',
    '`npm run check:comments && npm run check:comment-docs`',
    '`npm run security:config && npm run security:scan`',
  ],

  prompts: {
    testKinds:
      'unit tests in the `__tests__/` folder beside the unit, `*.int.test.ts` integration tests, client fixture tests',
    exploreSteps: [
      'Changed routes with the middleware chain in `packages/service/src/core/http/route.ts` in front of them.',
      'Changed service units traced to the flows and steps that run them — a check or step invoked from N flows is N reachable paths.',
      'Settings keys, seeded config defaults and enum values the branch touches, read from `config/` and the `shared` package.',
    ],
    auditCallers:
      'every flow that runs a changed step, and every screen reached by changed TUI code',
    bootCaveats:
      'a settings row seeded on boot, a worker loop that keeps claiming leads while the tester reads a table',
    gating: 'settings keys or flow membership gating the touched code',
  },
};
