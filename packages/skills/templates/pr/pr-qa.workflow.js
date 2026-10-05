// ============================================================================
// PR QA — Workflow Script
// ============================================================================
//
// Triages a branch diff, explores it into a shared context pack, inventories
// behaviours, audits for gaps, drafts the Manual QA checklist and summary, and
// verifies every unit against the code before returning the assembled
// artifacts.

/** Workflow metadata read by the Workflow tool. */
export const meta = {
  name: '__SKILL_NAME__',
  description:
    'Explore a branch diff, inventory its behaviours, draft and adversarially verify the Manual QA checklist and PR summary',
  phases: [
    { title: 'Triage' },
    { title: 'Explore' },
    { title: 'Inventory' },
    { title: 'Audit' },
    { title: 'Prune' },
    { title: 'Draft and verify' },
  ],
};

// =============================================================================
// Config
// =============================================================================

const CONFIG = /* CONFIG */ null;

const SECTIONS = CONFIG.sections;
const BACKEND = SECTIONS.backend;
const HUMAN_KEYS = Object.keys(SECTIONS).filter((key) => key !== 'backend');
const PROMPTS = CONFIG.prompts;

/** What a change can need running to test it, in the order the triage line names them. */
const TOUCHES = ['database', 'api', 'page'];

/** How the triage line names each kind of diff. */
const KIND_NAMES = {
  move: 'pure move',
  tooling: 'tooling only',
  behaviour: 'behaviour change',
};

/**
 * Opus for the work that decides what the checklist covers, Sonnet for narrow
 * checks, including every re-check after the first round.
 */
const DEEP = 'opus';
const LIGHT = 'sonnet';

/** Rounds of verify-and-rewrite a unit gets before it is reported unresolved. */
const MAX_VERIFY_ROUNDS = 2;

/** Units one checker verifies at once, the same cap code-review gives its verifiers. */
const PER_VERIFIER_CAP = 8;

/** Inventory entries per drafting agent, in every section. */
const DRAFT_CHUNK = 8;

/** Steps one mistake must break before it is suggested as a trap. */
const TRAP_MIN_UNITS = 3;

// =============================================================================
// Output shapes
// =============================================================================

const str = { type: 'string' };

const ENTRY = {
  type: 'object',
  required: ['id', 'behaviour', 'where', 'reachable', 'actors', 'visible'],
  properties: {
    id: str,
    behaviour: str,
    where: str,
    reachable: str,
    actors: str,
    visible: { type: 'boolean' },
    section: { type: ['string', 'null'] },
    dimension: { type: ['string', 'null'] },
  },
};

const INVENTORY = {
  type: 'object',
  required: ['entries'],
  properties: { entries: { type: 'array', items: ENTRY } },
};

const TRIAGE_SCHEMA = {
  type: 'object',
  required: ['kind', 'size', 'touches', 'outsideRepo'],
  properties: {
    kind: { enum: Object.keys(KIND_NAMES) },
    size: { enum: ['small', 'large'] },
    touches: { type: 'array', items: { enum: TOUCHES } },
    outsideRepo: {
      type: 'array',
      items: {
        type: 'object',
        required: ['ask', 'yes', 'why'],
        properties: {
          ask: str,
          yes: { type: 'boolean' },
          why: str,
          files: { type: 'array', items: str },
        },
      },
    },
  },
};

const EXPLORE_SCHEMA = {
  type: 'object',
  required: ['packPath', 'testFiles', 'visibleSections'],
  properties: {
    packPath: str,
    testFiles: {
      type: 'array',
      items: {
        type: 'object',
        required: ['file', 'asserts'],
        properties: { file: str, asserts: str },
      },
    },
    visibleSections: { type: 'array', items: str },
  },
};

const SURFACES_SCHEMA = {
  type: 'object',
  required: ['surfaces', 'unresolved'],
  properties: {
    surfaces: {
      type: 'array',
      items: {
        type: 'object',
        required: ['surface', 'reachedBy', 'state'],
        properties: { surface: str, reachedBy: str, state: str, detail: str },
      },
    },
    unresolved: { type: 'array', items: str },
  },
};

const PRUNE_SCHEMA = {
  type: 'object',
  required: ['merge', 'drop'],
  properties: {
    merge: {
      type: 'array',
      items: {
        type: 'object',
        required: ['keep', 'ids', 'inputs'],
        properties: {
          keep: str,
          ids: { type: 'array', items: str },
          inputs: str,
        },
      },
    },
    drop: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'reason', 'why'],
        properties: {
          id: str,
          reason: { enum: ['passes-on-main', 'covered'] },
          why: str,
          testFile: { type: ['string', 'null'] },
          assertion: { type: ['string', 'null'] },
        },
      },
    },
  },
};

const STEP = {
  type: 'object',
  required: ['title', 'priority', 'body', 'coversEntryIds', 'minutes'],
  properties: {
    title: str,
    priority: { enum: ['blocking', 'if-time'] },
    body: str,
    coversEntryIds: { type: 'array', items: str },
    minutes: { type: 'number' },
  },
};

/** Who runs a step in a section split into an agent half and a human half. */
const RUNNERS = ['agent', 'human'];

/** A step in a split section, which must say who runs it. */
const SPLIT_STEP = {
  ...STEP,
  required: [...STEP.required, 'runner'],
  properties: { ...STEP.properties, runner: { enum: RUNNERS } },
};

const SECTION_SCHEMA = {
  type: 'object',
  required: ['steps', 'coveredByTests', 'gaps'],
  properties: {
    steps: { type: 'array', items: STEP },
    coveredByTests: {
      type: 'array',
      items: {
        type: 'object',
        required: ['entryId', 'testFile', 'assertion'],
        properties: { entryId: str, testFile: str, assertion: str },
      },
    },
    gaps: {
      type: 'array',
      items: {
        type: 'object',
        required: ['gap', 'why'],
        properties: { gap: str, why: str },
      },
    },
  },
};

const STORYBOOK_SCHEMA = {
  type: 'object',
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        required: ['metaTitle', 'exports', 'storyFile', 'whatChanged'],
        properties: {
          metaTitle: str,
          exports: { type: 'array', items: str },
          storyFile: str,
          whatChanged: str,
        },
      },
    },
  },
};

const TEXT_SCHEMA = {
  type: 'object',
  required: ['markdown'],
  properties: { markdown: str },
};

/** A split section's draft, whose steps each say who runs them. */
const SPLIT_SECTION_SCHEMA = {
  ...SECTION_SCHEMA,
  properties: {
    ...SECTION_SCHEMA.properties,
    steps: { type: 'array', items: SPLIT_STEP },
  },
};

const VERDICTS_SCHEMA = {
  type: 'object',
  required: ['verdicts'],
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'verdict', 'findings'],
        properties: {
          id: str,
          verdict: { enum: ['PASS', 'FAIL', 'DELETE'] },
          findings: str,
          rewrite: { type: ['string', 'null'] },
          runner: { enum: [...RUNNERS, null] },
        },
      },
    },
  },
};

const TRAPS_SCHEMA = {
  type: 'object',
  required: ['traps'],
  properties: {
    traps: {
      type: 'array',
      items: {
        type: 'object',
        required: ['trap', 'why', 'instead', 'units'],
        properties: { trap: str, why: str, instead: str, units: { type: 'number' } },
      },
    },
  },
};

// =============================================================================
// Shared prompt fragments
// =============================================================================

/**
 * Names the context pack and the facts file as maps to check against the repo.
 *
 * @param input - Workflow args plus derived paths
 * @returns The prompt fragment
 */
function packRule(input) {
  const pack = input.packPath
    ? `Context pack: \`${input.packPath}\` — a MAP, never evidence. Use it to
know where to look, then confirm every identifier and behaviour against the
repo itself. If the pack disagrees with the code, the code wins — report the
pack error in your findings.`
    : '';

  return `
${pack}
Facts file: \`${input.factsPath}\` — written by a script, so its paths are
exact: the changed files by layer, the tests beside each changed file, the
files importing each changed module, ${CONFIG.storybook ? 'the stories for changed components, ' : ''}and
the seed, fixture and env files to read. It lists only what a script can
find; it is not a limit on where to look.`;
}

/**
 * Renders a bulleted list.
 *
 * @param items - The lines to list
 * @param fallback - What to write when there are none
 * @returns The list markdown, or the fallback
 */
function bullets(items, fallback = '- (none)') {
  return items.length > 0 ? items.map((item) => `- ${item}`).join('\n') : fallback;
}

const LAYER_NAMES = CONFIG.layers.map((layer) => layer.title).join(' / ');
const ACTORS = CONFIG.actors.join(' / ');

const DIMENSIONS = Object.entries(CONFIG.dimensions)
  .map(([name, text]) => `${name} (${text})`)
  .join(', ');

const STEP_FORMAT = `
Every step is the same labelled parts and nothing else, in this order:

- **Setup:** only when state must exist first, carrying its own copy-pasteable
  fenced block when a command creates it.
- The command(s) or actions. A command goes in a fenced block and leads; no
  paragraph explaining what it is about to do — the step title says that.
- **Expect:** the literal expected result, quoted — a block of expected output
  or the exact values, never sentences describing fields.
- **If wrong:** one line, the likely diagnostic case only. No three-branch
  essays.
- **Teardown:** only when the step mutates state, with the full statement
  written out in the step (a confirming read included where cheap). Absent
  means none — never write "Teardown: none".

Hard rules:
- NO rationale in steps ("nothing in the suite asserts this…" belongs to the
  inventory, not the tester). One clause of context is allowed only when the
  tester cannot act without it.
- NO environment re-derivation. The boot block owns ports, tokens and env
  caveats; assume one shell per section, so variables from earlier steps in
  the SAME section carry forward. A step's own state and IDs are still always
  inline.
- Plain language: one instruction per sentence, real UI and output strings
  quoted verbatim, warnings above the action they apply to, a codebase-local
  name explained in a clause on first use.
- Every seeded row, ID, account, setting and credential a step uses is written
  in the step, with the way to get it when it is derived.
- Never run a command while drafting. Drafting reads code; running the steps
  is the manual tester's job.`;

