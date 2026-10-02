// ============================================================================
// PR Skill Defaults
// ============================================================================
//
// What the PR skill ships with before a repository says anything: the backend
// section, the cross-cutting dimensions, the verifier's lists and the wording
// of every prompt passage a repository may reword.

/** The built-in agent-runnable section every repository has. */
export const BACKEND_SECTION = {
  title: 'Agent-Runnable Backend Checks',
  label: 'Backend',
  tools:
    'SQL against the local database, curl with a bearer token, catalog reads, migration behaviour',
  scope: `Scope: migrations, data access, services, API routes, background jobs.
Cover status codes, response shapes, permissions, side effects, and deleted
behaviour (a removed export or route is an entry — what can no longer happen).`,
  gapExamples:
    'needs production data, needs load, needs a live third-party key',
};

/** The fields a human section may set, with their defaults. */
export const HUMAN_SECTION_DEFAULTS = {
  title: '',
  label: '',
  where: 'the running product',
  audience: 'a person using the product',
  surface:
    'a place in the product a person can reach, and the state it must be in',
  surfacesBrief: '',
  inventoryBrief: `Scope: every surface a person can notice — use the surface list below and
verify it against the diff. Include changed copy, empty, error and loading
states, and interactions.`,
  firstStep:
    'getting to the product as the one seeded user who reaches every step',
  stepNames: 'where in the product it happens and how to get there',
  coveredBy: 'an end-to-end test',
};

/**
 * The fields of a human section's `agent` half, with their defaults. A section
 * with one is written as two headings: steps an agent can run, then the ones
 * that need a person's judgement.
 */
export const AGENT_HALF_DEFAULTS = {
  title: '',
  runs: 'Claude in Chrome runs these',
  note: '',
};

/** The cross-cutting questions every inventory asks, by name. */
export const BUILT_IN_DIMENSIONS = {
  authorisation: 'which callers must be REJECTED, not just allowed',
  regression: 'the old behaviour, where the old behaviour is still right',
  'failure paths': 'what runs when a call fails, times out or is rate limited',
  'data volume': 'pagination and ordering beyond a handful of rows',
  concurrency: 'two sessions or two workers acting at once',
  configuration: 'a setting or flag read at use rather than at boot',
};

/** The verifier's built-in lists; a repository's entries are added to these. */
export const DEFAULT_VERIFY = {
  preconditions: [
    'auth state',
    'token age',
    'seeded rows',
    'flags and settings',
    'cache',
    'timing',
  ],
  masking: ['middleware', 'a guard', 'a cache', 'a retry', 'a rate limiter'],
  identifiers: [
    'account',
    'id',
    'route',
    'env var',
    'setting',
    'table',
    'column',
    'enum value',
  ],
};

/** Generic wording for each prompt passage a repository may reword. */
export const DEFAULT_PROMPTS = {
  testKinds: 'unit, integration and end-to-end tests',
  exploreSteps: [],
  auditCallers:
    'every caller of changed code, and every surface a changed file shows up on',
  bootCaveats:
    'a feature flag forced on in development, a setting seeded on boot, a production-build difference',
  gating: 'feature flags or settings gating the touched code',
};

/** Test file patterns used when a repository gives none. */
export const DEFAULT_TESTS = [
  /\.(test|spec)\.[cm]?[jt]sx?$/,
  /(^|\/)__tests__\//,
];

/** The Local CI boxes used when a repository gives none. */
export const DEFAULT_LOCAL_CI = [
  'Review agents run locally before merge',
  'Full test suite passes locally',
];

/** Features that change what agents do, off until measured. */
export const DEFAULT_EXPERIMENTS = {
  dropCrossCutting: false,
};

/** The marker in the PR template that the summary replaces. */
export const SUMMARY_MARKER = '<!-- pr-qa:summary -->';
