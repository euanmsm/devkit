// ============================================================================
// Sales Harness Review Config
// ============================================================================
//
// Sales harness's code review as it ran before moving into this package. Used
// by the tests, and copied to `.devkit/code-review.mjs` when the repo adopts it.

export default {
  files: {
    code: /\.(ts|mts|js|mjs)$/,
    tests: /\.(test|int\.test)\.ts$/,
    targetExtensions: ['ts', 'mts', 'mjs', 'sql', 'md'],
  },
  prepass: {
    tools: [
      {
        key: 'tsc',
        label: 'TypeScript errors',
        command: 'npm run typecheck',
      },
      {
        key: 'lint',
        label: 'ESLint output, including the import law',
        command: 'npm run lint',
      },
    ],
    // The terse comment check is added on its own, since terse is installed.
    graph: {
      sources: /\.m?ts$/,
      searchGlobs: ['*.ts', '*.mts', '*.js', '*.mjs'],
    },
  },
  lenses: {
    bugs: {
      skill: null,
      route: {
        always: 'code',
      },
      judges:
        'Logic errors, off-by-one, wrong operator, unhandled branch, races, incorrect state transitions, broken invariants, a promise never awaited, a transaction left open.',
    },
    'error-handling': {
      skill: 'error-handling',
      route: {
        always: 'code',
      },
      judges:
        'The WHOLE failure path as one chain — client up through step, loop, route, and the terminal client. Transient classified as terminal or the reverse, a swallowed error, a `try/catch` anywhere outside `core/`, an inline error code instead of the registry, a raw provider message reaching the API, a retry policy hard-coded instead of read from `retry.*` settings. NOT the event written about the failure: `events` owns that.',
    },
    events: {
      skill: 'events',
      route: {
        paths: [/^packages\/service\/src\/(core|steps|verbs)\//],
        judgment:
          "fires on `core/`, `steps/` and `verbs/` already. ADD it if any file under review writes an event, changes a lead's status, or adds a kind to the registry.",
      },
      judges:
        'The event vocabulary and the payload envelope. A kind invented inline instead of taken from the registry, a status change and its event in separate transactions, a payload missing the envelope fields, an event written outside `core/`, a step or verb logging where it should be writing an event.',
    },
    security: {
      skill: null,
      route: {
        always: 'code',
        paths: [/^packages\/service\/migrations\//, /\.sql$/],
      },
      judges:
        'Secrets in code or in a settings row, a token or API key logged, SQL built by string concatenation instead of parameters, unvalidated input reaching a query or a shell, an endpoint with no auth, the service binding to anything but 127.0.0.1, an integration test pointed at a real database, a dependency or script added with no need for it.',
    },
    performance: {
      skill: null,
      route: {
        always: 'code',
      },
      judges:
        'One idea in four disguises — work done per item that could be done once for the set. A query per lead instead of one `IN` clause, sequential awaits over an array, uncapped fan-out at a paid provider, an unbounded `SELECT`, a missing index for a query that exists, a full table read to count rows.',
    },
    validation: {
      skill: 'validation',
      route: {
        paths: [
          /^packages\/service\/src\/(clients|api)\//,
          /^packages\/shared\//,
          /^config\//,
        ],
        judgment:
          'fires on `clients/`, `api/`, `packages/shared/` and `config/` already. ADD it if data crosses a boundary anywhere else — an AI response parsed in a step, a webhook body, a settings row read at use.',
      },
      judges:
        'Zod at every boundary — provider responses, AI output, API requests, settings rows. A response used unparsed, a cast standing in for a parse, strict versus lenient chosen wrongly for the edge, an AI re-prompt loop that runs more than once, a schema living away from its owner.',
    },
    configuration: {
      skill: 'configuration',
      route: {
        always: 'code',
      },
      judges:
        'Which tier a value belongs to — secret, setting, or code. A threshold, timeout, prompt, model name or batch size hard-coded in a unit when changing it should not need a deploy. A settings key read raw instead of through `core/data/settings.ts`, or a `config/` file whose name is not exactly its key.',
    },
    'codebase-structure': {
      skill: 'codebase-structure',
      route: {
        judgment:
          'pure judgment, never routed. ADD it if the target adds or moves a file between layers, adds a directory, adds an import that crosses a layer boundary, or renames a unit. Judge by what you read, NOT by path: editing the body of a function inside `steps/` is not a structural concern.',
      },
      judges:
        'WHICH directory code belongs in, and the import law. A step calling `fetch`, a check writing a row, a `try/catch` in a unit, a route touching a client, a flow importing code, the TUI importing service code, a barrel or a `utils.ts`, a new directory under `packages/service/src`, a file name that differs from its registry name.',
      title: 'Codebase Structure',
    },
    dry: {
      skill: 'dry',
      route: {
        always: 'codeOrDocs',
      },
      judges:
        'Three questions only: does this already exist, is it duplicated knowledge rather than duplicated shape, is it at the right rung of the ladder. A merged abstraction taking a boolean or a `mode` is the opposite failure and counts here too.',
      title: 'DRY',
    },
    readability: {
      skill: 'readability',
      route: {
        always: 'codeOrDocs',
      },
      judges:
        'File size and splitting, entry-point-first composition, `const` arrows used as module-level helpers, guard clauses, nesting depth, argument count, where a file sits, and the naming vocabulary.',
    },
    typing: {
      skill: null,
      route: {
        always: 'code',
      },
      judges:
        '`any`, unsafe casts, and `as` standing in for a parse. A hand-written interface mirroring a table row that `@sales/shared` already owns, a type inferred from a schema written out by hand instead, a union widened to `string`, an enum value typed as a bare string.',
    },
    comments: {
      skill: 'comments',
      route: {
        always: 'codeOrDocs',
      },
      judges:
        'File headers, JSDoc, property docs, logic comments — judged in BOTH directions, missing AND bloated. The contract in the skill is exact: 8-line header, 4 prose lines of JSDoc, one line per logic comment, no history, no justification, no first or second person. The prepass ran `terse`; treat its output as evidence and judge the rules no scanner can check.',
    },
    'dead-code': {
      skill: null,
      route: {
        always: 'code',
      },
      judges:
        'Unreachable branches, unused parameters, exports with no caller, a helper in `internal/` down to one consumer, a settings key nothing reads. The generated import graph lists every export with no call site outside its own file — a lead, never a verdict, since units are reached through registries rather than imports.',
    },
    'api-routes': {
      skill: 'api-routes',
      route: {
        paths: [/^packages\/service\/src\/api\//],
      },
      judges:
        'Endpoints as declarations — the middleware chain in the order `route()` fixes, auth and rate limiting present, params and body parsed by schema, the response envelope and status choice, pagination, idempotency, versioning, and no business logic in the file.',
      title: 'API Routes',
    },
    'shared-logic': {
      skill: 'shared-logic',
      route: {
        paths: [/^packages\/service\/src\/(steps|checks|verbs|flows|core)\//],
      },
      judges:
        'The uniform unit shapes and the registries holding them. One unit per file as the default export, a step never calling another step, a check that only judges, a flow that is names and nothing else, a verb going through `transition()`, and machinery in `core/` that knows no specific unit.',
    },
    database: {
      skill: null,
      route: {
        paths: [/^packages\/service\/migrations\/.*\.sql$/, /\.sql$/],
      },
      judges:
        'A migration read as a migration — one concern per file, ordering, a lock taken against a populated table, expand-backfill-contract where the change breaks running code, `ON DELETE` on every foreign key, `NOT NULL` with a default where the column is required, an enum value added in SQL without its TypeScript twin, an index only for a query that exists.',
    },
    'backwards-compat': {
      skill: null,
      route: {
        paths: [
          /^packages\/service\/migrations\//,
          /^packages\/service\/src\/api\//,
          /^packages\/shared\//,
        ],
        judgment:
          'fires on migrations, routes and `packages/shared/` already. ADD it if a shape the TUI compiles against changed its name, its fields, or its meaning.',
      },
      judges:
        'Diff-only. Does this break what is already deployed on the box, or the copy of the TUI a teammate installed last week? Migrations against populated tables, a response shape or an enum value changed under a client, a settings key renamed with rows still holding the old one.',
      title: 'Backwards Compatibility',
    },
    testing: {
      skill: null,
      route: {
        paths: [/\.test\.ts$/, /\.int\.test\.ts$/],
        coverage: [/^packages\/(service|tui|shared)\/src\/.*\.ts$/],
      },
      judges:
        'Unit tests against a fake `ctx` with only the layer below mocked, one assertion concept per test, every branch of a discriminated union covered, no test of mock wiring. Integration tests on a throwaway schema, seeded and dropped per file, never truncating the dev schema and never running without the explicit test connection variables.',
    },
    readmes: {
      skill: 'readmes',
      route: {
        paths: [/(^|\/)README\.md$/, /^AGENTS\.md$/],
      },
      judges:
        'What a README carries at its level of the tree, whether it repeats what the code already says, and whether it still describes the repository as it now is.',
      title: 'READMEs',
    },
    ci: {
      skill: null,
      route: {
        paths: [
          /^\.github\/workflows\/.*\.ya?ml$/,
          /^\.husky\//,
          /^\.devkit\//,
          /^package\.json$/,
        ],
        coverage: [],
      },
      judges:
        'Whether the checks a change relies on actually run in CI, job ordering and caching, a hook that duplicates a CI job or diverges from it, a script in `package.json` that CI calls by a different name, and a `.devkit` config whose paths no longer resolve.',
      title: 'CI',
    },
    'agent-config': {
      skill: null,
      route: {
        paths: [
          /^\.agents\//,
          /^\.claude\//,
          /^_CONVENTIONS\//,
          /^AGENTS\.md$/,
        ],
      },
      judges:
        'Skill file shape and the quality of a `description` as routing text, a `cat` path that resolves to nothing, a convention restated in two places, a preflight path map that no longer matches the tree, and any instruction to an agent that contradicts `_CONVENTIONS/`.',
      title: 'Agent Configuration',
    },
  },
  bundles: [
    {
      key: 'correctness',
      title: 'Correctness',
      scope: 'target',
      model: 'opus',
      lenses: ['bugs', 'error-handling', 'events'],
      split: [
        {
          lenses: ['bugs'],
          model: 'opus',
        },
        {
          lenses: ['error-handling', 'events'],
          model: 'opus',
        },
      ],
    },
    {
      key: 'security',
      title: 'Security and Validation',
      scope: 'target',
      model: 'opus',
      lenses: ['security', 'validation'],
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
        'codebase-structure',
        'dry',
        'readability',
        'configuration',
        'typing',
        'comments',
        'dead-code',
      ],
      split: [
        {
          lenses: [
            'codebase-structure',
            'dry',
            'readability',
            'configuration',
            'dead-code',
          ],
          model: 'opus',
        },
        {
          lenses: ['typing', 'comments'],
          model: 'sonnet',
        },
      ],
    },
    {
      key: 'service-layers',
      title: 'Service Layers',
      scope: 'slice',
      model: 'opus',
      lenses: ['api-routes', 'shared-logic'],
    },
    {
      key: 'database',
      title: 'Database',
      scope: 'slice',
      model: 'opus',
      lenses: ['database', 'backwards-compat'],
    },
    {
      key: 'tests',
      title: 'Tests',
      scope: 'slice',
      model: 'sonnet',
      lenses: ['testing'],
    },
    {
      key: 'docs',
      title: 'Documentation',
      scope: 'slice',
      model: 'sonnet',
      lenses: ['readmes'],
    },
    {
      key: 'repo',
      title: 'Repository Tooling',
      scope: 'slice',
      model: 'sonnet',
      lenses: ['ci', 'agent-config'],
    },
  ],
  splitOrder: ['craft', 'correctness'],
  prompts: {
    graphUnderReports: 'units reached through a registry rather than an import',
    fileRoles:
      'client, check, step, verb, route, flow, core machinery, internal helper, shared schema, migration, config file, test, TUI screen',
    readNote:
      'Remember that units are reached through registries, not imports: a step with no importer is normal, and its real call site is the flow that names it.',
    neighbours:
      'the flow that names this step, the registry that holds it, the tests beside it, the migration that created the table it reads, the `config/` file behind a settings key it uses, the error codes it throws',
    concernExample:
      'this step runs one Apollo call per lead inside a loop instead of one batched call',
    layerChain: 'route -> verb -> core, or flow -> step -> client',
    extraReadingSteps: [
      'For anything tunable, read the `config/` file for the settings key.',
    ],
    coverageUnits:
      'new functions, branches, error paths, edge cases, every arm of a discriminated union',
    coverageLocation:
      'the corresponding test files in the `__tests__/` folder beside the code',
    coverageExamples:
      '"no test for the transient branch of classify", "enrich has no test for a no-match response"',
    coverageSeverity:
      'an untested error path in `core/` is high, a missing test for a formatting helper is low',
    whyItMatters:
      'the lead stuck in a status, the money spent on a company already excluded, the email that reaches a prospect unapproved',
    coverageFiles:
      '`*.test.ts` or `*.int.test.ts` in the `__tests__/` folder beside the code',
    authCheck: '',
    deadCodeReferences:
      'registry entries, flow name lists, settings keys and tests, none of which look like imports',
    blastRadius:
      'code — whether the path runs at all in the current phase, whether a write path even exists',
  },
  rosterNotes:
    '#### Where the overlapping lenses stop\n\n- `dry` leaves dead branches to `dead-code`, hard-coded tunables to\n  `configuration`, misplaced files to `codebase-structure`, repeated prose to\n  `comments` — and a "merge these two" finding must argue same knowledge, not\n  merely same shape\n- `codebase-structure` owns **which directory** a file belongs in and what it\n  may import; `readability` owns **how the file reads** and what it is called;\n  `dry` owns **which rung** a shared thing sits on\n- `error-handling` owns **whether a failure is classified and reported at the\n  right layer**; `events` owns **what gets written to the events table about\n  it** — kind, envelope, and the one transaction the status change shares\n- `configuration` owns **which tier a value belongs to**; `validation` owns\n  **whether the value was parsed** on its way in\n- `security` reads a migration for grants and exposure; `database` reads the\n  same migration as a migration — locks, ordering, constraints\n- `performance` owns what a query **costs**; `database` owns what it **says**\n- **Overlap between bundles is expected.** `security` and `service-layers` will\n  both look at an endpoint\'s auth. The dedup step handles collisions, and two\n  agents reaching the same conclusion is signal',
};