/**
 * Tells whether a boot command or variable is needed for this diff.
 *
 * @param when - What it is needed for, empty for always
 * @returns Whether the triage found the diff touches any of it
 */
function bootNeeds(when) {
  return when.length === 0 || when.some((touch) => triage.touches.includes(touch));
}

/**
 * Describes the boot variables a section may assume.
 *
 * @returns The variable names, as `$NAME` joined with commas
 */
function bootVariableNames() {
  return CONFIG.boot.variables
    .filter((variable) => bootNeeds(variable.when))
    .map((variable) => `$${variable.name}`)
    .join(', ');
}

/**
 * Gives a drafter the verified boot block and the traps file, so a step uses
 * what the environment really defines instead of guessing at it.
 *
 * @param input - Workflow args plus derived paths, with the verified `bootMarkdown`
 * @returns The prompt fragment
 */
function draftEnvironment(input) {
  return `
## Boot block — already run before every section
${input.bootMarkdown || '(none — this diff needs nothing started)'}

It defines ${bootVariableNames() || 'no variables'}. Use ONLY the variables, helpers,
ports and commands it defines, exactly as it writes them — never a variant,
never a shell helper of your own wrapping them. Anything else a step needs is
defined inline in that step's own Setup, never in an earlier step, so every
step runs on its own.

## Known traps
Read \`${CONFIG.traps}\` in full before drafting. Every step is checked against
it, and a step that falls into a listed trap is sent back.`;
}

const EIGHT_CHECKS = `
1. REACHABILITY — trace the action to the code it executes. Name file:line.
   Can this step reach the changed lines at all?
2. PRECONDITIONS — list every condition that changes the outcome (${CONFIG.verify.preconditions.join(', ')}).
   Flag any left unpinned that the boot block does not pin globally.
3. EXPECTED RESULT — read the branch that runs and quote what it actually
   returns. Does it match the step's Expect line?
4. DISCRIMINATING — would the observable result differ if this branch were
   reverted? If identical, the step is vacuous.
5. MASKED — can ${CONFIG.verify.masking.join(', ')} intercept first? If so the
   step must neutralise it or say how to tell them apart.
6. IDENTIFIERS — confirm every ${CONFIG.verify.identifiers.join(', ')} exists IN
   THE REPO. Grep; never trust the pack or recall.
7. TRAPS — check the step against every entry in the traps file.
8. FORMAT — the step follows the micro-format: Setup/command/Expect/If
   wrong/Teardown only, no rationale paragraphs, no environment re-derivation,
   one instruction per sentence, real strings quoted, setup and teardown
   commands fenced and inline. A violation is a FAIL like any other.

A claimed result that does not reproduce from the code is a FAIL.
Verification is CODE-READING ONLY. Never execute a step, never start or touch
the local stack — running the checks is the manual tester's job.`;

const RUNNER_RULES = `
- agent — an agent can do every action and check every result itself: open
  a page, click and type, read the page's text, URL, headings and toasts, read
  network requests and the console, run JavaScript in the page, and run SQL or
  shell commands in a terminal. Its Expect lines are things read off the page,
  the network log, the console or a command's output.
- human — the step needs a person's judgement: whether it looks right, whether
  a flow feels right, visual design and taste, a real screen reader or other
  assistive technology, a real device.
- A step that mixes both is two steps: the mechanical checks go in an agent
  step, and only the judgement goes in a human step. Prefer agent whenever no
  judgement is needed.`;

const RUNNER_CHECK = `
9. RUNNER — a unit with a \`runner\` is in a section split between an agent
   and a person. Check it against these rules:
${RUNNER_RULES}
   Set \`runner\` in your verdict to the one the unit should have. A wrong
   runner alone is not a FAIL. For a unit with no runner, set it to null.`;

// =============================================================================
// Prompt builders
// =============================================================================

/**
 * Builds the prompt sizing up the diff before anything else runs.
 *
 * @param input - Workflow args plus derived paths
 * @returns The prompt
 */
function triagePrompt(input) {
  const questions = CONFIG.outsideRepo.map((question) => question.ask);

  return `
Triage this branch's diff for a Manual QA run. Later phases read your labels
to decide how big a checklist to write and which services the tester starts.

Branch: ${input.branch}
Diff stat:
${input.diffStat}

Read the diff at \`${input.diffPath}\`${input.largeDiff ? ` (large — skim the per-file patches in \`${input.patchDir}\`)` : ''}.
${packRule({ ...input, packPath: null })}
The facts file ends with triage hints a script worked out. Treat them as
evidence: confirm them, never contradict them without reading the code.

Return:
- kind — \`move\` when the diff only moves or renames code and fixes the
  imports that forces, with no behaviour changed; \`tooling\` when nothing it
  changes runs in the product (CI, lint, docs, dev scripts, tests alone);
  \`behaviour\` otherwise.
- size — \`small\` for one concern a tester could cover in a handful of
  steps; \`large\` otherwise.
- touches — what testing it needs running: \`database\` when it reads or
  writes data or changes the schema, \`api\` when it changes an HTTP route or
  server handler, \`page\` when it changes a rendered page or component. Empty
  when it needs nothing running.
- outsideRepo — one answer per question below: \`yes\`, why in one line, and
  the changed files behind a yes.
${bullets(questions, '- (no questions)')}

Never run a command other than reading and searching files.`;
}

/**
 * Builds the prompt writing the shared context pack.
 *
 * @param input - Workflow args plus derived paths
 * @returns The prompt
 */
function explorePrompt(input) {
  return `
You are building the shared CONTEXT PACK for a PR QA run — the one exploration
every later agent reuses instead of re-reading the branch cold.

Branch: ${input.branch}
Diff stat:
${input.diffStat}

Read the full diff at \`${input.diffPath}\`${input.largeDiff ? ` (large — read the per-file patches in \`${input.patchDir}\` and the changed files directly rather than holding it all)` : ''}.
${packRule({ ...input, packPath: null })}

Write a context pack to \`${input.packPath}\` covering:
- The diff annotated by layer (${LAYER_NAMES}), hunk by hunk in brief.
- Changed entry points (routes, handlers, commands) with the middleware and
  guards in front of them.
- Who reaches each changed shared unit — start from the importers in the
  facts file. A unit reached from N places is N reachable paths.
- Seed and fixture data that actually exists: real accounts, IDs and rows,
  read from the seed and env files the facts file lists.
- AUTOMATED TESTS THAT ACTUALLY EXIST for the touched code (${PROMPTS.testKinds}).
  Start from the tests the facts file lists beside each changed file, then
  look for others. Open each file and record what it genuinely asserts. Never
  assume a test exists.
${bullets(PROMPTS.exploreSteps, '')}
- A digest of \`${CONFIG.traps}\`.

The pack is a map for other agents: precise paths, real identifiers, no
speculation. Return the pack path, the test-file list with what each asserts,
and which of these checklist sections have a change a person could notice:
${HUMAN_KEYS.filter((key) => input.sections[key])
  .map((key) => `\`${key}\` — ${SECTIONS[key].audience}`)
  .join('; ')}. Return the keys of the ones that do, or an empty list.

Never run a command other than reading and searching files.`;
}

/**
 * Builds the prompt enumerating one human section's surfaces.
 *
 * @param input - Workflow args plus derived paths
 * @param key - The human section key
 * @returns The prompt
 */
function surfacesPrompt(input, key) {
  const section = SECTIONS[key];

  return `
Enumerate the surfaces a PR QA run must cover for the ${section.title} section.

Branch: ${input.branch}
Diff stat:
${input.diffStat}
${packRule({ ...input, packPath: null })}

A surface here is ${section.surface}.

Read the diff at \`${input.diffPath}\` and the changed files in this section's
layers. For each changed file resolve every surface it shows up on. Trace
shared code through the importers the facts file lists — code used by N
surfaces is N surfaces. List any changed file you cannot resolve to a surface
under \`unresolved\` rather than dropping it.
${section.surfacesBrief ? `\n${section.surfacesBrief}\n` : ''}
For each surface: what it is, how a person reaches it (reachedBy), the state
it must be in, and one line of detail when it helps.`;
}

/**
 * Builds the prompt for one focus slice of the behaviour inventory.
 *
 * @param input - Workflow args plus derived paths
 * @param focus - The inventory focus with its name, id prefix and brief
 * @returns The prompt
 */
function inventoryPrompt(input, focus) {
  return `
Build the ${focus.name} slice of a behaviour inventory for this branch.

Branch: ${input.branch}
${packRule(input)}
Read the diff at \`${input.diffPath}\` hunk by hunk.

Inventory BEHAVIOURS, not files: one entry per thing that can now act
differently — a changed function, a new branch of logic, a changed status code
or response shape, a changed redirect, a new side effect, each surface a
changed file shows up on.
One file routinely produces several entries; a pure rename produces none.

${focus.brief}

For each entry: id (\`${focus.prefix}-1\`, \`${focus.prefix}-2\`, …), behaviour
(one line), where (file:line), reachable (the action, request or event that
triggers it), actors (which of ${ACTORS}), visible (true when a person using
the product could notice it), section (when visible, which of
${HUMAN_KEYS.map((key) => `\`${key}\``).join(', ') || '(none)'} it shows up in;
otherwise null), and dimension when the entry exists because of a
cross-cutting dimension.`;
}

/**
 * Lists the inventory foci that apply to the touched sections.
 *
 * @param input - Workflow args plus derived paths
 * @param surfacesByKey - The surfaces found for each human section
 * @param visibleSections - The human sections the explorer found a noticeable change in
 * @returns One focus per inventory agent
 */
function inventoryFoci(input, surfacesByKey, visibleSections) {
  const foci = [];

  if (input.sections.backend) {
    foci.push({ name: 'backend', prefix: 'be', brief: BACKEND.scope });
  }

  // A section with nothing to notice gets no slice, though an audit entry can still draft it.
  for (const key of HUMAN_KEYS.filter(
    (k) => input.sections[k] && visibleSections.has(k),
  )) {
    const section = SECTIONS[key];
    foci.push({
      name: key,
      prefix: key,
      brief: `${section.inventoryBrief}

