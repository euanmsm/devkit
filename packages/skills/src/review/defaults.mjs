// ============================================================================
// Code Review Defaults
// ============================================================================
//
// What the code review ships with before a repository says anything: the
// built-in lenses, the bundles they run in, and generic wording for every
// prompt paragraph a repository may reword.

/** File patterns routing reads, and the extensions a target directory expands to. */
export const DEFAULT_FILES = {
  code: /\.(ts|tsx|mts|js|mjs)$/,
  docs: /\.mdx?$/,
  tests: /\.(test|spec)\.[cm]?[jt]sx?$/,
  targetExtensions: ['ts', 'tsx', 'mts', 'js', 'mjs', 'sql', 'md'],
};

/** The prepass tools and import graph settings. */
export const DEFAULT_PREPASS = {
  tools: [
    {
      key: 'tsc',
      label: 'TypeScript errors',
      command: 'npx --no-install tsc --noEmit',
    },
    { key: 'lint', label: 'ESLint output', command: 'npm run lint' },
  ],
  graph: {
    sources: /\.(ts|tsx|mts)$/,
    searchGlobs: ['*.ts', '*.tsx', '*.mts', '*.js', '*.mjs'],
  },
  comments: 'auto',
  knip: 'auto',
};

/**
 * Default tools that run only when the repository has their package installed,
 * so a repository without it gets no report rather than a wrong one.
 */
export const DEFAULT_TOOL_PACKAGES = { tsc: 'typescript' };

/**
 * The checks the prepass adds on its own when the repository has the tool
 * installed, keyed by the `prepass` setting that switches each one.
 */
export const BUILT_IN_TOOLS = {
  comments: {
    package: '@euanmsm/terse',
    tool: {
      key: 'comments',
      label:
        'Comment contract report from `terse`, over the files under review',
      command: 'npx --no-install terse scan',
      appendFiles: true,
    },
  },
  knip: {
    package: 'knip',
    tool: {
      key: 'knip',
      label: 'Knip dead-code report (JSON), limited to the files under review',
      command: 'npx --no-install knip --reporter json',
      json: true,
      onlyFilesUnderReview: true,
    },
  },
};