Surfaces found for this section (verify them against the diff; each is its own
entry):
${JSON.stringify(surfacesByKey[key] ?? [], null, 1)}`,
    });
  }

  if (!CONFIG.experiments.dropCrossCutting) {
    foci.push({
      name: 'cross-cutting',
      prefix: 'xc',
      brief: `Scope: the dimensions single-layer passes miss. For every changed
behaviour ask which of these apply and add entries for the ones that do:
${DIMENSIONS}.`,
    });
  }

  return foci;
}

/**
 * Builds the prompt auditing the inventory for missing entries from one angle.
 *
 * @param input - Workflow args plus derived paths
 * @param entries - The inventory so far
 * @param angle - The audit angle, with its `key` and `brief`
 * @returns The prompt
 */
function auditPrompt(input, entries, angle) {
  return `
You are the adversarial SUFFICIENCY auditor for a PR QA inventory. Your only
question: WHAT IS MISSING? You add entries; you never remove or edit them.

Branch: ${input.branch}
Read the RAW DIFF at \`${input.diffPath}\` — not just the pack; a blind spot in
the pack must not survive you.${packRule(input)}

The inventory so far:
${JSON.stringify(entries, null, 1)}

${angle.brief}

Return ONLY the missing entries (id prefix \`aud-${angle.key}-\`), in the same shape.
Return an empty list if you genuinely find nothing — do not invent filler.`;
}

const AUDIT_ANGLES = [
  {
    key: 'hunks',
    brief: `Angle: HUNK COVERAGE. Walk every hunk of the diff, ${PROMPTS.auditCallers}.
Any hunk whose behavioural consequence has no entry, any caller or surface with
no entry, any deleted code whose absence has no entry — those are your
findings.`,
  },
  {
    key: 'dimensions',
    brief: `Angle: DIMENSIONS. For every existing entry ask which cross-cutting
dimension is unexplored: ${DIMENSIONS}. An entry list can be accurate per-hunk
and still miss the case that breaks.`,
  },
];

/**
 * Tells a drafter to cite the tests that already prove a behaviour instead of
 * writing a step for it.
 *
 * @param testFiles - The test files found by the explorer
 * @param kinds - The kinds of test that count, in the section's words
 * @returns The prompt fragment
 */
function coverageRule(testFiles, kinds) {
  return `## Coverage rule
A manual step exists only for what no test proves. When ${kinds} below
already asserts an entry's behaviour, the entry resolves to a coveredByTests
claim naming the file and the specific assertion — never to a step that
repeats it. The section ends with one "Covered by" line built from the
claims. Every claim is verified; one that fails becomes a test gap for code
review, not a manual step. Never write a step that runs lint, the type
checker, the build or a test suite: Local CI covers those.

Tests that exist:
${JSON.stringify(testFiles, null, 1)}`;
}

/**
 * Builds the prompt pruning the inventory down to what could actually break.
 *
 * @param input - Workflow args plus derived paths
 * @param entries - The inventory after the audit
 * @param testFiles - The test files found by the explorer
 * @returns The prompt
 */
function prunePrompt(input, entries, testFiles) {
  return `
You are the PRUNER for a PR QA inventory. The inventory agents and auditors
only ever add entries; you are the one step that removes them, so the
checklist carries one step per behaviour that could actually break.

Branch: ${input.branch}
Read the diff at \`${input.diffPath}\`.${packRule(input)}

Tests that exist:
${JSON.stringify(testFiles, null, 1)}

The inventory:
${JSON.stringify(entries, null, 1)}

Return:
- merge — groups that are one behaviour differing only by input, or one
  shared component at several render sites. Name the entry to \`keep\` (for a
  shared component, the riskiest page), every id in the group in \`ids\`, and
  in \`inputs\` the inputs or pages the kept entry now stands for.
- drop — entries to remove, each with a reason:
  - \`passes-on-main\` — the old code would satisfy it too: the behaviour did
    not change, only code near it did. Say what shows that in \`why\`.
  - \`covered\` — a test above already asserts it. Name the \`testFile\` and the
    \`assertion\`. It is checked later; one that does not hold is reported to
    code review as a test gap.

Never drop a check only a person can judge (how it looks or feels, a screen
reader). Never drop deleted behaviour unless a test asserts it is gone. An
entry you do not mention is kept. Never run a command other than reading and
searching files.`;
}

/**
 * Builds the prompt drafting one group of the agent-runnable backend checks.
 *
 * @param input - Workflow args plus derived paths
 * @param entries - The backend inventory entries this drafter covers
 * @param testFiles - The test files found by the explorer
 * @param group - This drafter's position, as `{ index, count }`
 * @returns The prompt
 */
function backendDraftPrompt(input, entries, testFiles, group) {
  const split =
    group.count > 1
      ? `\nThe backend entries are split across ${group.count} drafters; you are
number ${group.index + 1}. Cover ONLY the entries below — the others are
covered elsewhere.\n`
      : '';

  return `
Draft steps for the ${BACKEND.title.toUpperCase()} section of a Manual QA
checklist — terminal-only checks (${BACKEND.tools}). No human judgment.
${packRule(input)}
${split}
${coverageRule(testFiles, 'the automated suite')}

## Inventory entries to cover
${JSON.stringify(entries, null, 1)}

Every entry resolves to exactly one of: a step (list its ids in
coversEntryIds), a coveredByTests claim, or a gap (one line: gap + why it is
out of reach — e.g. ${BACKEND.gapExamples}). Never silently drop one.

## Step shape
${STEP_FORMAT}
${draftEnvironment(input)}

Order steps cheapest-and-highest-signal first, blocking before if-time. Give
each step the minutes a tester needs for it.`;
}

/**
 * Builds the prompt drafting one human section.
 *
 * @param input - Workflow args plus derived paths
 * @param key - The human section key
 * @param entries - The visible inventory entries for this section
 * @param surfaces - The section's surfaces
 * @param testFiles - The test files found by the explorer
 * @param group - This drafter's position, as `{ index, count }`
 * @returns The prompt
 */
function humanDraftPrompt(input, key, entries, surfaces, testFiles, group) {
  const section = SECTIONS[key];
  const opening =
    group.index === 0
      ? `Step 1 is ${section.firstStep}.`
      : `Another drafter writes the section's opening step (${section.firstStep}); assume the tester has done it, and do not repeat it.`;
  const shared =
    group.count > 1
      ? `\nThis section's entries are split across ${group.count} drafters; you are
number ${group.index + 1}. Cover ONLY the entries below — the others are
covered elsewhere.\n`
      : '';
  const split = section.agent
    ? `

## Who runs each step
This section is published as two headings: ${section.agent.title}, which an
agent runs, then ${section.title}, which a person runs. Give every step a
\`runner\`:
${RUNNER_RULES}`
    : '';

  return `
Draft the ${section.title.toUpperCase()} section of a Manual QA checklist —
everything that needs a person at ${section.where}.
${packRule(input)}
${shared}
${coverageRule(testFiles, section.coveredBy)}
A check that needs a person's judgement — how it looks or feels, a real
screen reader or device — is never covered by a test, so it is always a step.

## Surfaces
${JSON.stringify(surfaces, null, 1)}

## Inventory entries to cover
${JSON.stringify(entries, null, 1)}

Every entry resolves to exactly one of: a step (list its ids in
coversEntryIds), a coveredByTests claim, or a gap (one line: gap + why it is
out of reach). Never silently drop one.

## Step shape
${STEP_FORMAT}
${draftEnvironment(input)}

${opening} Read the seed and env files the facts file
lists for the real values. Each step names ${section.stepNames}. Judgement
steps keep their framing as ${section.audience} would read it — that IS the
instruction — with no coverage justification paragraphs. Order cheapest-signal first, blocking
before if-time. Give each step the minutes a tester needs for it.${split}`;
}

/**
 * Builds the prompt drafting the Storybook review items.
 *
 * @param input - Workflow args plus derived paths
 * @returns The prompt
 */
function storybookDraftPrompt(input) {
  return `
Draft the STORYBOOK REVIEW CHECKS section of a Manual QA checklist — the new
or changed UI states a reviewer should eyeball in Storybook.
${packRule({ ...input, packPath: null })}

Read the diff at \`${input.diffPath}\`. The facts file lists the story files
for the changed components, with their meta titles. Open each one, confirm the
\`title:\` and the export names, and read what the branch changed in the
component it renders.

Each item carries EXACTLY two things:
- The story's meta title (the \`title:\` from the story file — what the
  reviewer types into Storybook's search) plus the export names worth opening.
- ONE line (two at most) saying what changed that needs eyeballing and the
  expectation, together.

No file paths in the output (keep storyFile in the data for verification
only), no routes, no numbered click walkthroughs, no separate Expected
paragraph. Drop stories the branch did not visibly change.`;
}

/**
 * Builds the prompt drafting the smoke check for a pure move.
 *
 * @param input - Workflow args plus derived paths, with the verified `bootMarkdown`
 * @returns The prompt
 */
function smokePrompt(input) {
  return `
Draft the SMOKE CHECK of a Manual QA checklist. The triage found this branch
only moves or renames code, so the type checker and the build prove most of
it. Write at most ${CONFIG.budget.move} step(s) proving the moved code still runs.

Branch: ${input.branch}
Diff stat:
${input.diffStat}

Read the diff at \`${input.diffPath}\`.${packRule(input)}

Pick the page, route or command that exercises the most moved code. Load it,
do its main action, and expect it to work with no errors in the console or the
server log. Never walk through every screen; this is a smoke check.

## Step shape
${STEP_FORMAT}
${draftEnvironment(input)}

Return the steps, with empty coveredByTests, and a gap only for something the
move could break that no step can reach.`;
}

/**
 * Lists the boot commands this diff needs.
 *
 * @returns The commands, in the config's order
 */
function bootCommands() {
  return CONFIG.boot.start.filter((entry) => bootNeeds(entry.when)).map((entry) => entry.run);
}

/**
 * Builds the prompt drafting the checklist boot block.
 *
 * @param input - Workflow args plus derived paths
 * @returns The prompt
 */
function bootDraftPrompt(input) {
  const variables = CONFIG.boot.variables.filter((variable) => bootNeeds(variable.when));

  return `
Draft the BOOT BLOCK for a Manual QA checklist — the one place the environment
is set up and explained. Every section's steps assume it already ran.
${packRule(input)}

The triage found this diff needs ${triage.touches.join(', ') || 'nothing'} running, so
boot only this, once, ahead of every section. From the repo root:

\`\`\`bash
${bootCommands().join('\n')}
\`\`\`

Then ONE line deriving what the sections need:
${bullets(variables.map((variable) => `\\$${variable.name} — ${variable.from}`))}

Read the real names from the repo, never invent them. Run each section in a
single shell: variables from its earlier steps carry forward. Check the
branch for ${PROMPTS.gating}. State an environment caveat (${PROMPTS.bootCaveats})
HERE once, never in steps — and only one that changes what a tester sees in
an Expect line. FIVE caveat lines at most; no preamble, no explanation of
the stack. End with what confirms the boot worked. Return only the markdown.`;
}

/**
 * Builds the prompt writing the PR summary.
 *
 * @param input - Workflow args plus derived paths
 * @returns The prompt
 */
function summaryPrompt(input) {
  return `
Write the PR summary for this branch.

Branch: ${input.branch}
Diff stat:
${input.diffStat}

Read the diff at \`${input.diffPath}\`${input.largeDiff ? ` (large — use the per-file patches in \`${input.patchDir}\`)` : ''} and the commit subjects.

Hard rules, every PR, no exceptions:
- Lead paragraph: 2–4 sentences, why + what, prose. HARD CAP 4.
- No ### sub-headers except the optional bullet sections below.
- Optional, each only when genuinely non-empty: \`### Key Changes\` (skip if
  the PR touches one concern), \`### Notable Decisions\`, \`### Out of Scope\`.
- No file lists (a path only when it IS the point), no architecture write-up,
  no mermaid, no filler. Under ~25 lines total.

Return only the markdown.`;
}

const VERDICT_OUTPUT = `
## Output
Report through the structured-output tool: \`verdicts\`, one entry per unit
below, each with:
  id        the unit's id, copied exactly
  verdict   PASS | FAIL | DELETE
  findings  what you read and what it showed, file:line where it helps
  rewrite   on FAIL, the corrected unit in the same shape as the original,
            title line included; otherwise null

DELETE a unit with no accurate version (unreachable by hand, needs
instrumentation); it is published as a gap with your findings. Return a
verdict for every unit. A missing id counts as unverified and the unit is left
out of the checklist.`;

/**
 * Lays out the units a checker is given, as JSON closing its prompt.
 *
 * @param units - The units under verification
 * @param withFindings - Whether to include what the previous round found wrong
 * @returns The units section of the prompt
 */
function unitsBlock(units, withFindings) {
  const shown = units.map((unit) => ({
    id: unit.id,
    name: unit.label,
    kind: unit.kind,
    ...(unit.runner ? { runner: unit.runner } : {}),
    ...(unit.storyFile ? { storyFile: unit.storyFile } : {}),
    ...(withFindings ? { previousFindings: unit.findings } : {}),
    body: unit.body,
  }));

  return `## The units\n${JSON.stringify(shown, null, 1)}`;
}

/**
 * Builds the prompt verifying a batch of checklist units against the code.
 *
 * @param input - Workflow args plus derived paths
 * @param units - Up to `PER_VERIFIER_CAP` units under verification
 * @returns The prompt
 */
function verifyPrompt(input, units) {
  const kinds = new Set(units.map((unit) => unit.kind));
  const reduced = [];

  if (kinds.has('storybook')) {
    reduced.push(`
For a storybook item the checks reduce to: the meta title matches its story
file's \`title:\` exactly (\`storyFile\` below), every listed export exists, the
what-changed line matches what the story actually renders, and the format holds
(title + exports + one line, nothing else).`);
  }
  if (kinds.has('claim')) {
    reduced.push(`
For a claim the checks reduce to one question: does an assertion in the named
test file GENUINELY cover the inventory entry — not the same function under
different conditions, not a sibling case? Open the file and quote the test name
and line in findings. PASS when it does. FAIL with rewrite null when the file
is missing, or the assertion is absent or narrower than the claim; the entry
is then reported to code review as a test gap. Never run the test.`);
  }
  if (kinds.has('boot')) {
    reduced.push(`
For the boot block the checks reduce to: every command is real and in the
right order, the derivations produce what sections use, every flag, setting
or env caveat for the touched code that changes an Expect line is stated
(and none invented), there are five caveat lines at most, and nothing here
belongs in a step (no step-specific state).`);
  }

  const runnerCheck = units.some((unit) => unit.runner) ? RUNNER_CHECK : '';

  return `
Verify ${units.length === 1 ? 'ONE unit' : `${units.length} units`} of a Manual QA checklist against the actual code.
Prove each would genuinely observe what it claims. Be adversarial — assume each
is wrong until the code says otherwise. Judge every unit on its own merits;
holding several at once only saves re-reading the same code.

## What the branch changed
${input.diffStat}
Full diff: \`${input.diffPath}\`. ${packRule(input)}

## Boot block these units may rely on (steps assume it ran; do not re-check it)
${kinds.has('boot') ? '(the boot block is one of the units below)' : input.bootMarkdown || '(none)'}

## Known traps
Read \`${CONFIG.traps}\` in full before judging.

## Checks — run all that apply, to every unit
${EIGHT_CHECKS}${runnerCheck}
${reduced.join('\n')}
${VERDICT_OUTPUT}

${unitsBlock(units, false)}`;
}

/**
 * Builds the narrower prompt for a batch of rewrites in the later rounds.
 *
 * @param input - Workflow args plus derived paths
 * @param units - Rewritten units, each carrying the `findings` that sent it back
 * @returns The prompt
 */
function recheckPrompt(input, units) {
  return `
These Manual QA checklist units failed verification and were rewritten. Check
each rewrite against the code.

Full diff: \`${input.diffPath}\`. ${packRule(input)}
Traps: \`${CONFIG.traps}\`.

PASS a unit only when every problem in its \`previousFindings\` is fixed from
the code, not by assertion, and the rewrite introduces no new identifier,
command or expected value you have not confirmed in the repo. Verification is
CODE-READING ONLY — never run anything.${units.some((unit) => unit.runner) ? RUNNER_CHECK : ''}
${VERDICT_OUTPUT}

${unitsBlock(units, true)}`;
}

/**
 * Builds the prompt fixing only a unit's format.
 *
 * @param unit - The unit with format problems
 * @param problems - The problems the format check found
 * @returns The prompt
 */
function formatFixPrompt(unit, problems) {
  return `
Fix the FORMAT of one Manual QA checklist step. Change nothing else — not a
command, a value, an expected output or the meaning of any line.

Problems found:
${bullets(problems)}

The format:
${STEP_FORMAT}

The step:
${unit.body}

Return the corrected step as markdown, keeping its bold title line.`;
}

/**
 * Builds the prompt turning recurring checker findings into trap candidates.
 *
 * @param failures - Every first-round failure, as `{ unit, findings }`
 * @returns The prompt
 */
function trapsPrompt(failures) {
  return `
Checkers sent back these Manual QA checklist steps on one PR. Find the
mistakes that REPEAT: one fact about this repository's environment, seed data
or tooling that broke several steps, and that a drafter told about it up front
would never have made.

Read \`${CONFIG.traps}\` first. Skip anything it already covers.

Return only facts behind at least ${TRAP_MIN_UNITS} of the steps below. For each:
  trap      the mistake, in one line
  why       why the obvious step fails, citing file:line where the findings do
  instead   what a step should do instead
  units     how many of the steps below it broke
Return an empty list when nothing repeats — a one-off mistake is not a trap.
Never run a command.

## The failures
${JSON.stringify(failures, null, 1)}`;
}

// =============================================================================
// Format check
// =============================================================================

const LABELS = ['**Setup:**', '**Expect:**', '**If wrong:**', '**Teardown:**'];

/**
 * Finds the step-format problems a script can see without reading code.
 *
 * @param unit - A backend or human step unit
 * @returns One line per problem, empty when the format holds
 */