/** The built-in lenses, each overridable field by field or removable with `false`. */
export const BUILT_IN_LENSES = {
  bugs: {
    skill: null,
    route: { always: 'code' },
    judges:
      'Logic errors, off-by-one, wrong operator, unhandled branch, races, incorrect state transitions, broken invariants, a promise never awaited, a transaction left open.',
  },
  'error-handling': {
    skill: null,
    route: { always: 'code' },
    judges:
      'The WHOLE failure path as one chain, from the lowest layer up to what the caller sees. Swallowed errors, an error reported at two layers or at none, the wrong error shape for the layer, thrown-vs-returned mismatches, a transient failure treated as permanent or the reverse, a message that leaks internals to the caller.',
  },
  security: {
    skill: null,
    route: { always: 'code', paths: [/(^|\/)migrations?\//, /\.sql$/] },
    judges:
      'Secrets in code or config, a token or key logged, SQL built by concatenation instead of parameters, unvalidated input reaching a query or a shell, authorisation gaps and one user reaching another user’s data, an endpoint with no auth, data exposed in a response or a log, a dependency or install script added with no need for it.',
  },
  performance: {
    skill: null,
    route: { always: 'code' },
    judges:
      'One idea in four disguises — work done per item that could be done once for the set. A query per row instead of one batched query, sequential awaits over an array, uncapped fan-out at a paid or rate-limited service, an unbounded read, a missing index for a query that exists.',
  },
  dry: {
    skill: null,
    route: { always: 'codeOrDocs' },
    judges:
      'Three questions only: does this already exist, is it duplicated knowledge rather than duplicated shape, is it shared at the right level. A merged abstraction taking a boolean or a `mode` is the opposite failure and counts here too.',
  },
  readability: {
    skill: null,
    route: { always: 'codeOrDocs' },
    judges:
      'File size and splitting, entry-point-first composition, guard clauses, nesting depth, argument count, where a file sits in the tree, and the naming vocabulary.',
  },
  typing: {
    skill: null,
    route: { always: 'code' },
    judges:
      '`any`, unsafe casts, and `as` standing in for a parse. A hand-written type mirroring one that already exists or can be inferred from a schema, a union widened to `string`, weak generics.',
  },
  comments: {
    skill: null,
    route: { always: 'codeOrDocs' },
    judges:
      'File headers, JSDoc, property docs and logic comments — judged in BOTH directions, missing AND bloated, against the comment rules in the skill. A comment that narrates the implementation, records history or justifies a choice is a finding. When a comment contract report from `terse` is among the tool reports, treat it as evidence for the mechanical rules and spend your own pass on the ones no scanner can check.',
  },
  'dead-code': {
    skill: null,
    route: { always: 'code' },
    judges:
      'Unreachable branches, unused parameters, exports with no caller, stale re-exports. The generated import graph lists every export with no call site outside its own file — a lead, never a verdict. When a knip report is among the tool reports, treat it as evidence, not a verdict: knip misses code reached by name or by a framework convention.',
  },
  database: {
    skill: null,
    route: { paths: [/(^|\/)migrations?\/.*\.sql$/, /\.sql$/] },
    judges:
      'A migration read as a migration — one concern per file, a lock taken against a populated table, expand-backfill-contract where the change breaks running code, `ON DELETE` on every foreign key, `NOT NULL` with a default where the column is required, an index only for a query that exists.',
  },
  'backwards-compat': {
    skill: null,
    title: 'Backwards Compatibility',
    diffOnly: true,
    route: {
      paths: [/(^|\/)migrations?\//],
      judgment:
        'fires on migrations already. ADD it if a public export, an API response shape or a stored value changed its name, its shape or its meaning.',
    },
    judges:
      'Diff-only. Does this break the code that is currently deployed? Migrations against populated tables, response-shape changes on a live API, removed or renamed exports a caller outside this branch still uses. Old and new code run together for the length of a deploy.',
  },
  testing: {
    skill: null,
    route: { paths: ['tests'], coverage: ['code'] },
    judges:
      'Tests against a fake of the layer below only, one assertion concept per test, every branch of a discriminated union covered, isolation between tests, no test of mock wiring or of a third-party library.',
  },
  ci: {
    skill: null,
    title: 'CI',
    route: { paths: [/^\.github\/workflows\/.*\.ya?ml$/] },
    judges:
      'Whether the checks a change relies on actually run in CI, job ordering and caching, a hook that duplicates a CI job or diverges from it, and a script CI calls by a different name.',
  },
};

/** The built-in bundles, used unless a repository gives its own list. */
export const DEFAULT_BUNDLES = [
  {
    key: 'correctness',
    title: 'Correctness',
    scope: 'target',
    model: 'opus',
    lenses: ['bugs', 'error-handling'],
    split: [
      { lenses: ['bugs'], model: 'opus' },
      { lenses: ['error-handling'], model: 'opus' },
    ],
  },
  {
    key: 'security',
    title: 'Security',
    scope: 'target',
    model: 'opus',
    lenses: ['security'],
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
    lenses: ['dry', 'readability', 'typing', 'comments', 'dead-code'],
    split: [
      { lenses: ['dry', 'readability', 'dead-code'], model: 'opus' },
      { lenses: ['typing', 'comments'], model: 'sonnet' },
    ],
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
    key: 'ci',
    title: 'CI',
    scope: 'slice',
    model: 'sonnet',
    lenses: ['ci'],
  },
];

/** Generic wording for each prompt passage a repository may reword. */
export const DEFAULT_PROMPTS = {
  graphUnderReports: 'dynamic references',
  fileRoles:
    'route handler, service, data-access function, component, page, hook, type or schema, migration, config, test',
  readNote: '',
  neighbours:
    'the tests beside it, the migrations behind any table it reads, the config it depends on, the errors it raises',
  removalExample: '',
  concernExample:
    'this function runs one query per row inside a loop instead of a single batched query',
  toolCost: '`tsc` or the full lint',
  layerChain: 'route -> service -> data access',
  databaseReading:
    'the migration that created the table and the columns the code assumes',
  extraReadingSteps: [],
  coverageUnits: 'new functions, branches, error paths, edge cases',
  coverageLocation:
    'the corresponding test files at their conventional locations',
  coverageExamples:
    '"no test for the error branch of createInvoice", "parseDate has no test for an empty string"',
  coverageSeverity:
    'an untested error path on a write is high, a missing test for a formatting helper is low',
  whyItMatters:
    'the failed request, the wrong number on screen, the record a user can read but should not',
  coverageFiles: 'a test file at its conventional location beside the code',
  errorIdentifier: 'error code',
  authCheck: 'middleware or a wrapping layer',
  deadCodeReferences:
    'dynamic references, string-keyed lookups and tests, none of which look like imports',
  blastRadius:
    'code and data — whether the path runs at all, whether a write path even exists',
};