function formatProblems(unit) {
  if (!['backend', 'human'].includes(unit.kind)) return [];

  const problems = [];
  const body = unit.body;

  if (!body.includes('**Expect:**')) problems.push('no **Expect:** line');
  if (/Teardown:\**\s*none/i.test(body)) {
    problems.push('says "Teardown: none" — leave Teardown out instead');
  }
  if (unit.kind === 'backend' && !/```/.test(body)) {
    problems.push('a terminal step with no fenced command block');
  }

  const positions = LABELS.map((label) => body.indexOf(label)).filter(
    (index) => index !== -1,
  );
  if (positions.some((index, i) => i > 0 && index < positions[i - 1])) {
    problems.push('labels out of order — Setup, command, Expect, If wrong, Teardown');
  }

  return problems;
}

/**
 * Has a light agent fix a unit's format problems before an Opus round sees it.
 *
 * @param unit - The unit to check
 * @returns The unit, with its body fixed when the check found problems
 */
async function fixFormat(unit) {
  const problems = formatProblems(unit);
  if (problems.length === 0) return unit;

  const fixed = await agent(formatFixPrompt(unit, problems), {
    label: `format:${unit.label}`,
    phase: 'Draft and verify',
    schema: TEXT_SCHEMA,
    model: LIGHT,
  });

  return fixed?.markdown ? { ...unit, body: fixed.markdown } : unit;
}

// =============================================================================
// Verification driver
// =============================================================================

/** How many checker agents verification has started, for the stats. */
let checkerAgents = 0;

/** Every step a first-round checker sent back, for the trap suggestions. */
const firstRoundFailures = [];

/**
 * Splits units into checker batches of at most `PER_VERIFIER_CAP`.
 *
 * @param units - The units to check
 * @returns The batches, in order
 */
function batchUnits(units) {
  const batches = [];
  for (let i = 0; i < units.length; i += PER_VERIFIER_CAP) {
    batches.push(units.slice(i, i + PER_VERIFIER_CAP));
  }
  return batches;
}

/**
 * Verifies one group of units, several to a checker, then re-checks each failed rewrite.
 *
 * Rounds after the first only confirm a rewrite fixed what its findings named,
 * so they always run on Sonnet.
 *
 * @param input - Workflow args plus derived paths
 * @param group - The group's name, used in the log and the checker labels
 * @param units - The group's units: one drafter's steps and claims, the Storybook items or the boot block
 * @param options - The `model` for round 1, and `onRound`, handed each round's settled outcomes as soon as that round ends
 * @returns One outcome per unit, in order: the final `unit`, its `fate` (pass, deleted, exhausted or unverified) and the `reason`
 */
async function verifyUnits(input, group, units, { model = DEEP, onRound = () => {} } = {}) {
  if (units.length === 0) return [];

  const outcomes = [];
  let pending = await Promise.all(
    units.map((unit, i) => fixFormat({ ...unit, id: `u${i + 1}`, order: i })),
  );

  log(
    `Verifying ${units.length} ${group} unit(s) with ${batchUnits(pending).length} checker(s)`,
  );

  for (let round = 1; round <= MAX_VERIFY_ROUNDS && pending.length > 0; round++) {
    const batches = batchUnits(pending);
    checkerAgents += batches.length;

    const answers = await Promise.all(
      batches.map((batch, i) =>
        agent(round === 1 ? verifyPrompt(input, batch) : recheckPrompt(input, batch), {
          label: `verify:${group}${round > 1 ? `:r${round}` : ''}${batches.length > 1 ? `:b${i + 1}` : ''}`,
          phase: 'Draft and verify',
          schema: VERDICTS_SCHEMA,
          model: round > 1 ? LIGHT : model,
        }),
      ),
    );

    const failed = [];
    const settled = [];

    batches.forEach((batch, i) => {
      const verdicts = new Map();
      for (const verdict of answers[i]?.verdicts ?? []) {
        if (!verdicts.has(verdict.id)) verdicts.set(verdict.id, verdict);
      }

      for (const batchUnit of batch) {
        const verdict = verdicts.get(batchUnit.id);
        const unit =
          batchUnit.runner && RUNNERS.includes(verdict?.runner)
            ? { ...batchUnit, runner: verdict.runner }
            : batchUnit;

        if (round === 1 && verdict && verdict.verdict !== 'PASS' && unit.kind !== 'claim') {
          firstRoundFailures.push({
            unit: unit.label,
            findings: String(verdict.findings ?? '').slice(0, 600),
          });
        }

        if (!verdict) {
          settled.push({
            unit,
            fate: 'unverified',
            reason: answers[i]
              ? 'the checker gave no verdict for it'
              : 'the checker returned nothing',
          });
        } else if (verdict.verdict === 'PASS') {
          settled.push({ unit, fate: 'pass' });
        } else if (verdict.verdict === 'DELETE' || !verdict.rewrite) {
          settled.push({ unit, fate: 'deleted', reason: verdict.findings });
        } else if (round === MAX_VERIFY_ROUNDS) {
          settled.push({ unit, fate: 'exhausted', reason: verdict.findings });
        } else {
          failed.push({ ...unit, body: verdict.rewrite, findings: verdict.findings });
        }
      }
    });

    outcomes.push(...settled);
    onRound(settled);
    pending = await Promise.all(failed.map(fixFormat));
  }

  return outcomes.sort((a, b) => a.unit.order - b.unit.order);
}

// =============================================================================
// Assembly helpers
// =============================================================================

/**
 * Drops inventory entries repeating an earlier entry's location and behaviour.
 *
 * @param entries - The inventory entries
 * @returns The first entry for each location and behaviour
 */
function dedupeEntries(entries) {
  const seen = new Map();

  for (const entry of entries) {
    const key = `${entry.where}|${entry.behaviour}`.toLowerCase();
    if (!seen.has(key)) seen.set(key, entry);
  }

  return [...seen.values()];
}

/**
 * Splits entries into drafting groups, keeping each file's entries together.
 *
 * @param entries - One section's entries
 * @returns Groups of at most `DRAFT_CHUNK` entries
 */
function chunkEntries(entries) {
  const byFile = new Map();

  for (const entry of entries) {
    const file = String(entry.where).split(':')[0];
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file).push(entry);
  }

  const chunks = [];
  let current = [];

  for (const group of byFile.values()) {
    // A file whose entries would overflow the group starts a fresh one.
    if (current.length > 0 && current.length + group.length > DRAFT_CHUNK) {
      chunks.push(current);
      current = [];
    }
    for (const entry of group) {
      if (current.length === DRAFT_CHUNK) {
        chunks.push(current);
        current = [];
      }
      current.push(entry);
    }
  }

  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * Wraps a drafted step as a verification unit.
 *
 * @param kind - The section key the step belongs to
 * @param step - The drafted step
 * @param origin - What produced it, used in the label
 * @returns The unit
 */
function stepUnit(kind, step, origin = kind) {
  const split = Boolean(SECTIONS[kind]?.agent);

  return {
    kind: kind === 'backend' ? 'backend' : 'human',
    section: kind,
    ...(split
      ? { runner: RUNNERS.includes(step.runner) ? step.runner : 'human' }
      : {}),
    label: `${origin}:${step.title.slice(0, 40)}`,
    body: `**[${step.priority}] ${step.title}**\n\n${step.body}`,
    step,
  };
}

/**
 * Renders steps as a numbered checkbox list with blocking steps first.
 *
 * @param steps - The steps to render
 * @param prefix - The section name leading each step number
 * @param start - How many steps of the same name came before, in an earlier half
 * @returns The list markdown
 */
function numberSteps(steps, prefix, start = 0) {
  const ordered = [
    ...steps.filter((step) => step.priority === 'blocking'),
    ...steps.filter((step) => step.priority !== 'blocking'),
  ];

  return ordered
    .map(
      (step, i) =>
        `- [ ] **[${step.priority}] ${prefix} ${start + i + 1} — ${step.title}**\n\n${step.body.trim()}\n`,
    )
    .join('\n');
}

/**
 * Writes a section's timing line from its steps' minute estimates.
 *
 * @param steps - The section's steps
 * @param paste - Whether the tester pastes what they observed
 * @param runs - Who runs the steps, opening the line
 * @returns The timing line
 */
function timingLine(steps, paste, runs = '') {
  const minutes = totalMinutes(steps);
  const blocking = steps.filter((step) => step.priority === 'blocking').length;
  const time = minutes > 0 ? `About ${Math.max(1, Math.round(minutes))} minutes` : 'Time not estimated';
  const note = paste ? ' Paste what you observed under each step.' : '';

  const lead = runs ? `${runs}. ${time}` : time;

  return `_${lead}; ${blocking} of ${steps.length} steps are blocking.${note}_`;
}

/**
 * Renders a split section as its agent half, then its human half.
 *
 * Numbering runs on from one half into the next, so every step keeps a label
 * of its own.
 *
 * @param section - The section, with its `agent` half
 * @param steps - Every verified step, each with its `runner`
 * @returns The two halves' markdown, each opening with `---`
 */
function splitSectionMarkdown(section, steps) {
  const agentSteps = steps.filter((step) => step.runner === 'agent');
  const humanSteps = steps.filter((step) => step.runner !== 'agent');
  const note = section.agent.note
    ? `\n\n> [!NOTE]\n${section.agent.note
        .trim()
        .split('\n')
        .map((line) => `> ${line}`.trimEnd())
        .join('\n')}`
    : '';

  const agentBody =
    agentSteps.length > 0
      ? `${timingLine(agentSteps, true, section.agent.runs)}${note}\n\n${numberSteps(agentSteps, section.label)}`
      : '_No step here can be run by an agent._';
  const humanBody =
    humanSteps.length > 0
      ? `${timingLine(humanSteps, false)}\n\n${numberSteps(humanSteps, section.label, agentSteps.length)}`
      : "_Every check above can be run by an agent; nothing here needs a person's judgement._";

  return [
    `---\n\n## ${section.agent.title}\n\n${agentBody}`,
    `---\n\n## ${section.title}\n\n${humanBody}`,
  ];
}

/**
 * Renders verified Storybook items as checkboxes.
 *
 * Each item renders from its verified text, so a meta title or export the
 * checker corrected is the one the reviewer sees.
 *
 * @param bodies - The verified item bodies: a title line, then what changed
 * @returns The list markdown
 */
function storybookMarkdown(bodies) {
  return bodies
    .map((body) => {
      const [head, ...rest] = body.trim().split('\n');
      const lines = rest.map((line) => line.trim()).filter(Boolean);
      return `- [ ] ${head.trim()}\n      ${lines.join('\n      ')}\n`;
    })
    .join('\n');
}

/**
 * Builds the Local CI checklist block.
 *
 * @param branch - The branch name, filled into the note
 * @param extra - Boxes to add after the configured ones
 * @returns The block markdown
 */
function localCiBlock(branch, extra = []) {
  const boxes = [...CONFIG.localCi, ...extra].map((line) => `- [ ] ${line}`).join('\n');
  const note = CONFIG.localCiNote
    ? `\n\n${CONFIG.localCiNote.split('{{branch}}').join(branch)}`
    : '';

  return `### Local CI\n\n${boxes}${note}`;
}

/**
 * Removes the leading bold priority title line from a step body.
 *
 * @param body - The step markdown
 * @returns The body without its title line
 */
function stripTitle(body) {
  return body.replace(/^\*\*\[[^\]]+\][^\n]*\*\*\n+/, '');
}

/**
 * Reads a verified step back out of its unit, keeping any retitle or reprioritising.
 *
 * @param unit - A verified step unit, whose body opens with its bold title line
 * @returns The step, with the priority and title from that line when it has them
 */
function readStep(unit) {
  const line = /^\*\*\[(blocking|if-time)\] ([^\n]+?)\*\*[ \t]*(?:\n|$)/.exec(
    unit.body.trimStart(),
  );

  return {
    ...unit.step,
    ...(unit.runner ? { runner: unit.runner } : {}),
    ...(line ? { priority: line[1], title: line[2].trim() } : {}),
    body: stripTitle(unit.body.trimStart()),
  };
}

/**
 * Shortens a verifier's findings to one line for a gap or warning.
 *
 * @param text - The findings
 * @returns At most 160 characters, on one line
 */
function oneLine(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
}

// =============================================================================
// Run
// =============================================================================

// Some hosts hand `args` over JSON-encoded; accept either shape.
const input = { ...(typeof args === 'string' ? JSON.parse(args) : args) };

input.packPath = `${input.scratchDir}/pr-qa-pack.tmp.md`;
input.sections = input.sections ?? {};

const touched = Object.keys(SECTIONS).filter((key) => input.sections[key]);

/**
 * Builds the result for a diff that needs no manual steps.
 *
 * The Local CI boxes stay, so a push the gate resets still needs a tick.
 *
 * @param summary - The summary agent's answer
 * @param why - What the checklist says instead of steps
 * @param lead - Lines to open the checklist with, such as the triage line
 * @returns The workflow result
 */
function summaryOnly(summary, why, lead = []) {
  return {
    summary: summary?.markdown ?? '',
    checklist: [...lead, `_No manual checks needed — ${why}._`, `---\n\n${localCiBlock(input.branch)}`].join('\n\n'),
    gaps: [],
    unresolved: [],
    trapCandidates: [],
    stats: { entries: 0, steps: 0, verified: 0 },
  };
}

if (touched.length === 0) {
  phase('Draft and verify');
  log('No runtime surface touched — summary only');

  const summary = await agent(summaryPrompt(input), {
    label: 'summary',
    phase: 'Draft and verify',
    schema: TEXT_SCHEMA,
    model: LIGHT,
  });

  return summaryOnly(summary, 'no runtime surface touched');
}

phase('Triage');

// The summary needs only the diff, so it runs alongside everything else.
const summaryRun = agent(summaryPrompt(input), {
  label: 'draft:summary',
  phase: 'Triage',
  schema: TEXT_SCHEMA,
  model: LIGHT,
});

/**
 * Combines the triage agent's labels with what the prepass worked out.
 *
 * A script finding is never overruled: the agent can add to what the diff
 * touches and answer more questions yes, never fewer.
 *
 * @param answer - The triage agent's answer, or null when it returned nothing
 * @returns The `kind`, `size`, `touches` and yes `outsideRepo` answers
 */
function settleTriage(answer) {
  const hints = input.triage ?? {};
  // Without hints from the prepass, anything could need running.
  const hinted = hints.touches ?? TOUCHES;
  const said = answer?.touches ?? [];

  const outsideRepo = CONFIG.outsideRepo
    .map((question) => {
      const found = (hints.outsideRepo ?? []).find((a) => a.ask === question.ask);
      const yes = (answer?.outsideRepo ?? []).find(
        (a) => a.ask === question.ask && a.yes,
      );
      if (!found && !yes) return null;

      return {
        ask: question.ask,
        why: yes?.why ?? 'a changed file matches it',
        files: [...new Set([...(found?.files ?? []), ...(yes?.files ?? [])])],
      };
    })
    .filter(Boolean);

  return {
    kind: answer?.kind ?? 'behaviour',
    size: answer?.size ?? 'large',
    touches: TOUCHES.filter((t) => hinted.includes(t) || said.includes(t)),
    outsideRepo,
  };
}

const triage = settleTriage(
  await agent(triagePrompt(input), {
    label: 'triage',
    phase: 'Triage',
    schema: TRIAGE_SCHEMA,
    model: LIGHT,
  }),
);

/**
 * Writes the line opening the checklist, so a tester knows the size of the job first.
 *
 * @param minutes - The checklist's estimated minutes, or 0 when not estimated
 * @returns The triage line
 */
function triageLine(minutes) {
  const kind = KIND_NAMES[triage.kind] + (triage.kind === 'behaviour' ? ` (${triage.size})` : '');
  const needs = triage.touches.length > 0 ? `needs ${triage.touches.join(', ')}` : 'needs nothing running';
  const time = minutes > 0 ? `about ${Math.max(1, Math.round(minutes))} minutes` : 'time not estimated';

  return `_Triage: ${kind} · ${needs} · ${time}_`;
}

log(`Triage: ${triageLine(0)}`);

if (triage.kind === 'tooling') {
  log('Triage found nothing that runs in the product — summary only');
  return summaryOnly(await summaryRun, 'nothing this branch changes runs in the product', [triageLine(0)]);
}

/**
 * Drafts the boot block, then verifies it.
 *
 * @param context - Workflow args plus derived paths
 * @param phaseName - The phase the draft is shown under
 * @returns The boot block's verification outcome, or null when no draft came back
 */
function startBoot(context, phaseName) {
  if (bootCommands().length === 0) {
    log('The diff needs nothing started — no boot block');
    return Promise.resolve(null);
  }

  return agent(bootDraftPrompt(context), {
    label: 'draft:boot',
    phase: phaseName,
    schema: TEXT_SCHEMA,
    model: DEEP,
  }).then((boot) =>
    boot?.markdown
      ? verifyUnits(context, 'boot', [
          { kind: 'boot', label: 'boot', body: boot.markdown },
        ]).then(([outcome]) => outcome)
      : null,
  );
}

const BOOT_WARNINGS = {
  deleted: 'the checker found no accurate version',
  exhausted: `it still failed after ${MAX_VERIFY_ROUNDS} rounds`,
  unverified: 'the checker returned no verdict',
};

/**
 * Settles the verified boot block. Every step assumes it, so one that failed
 * is kept, flagged with a warning, rather than dropped.
 *
 * @param outcome - The boot block's verification outcome, or null
 * @returns The `body` drafters write against, and the `published` markdown
 */
function settleBoot(outcome) {
  const body = outcome?.unit.body ?? '';
  if (!outcome || outcome.fate === 'pass') return { body, published: body };

  log(`Boot block did not pass verification (${outcome.fate}) — published with a warning`);
  const why = [BOOT_WARNINGS[outcome.fate], oneLine(outcome.reason)]
    .filter(Boolean)
    .join(': ');

  return {
    body,
    published: `> [!WARNING]\n> **This boot block did not pass verification** — ${why}. Check each command against the repository before relying on it.\n\n${body.trim()}`,
  };
}

/**
 * Turns the units verification left out into gaps the author hears about.
 *
 * @param outcomes - Verification outcomes
 * @returns One gap per deleted, exhausted or unverified unit
 */
function outcomeGaps(outcomes) {
  return outcomes.flatMap((o) => {
    if (o.fate === 'deleted') {
      log(`Deleted (no accurate version): ${o.unit.label}`);
      return [{ gap: o.unit.label, why: `no accurate manual version — ${oneLine(o.reason)}` }];
    }
    if (o.fate === 'exhausted') {
      log(`Left out, still failing after ${MAX_VERIFY_ROUNDS} rounds: ${o.unit.label}`);
      return [{ gap: o.unit.label, why: `failed verification ${MAX_VERIFY_ROUNDS} times — ${oneLine(o.reason)}` }];
    }
    if (o.fate === 'unverified') {
      log(`Left out, never verified (${o.reason}): ${o.unit.label}`);
      return [{ gap: o.unit.label, why: `never verified — ${o.reason}` }];
    }
    return [];
  });
}

/**
 * Lists the units verification could not settle, for the author's report.
 *
 * @param outcomes - Verification outcomes
 * @returns The labels of exhausted and unverified units
 */
function unresolvedLabels(outcomes) {
  return outcomes
    .filter((o) => o.fate === 'exhausted' || o.fate === 'unverified')
    .map((o) => o.unit.label);
}

/**
 * Sums the minutes a tester needs for some steps.
 *
 * @param steps - The steps
 * @returns Their estimated minutes
 */
function totalMinutes(steps) {
  return steps.reduce((sum, step) => sum + (Number(step.minutes) || 0), 0);
}

if (triage.kind === 'move') {
  phase('Draft and verify');
  log('Triage found a pure move — one smoke check instead of a full checklist');

  // A move needs no context pack: the diff and facts file are enough.
  const moveInput = { ...input, packPath: null };
  const boot = settleBoot(await startBoot(moveInput, 'Draft and verify'));
  moveInput.bootMarkdown = boot.body;

  const drafted = await agent(smokePrompt(moveInput), {
    label: 'draft:smoke',
    phase: 'Draft and verify',
    schema: SECTION_SCHEMA,
    model: DEEP,
  });
  const outcomes = await verifyUnits(
    moveInput,
    'smoke',
    (drafted?.steps ?? []).slice(0, CONFIG.budget.move).map((step) => stepUnit('smoke', step)),
  );
  const steps = outcomes.filter((o) => o.fate === 'pass').map((o) => readStep(o.unit));

  const checklist = [
    triageLine(totalMinutes(steps)),
    boot.published.trim(),
    steps.length > 0
      ? `---\n\n## Smoke Check\n\n${timingLine(steps, true)}\n\n${numberSteps(steps, 'Smoke')}`
      : '',
    `---\n\n${localCiBlock(input.branch, ['The type check and the production build pass'])}`,
  ].filter(Boolean);

  return {
    summary: (await summaryRun)?.markdown ?? '',
    checklist: checklist.join('\n\n'),
    gaps: [...(drafted?.gaps ?? []), ...outcomeGaps(outcomes)],
    unresolved: unresolvedLabels(outcomes),
    trapCandidates: [],
    stats: { entries: 0, steps: steps.length, checkerAgents },
  };
}

phase('Explore');

const surfaceRuns = Object.fromEntries(
  HUMAN_KEYS.filter((key) => input.sections[key]).map((key) => [
    key,
    agent(surfacesPrompt(input, key), {
      label: `surfaces:${key}`,
      phase: 'Explore',
      schema: SURFACES_SCHEMA,
      model: DEEP,
    }),
  ]),
);

const storybookRun =
  CONFIG.storybook && input.storyCount > 0
    ? agent(storybookDraftPrompt(input), {
        label: 'draft:storybook',
        phase: 'Explore',
        schema: STORYBOOK_SCHEMA,
        model: LIGHT,
      })
    : Promise.resolve(null);

const explore = await agent(explorePrompt(input), {
  label: 'context-pack',
  phase: 'Explore',
  schema: EXPLORE_SCHEMA,
  model: DEEP,
});

if (!explore) throw new Error('Context-pack explorer failed — cannot proceed');

const testFiles = explore.testFiles ?? [];
const visibleSections = new Set(explore.visibleSections ?? []);

// The boot block needs only the pack, so it drafts and is verified while the
// inventory and audit run. Every drafter then writes against the verified one.
const bootRun = startBoot(input, 'Inventory');

phase('Inventory');

const surfacesByKey = {};
const unresolvedSurfaces = [];

for (const [key, run] of Object.entries(surfaceRuns)) {
  const found = await run;
  surfacesByKey[key] = found?.surfaces ?? [];
  unresolvedSurfaces.push(...(found?.unresolved ?? []));
}

const slices = await parallel(
  inventoryFoci(input, surfacesByKey, visibleSections).map(
    (focus) => () =>
      agent(inventoryPrompt(input, focus), {
        label: `inventory:${focus.name}`,
        phase: 'Inventory',
        schema: INVENTORY,
        model: DEEP,
      }),
  ),
);

let entries = dedupeEntries(
  slices.filter(Boolean).flatMap((slice) => slice.entries ?? []),
);

log(`Inventory: ${entries.length} entries`);

phase('Audit');

const auditFindings = await parallel(
  AUDIT_ANGLES.map(
    (angle) => () =>
      agent(auditPrompt(input, entries, angle), {
        label: `audit:${angle.key}`,
        phase: 'Audit',
        schema: INVENTORY,
        model: DEEP,
      }),
  ),
);

const combined = dedupeEntries([
  ...entries,
  ...auditFindings.filter(Boolean).flatMap((audit) => audit.entries ?? []),
]);

log(`Audit added ${combined.length - entries.length} entries`);
entries = combined;

/** Every entry the inventory and audit produced, pruned or not, by id. */
const everyEntry = new Map(entries.map((entry) => [entry.id, entry]));

phase('Prune');

/**
 * Applies the pruner's merges and drops, ignoring any id it made up.
 *
 * @param list - The inventory after the audit
 * @param answer - The pruner's answer, or null when it returned nothing
 * @returns The kept `entries`, the `covered` drops to verify as claims, and the `passing` drops
 */
function applyPrune(list, answer) {
  const byId = new Map(list.map((entry) => [entry.id, entry]));
  const removed = new Set();
  const covered = [];
  const passing = [];

  for (const group of answer?.merge ?? []) {
    if (!byId.has(group.keep) || removed.has(group.keep)) continue;
    const others = (group.ids ?? []).filter(
      (id) => id !== group.keep && byId.has(id) && !removed.has(id),
    );
    if (others.length === 0) continue;

    for (const id of others) removed.add(id);
    const kept = byId.get(group.keep);
    byId.set(group.keep, {
      ...kept,
      behaviour: group.inputs ? `${kept.behaviour} — stands for ${group.inputs}` : kept.behaviour,
    });
  }

  for (const drop of answer?.drop ?? []) {
    if (!byId.has(drop.id) || removed.has(drop.id)) continue;
    // A covered drop that names no test has nothing to check, so the entry stays.
    if (drop.reason === 'covered' && !drop.testFile) continue;

    removed.add(drop.id);
    if (drop.reason === 'covered') {
      covered.push({ entryId: drop.id, testFile: drop.testFile, assertion: drop.assertion ?? drop.why });
    } else {
      passing.push({ entry: byId.get(drop.id), why: drop.why });
    }
  }

  return {
    entries: list.filter((entry) => !removed.has(entry.id)).map((entry) => byId.get(entry.id)),
    covered,
    passing,
  };
}

const pruned = applyPrune(
  entries,
  await agent(prunePrompt(input, entries, testFiles), {
    label: 'prune',
    phase: 'Prune',
    schema: PRUNE_SCHEMA,
    model: DEEP,
  }),
);

log(
  `Prune kept ${pruned.entries.length} of ${entries.length} entries: ${pruned.covered.length} covered by a test, ${pruned.passing.length} would pass on main`,
);
const auditedCount = entries.length;
entries = pruned.entries;

phase('Draft and verify');

const firstVisible = HUMAN_KEYS.find((key) => input.sections[key]);

/**
 * Picks the section an entry's step belongs in.
 *
 * @param entry - An inventory entry
 * @returns A human section key, or `backend`
 */
function sectionFor(entry) {
  if (!entry.visible || !firstVisible) return 'backend';
  return HUMAN_KEYS.includes(entry.section) && input.sections[entry.section]
    ? entry.section
    : firstVisible;
}

/**
 * Describes an inventory entry by its behaviour and location.
 *
 * @param id - The inventory entry id
 * @returns The entry description, or the id when no entry matches
 */
function entryText(id) {
  const entry = everyEntry.get(id);
  return entry ? `${entry.behaviour} (${entry.where})` : id;
}

const boot = settleBoot(await bootRun);
input.bootMarkdown = boot.body;

const backendEntries = entries.filter((entry) => sectionFor(entry) === 'backend');
const backendChunks = input.sections.backend ? chunkEntries(backendEntries) : [];

/**
 * Wraps a drafter's coverage claims as verification units.
 *
 * @param key - The section key the claims belong to
 * @param claims - The drafter's `coveredByTests`
 * @returns One claim unit per claim
 */
function claimUnits(key, claims) {
  return (claims ?? []).map((claim) => ({
    kind: 'claim',
    section: key,
    label: `claim:${claim.entryId}`,
    body: `Claim: \`${claim.testFile}\` asserts: ${claim.assertion}\nInventory entry it discharges: ${entryText(claim.entryId)}`,
    claim: { ...claim, entryText: entryText(claim.entryId) },
  }));
}

/**
 * Drafts one backend group, then verifies its steps and coverage claims together.
 *
 * The same checkers that read the code for the steps confirm each claim.
 *
 * @param chunk - The group's entries
 * @param index - The group's position
 * @returns The drafted section and every verified unit, claims included
 */
async function draftAndVerifyBackend(chunk, index) {
  const suffix = backendChunks.length > 1 ? `:${index + 1}` : '';
  const section = await agent(
    backendDraftPrompt(input, chunk, testFiles, {
      index,
      count: backendChunks.length,
    }),
    {
      label: `draft:backend${suffix}`,
      phase: 'Draft and verify',
      schema: SECTION_SCHEMA,
      model: DEEP,
    },
  );

  const verified = await verifyUnits(input, `backend${suffix}`, [
    ...(section?.steps ?? []).map((step) => stepUnit('backend', step)),
    ...claimUnits('backend', section?.coveredByTests),
  ]);

  return { section, verified };
}

/**
 * Drafts one group of a human section, then verifies its steps and coverage claims.
 *
 * @param group - The section `key`, the group's `entries`, its `index` and the section's group `count`
 * @returns The drafted section and its verified units, claims included
 */
async function draftAndVerifyHuman({ key, entries: chunk, index, count }) {
  const suffix = count > 1 ? `:${index + 1}` : '';
  const section = await agent(
    humanDraftPrompt(input, key, chunk, surfacesByKey[key] ?? [], testFiles, {
      index,
      count,
    }),
    {
      label: `draft:${key}${suffix}`,
      phase: 'Draft and verify',
      schema: SECTIONS[key].agent ? SPLIT_SECTION_SCHEMA : SECTION_SCHEMA,
      model: DEEP,
    },
  );

  const verified = await verifyUnits(input, `${key}${suffix}`, [
    ...(section?.steps ?? []).map((step) => stepUnit(key, step)),
    ...claimUnits(key, section?.coveredByTests),
  ]);

  return { key, section, verified };
}

// A section is drafted when the explorer saw a change in it or an entry lands in it.
const humanKeys = HUMAN_KEYS.filter(
  (key) =>
    input.sections[key] &&
    (visibleSections.has(key) || entries.some((entry) => sectionFor(entry) === key)),
);

// A section drafted with no entries of its own still gets one drafter.
const humanGroups = humanKeys.flatMap((key) => {
  const chunks = chunkEntries(entries.filter((entry) => sectionFor(entry) === key));
  const groups = chunks.length > 0 ? chunks : [[]];
  return groups.map((chunk, index) => ({
    key,
    entries: chunk,
    index,
    count: groups.length,
  }));
});

// Entries only the backend section could take, when it is off.
const undrafted = input.sections.backend ? [] : backendEntries;
if (undrafted.length > 0) {
  log(`${undrafted.length} entries have no section to draft them — listed as gaps`);
}

log(
  `Drafting ${backendChunks.length} backend group(s) and ${humanGroups.length} group(s) across ${humanKeys.length} human section(s); each group's steps are verified up to ${PER_VERIFIER_CAP} to a checker`,
);

// The pruner's covered drops are claims like a drafter's, checked by their own checkers.
const prunedClaims = HUMAN_KEYS.concat('backend').flatMap((key) =>
  claimUnits(
    key,
    pruned.covered.filter((claim) => sectionFor(everyEntry.get(claim.entryId)) === key),
  ),
);

const [backendResults, humanResults, storybookVerified, prunedVerified] = await Promise.all([
  Promise.all(backendChunks.map(draftAndVerifyBackend)),
  Promise.all(humanGroups.map(draftAndVerifyHuman)),
  storybookRun.then((drafted) =>
    verifyUnits(
      input,
      'sb',
      (drafted?.items ?? []).map((item) => ({
        kind: 'storybook',
        label: `sb:${item.metaTitle.slice(0, 40)}`,
        storyFile: item.storyFile,
        body: `**${item.metaTitle}** — ${item.exports.join(', ')}\n${item.whatChanged}`,
      })),
      { model: LIGHT },
    ),
  ),
  verifyUnits(input, 'pruned', prunedClaims),
]);

// The repeated mistakes behind this run's failures, for the author to add to the traps file.
const trapRun =
  firstRoundFailures.length >= TRAP_MIN_UNITS
    ? agent(trapsPrompt(firstRoundFailures), {
        label: 'traps',
        phase: 'Draft and verify',
        schema: TRAPS_SCHEMA,
        model: LIGHT,
      })
    : Promise.resolve(null);

const allVerified = [
  ...backendResults.flatMap((result) => result.verified),
  ...humanResults.flatMap((result) => result.verified),
  ...storybookVerified,
  ...prunedVerified,
];

// A claim is not a step: one upheld cites its test, one that fails is a test gap.
const claimOutcomes = allVerified.filter((v) => v.unit.kind === 'claim');
const stepOutcomes = allVerified.filter((v) => v.unit.kind !== 'claim');
const failedClaims = claimOutcomes.filter((v) => v.fate !== 'pass');

for (const c of failedClaims) {
  log(`Coverage claim failed: ${c.unit.claim.testFile} — a test gap for code review`);
}

const deleted = stepOutcomes.filter((v) => v.fate === 'deleted');
const exhausted = stepOutcomes.filter((v) => v.fate === 'exhausted');
const unverified = stepOutcomes.filter((v) => v.fate === 'unverified');

/**
 * Writes the line naming the tests that prove a section's covered entries.
 *
 * @param section - The section key
 * @returns The line, or an empty string when nothing in the section was covered
 */
function coveredLine(section) {
  const files = [
    ...new Set(
      claimOutcomes
        .filter((v) => v.unit.section === section && v.fate === 'pass')
        .map((v) => v.unit.claim.testFile),
    ),
  ];
  return files.length > 0
    ? `**Covered by:** ${files.map((file) => `\`${file}\``).join(', ')}`
    : '';
}

/**
 * Collects the steps of one section that passed verification.
 *
 * @param section - The section key
 * @returns The passing steps, with their title lines stripped
 */
function keep(section) {
  return allVerified
    .filter((v) => v.unit.section === section && v.unit.step && v.fate === 'pass')
    .map((v) => readStep(v.unit));
}

// Drafters splitting one section can each report the same gap.
const draftedGaps = [
  ...backendResults.flatMap((result) => result.section?.gaps ?? []),
  ...humanResults.flatMap((result) => result.section?.gaps ?? []),
].filter(
  (gap, i, all) => all.findIndex((g) => g.gap === gap.gap && g.why === gap.why) === i,
);

const gaps = [
  ...draftedGaps,
  ...unresolvedSurfaces.map((file) => ({
    gap: file,
    why: 'a changed file no surface could be traced to',
  })),
  ...undrafted.map((entry) => ({
    gap: `${entry.behaviour} (${entry.where})`,
    why: 'no checklist section drafts it, since the backend section is off',
  })),
  ...outcomeGaps(stepOutcomes),
  ...failedClaims.map((c) => ({
    gap: c.unit.claim.entryText,
    why: `no test proves it after all, so it is a test gap for code review — ${oneLine(c.reason ?? `\`${c.unit.claim.testFile}\` does not assert it`)}`,
  })),
];

const sectionsMd = [boot.published.trim()];
let stepCount = 0;

/**
 * Ends a section's blocks with its Covered by line.
 *
 * @param blocks - The section's markdown blocks, the last one closing it
 * @param key - The section key
 * @returns The blocks, the last carrying the line when the section has one
 */
function withCovered(blocks, key) {
  const line = coveredLine(key);
  if (!line || blocks.length === 0) return blocks;
  return [...blocks.slice(0, -1), `${blocks.at(-1).trimEnd()}\n\n${line}`];
}

/**
 * Renders a section whose steps all turned out to be proven by tests.
 *
 * @param title - The section heading
 * @param key - The section key
 * @returns The section's blocks, or none when nothing in it was covered either
 */
function coveredOnly(title, key) {
  return coveredLine(key)
    ? withCovered([`---\n\n## ${title}\n\n_Every change here is proven by a test._`], key)
    : [];
}

const backendSteps = keep('backend');
stepCount += backendSteps.length;

if (backendSteps.length > 0) {
  sectionsMd.push(
    ...withCovered(
      [
        `---\n\n## ${BACKEND.title}\n\n${timingLine(backendSteps, true)}\n\n${numberSteps(backendSteps, BACKEND.label)}`,
      ],
      'backend',
    ),
  );
} else if (input.sections.backend) {
  sectionsMd.push(...coveredOnly(BACKEND.title, 'backend'));
}

for (const key of HUMAN_KEYS.filter((k) => input.sections[k])) {
  const section = SECTIONS[key];
  const steps = keep(key);
  stepCount += steps.length;

  if (section.agent && humanKeys.includes(key)) {
    sectionsMd.push(...withCovered(splitSectionMarkdown(section, steps), key));
  } else if (steps.length > 0) {
    sectionsMd.push(
      ...withCovered(
        [
          `---\n\n## ${section.title}\n\n${timingLine(steps, false)}\n\n${numberSteps(steps, section.label)}`,
        ],
        key,
      ),
    );
  } else if (humanKeys.includes(key)) {
    sectionsMd.push(...coveredOnly(section.title, key));
  } else {
    sectionsMd.push(
      `---\n\n## ${section.title}\n\n_Nothing ${section.audience} could notice changed on this branch._`,
    );
  }
}

const storybookItems = storybookVerified
  .filter((v) => v.fate === 'pass')
  .map((v) => v.unit.body);

if (storybookItems.length > 0) {
  sectionsMd.push(
    `---\n\n## Storybook Review Checks\n\n${storybookMarkdown(storybookItems)}`,
  );
}

if (CONFIG.boot.stop.run && boot.body && bootNeeds(CONFIG.boot.stop.when)) {
  sectionsMd.push(
    `---\n\n**When you're finished**, stop the stack: \`${CONFIG.boot.stop.run}\``,
  );
}

sectionsMd.push(`---\n\n${localCiBlock(input.branch)}`);
sectionsMd.unshift(
  triageLine(
    totalMinutes([
      ...keep('backend'),
      ...HUMAN_KEYS.flatMap((key) => keep(key)),
    ]),
  ),
);

return {
  summary: (await summaryRun)?.markdown ?? '',
  checklist: sectionsMd.filter(Boolean).join('\n\n'),
  gaps,
  unresolved: unresolvedLabels(stepOutcomes),
  trapCandidates: ((await trapRun)?.traps ?? []).filter(
    (trap) => trap.units >= TRAP_MIN_UNITS,
  ),
  stats: {
    entries: entries.length,
    pruned: auditedCount - entries.length,
    steps: stepCount,
    storybookItems: storybookItems.length,
    backendDrafters: backendChunks.length,
    humanDrafters: humanGroups.length,
    claimsChecked: claimOutcomes.length,
    claimsFailed: failedClaims.length,
    checkerAgents,
    deleted: deleted.length,
    unresolved: exhausted.length + unverified.length,
    exhausted: exhausted.length,
    unverified: unverified.length,
  },
};
