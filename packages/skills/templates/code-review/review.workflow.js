// ============================================================================
// Code Review — Workflow Script
// ============================================================================
//
// Routes a target or a branch diff into lens bundles, reviews and verifies
// each bundle, and returns one composed report.

/** Workflow metadata read by the Workflow tool. */
export const meta = {
  name: '__SKILL_NAME__',
  description:
    'Recon a target or a branch diff, review it bundle by bundle, adversarially verify every finding, and compose one ready-to-write report',
  phases: [
    { title: 'Recon' },
    { title: 'Review' },
    { title: 'Verify' },
    { title: 'Compose' },
  ],
};

// =============================================================================
// Output shapes
// =============================================================================

const str = { type: 'string' };

const SEVERITIES = ['critical', 'high', 'medium', 'low'];

// One finding's fields, shared by the reviewer's output and a verifier's correction.
const FINDING_FIELDS = {
  id: str,
  lens: str,
  file: str,
  // A string, so "231" and "231-235" share one type.
  line: str,
  issue: str,
  detail: str,
  whyItMatters: str,
  evidence: str,
  severity: { enum: SEVERITIES },
  convention: { type: ['string', 'null'] },
};

const FINDINGS = {
  type: 'object',
  required: ['findings', 'lensesRun'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: [
          'id',
          'lens',
          'file',
          'line',
          'severity',
          'issue',
          'detail',
          'whyItMatters',
          'evidence',
        ],
        properties: FINDING_FIELDS,
      },
    },
    // Every active lens appears here, found something or not.
    lensesRun: {
      type: 'array',
      items: {
        type: 'object',
        required: ['lens', 'findingCount', 'whatIChecked'],
        properties: {
          lens: str,
          findingCount: { type: 'integer' },
          whatIChecked: str,
        },
      },
    },
  },
};

const VERDICTS = {
  type: 'object',
  required: ['verdicts'],
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'verdict', 'reasoning'],
        properties: {
          id: str,
          verdict: { enum: ['refuted', 'confirmed', 'amended'] },
          reasoning: str,
          // Only the fields the verifier changed.
          corrected: {
            type: ['object', 'null'],
            properties: FINDING_FIELDS,
            additionalProperties: false,
          },
        },
      },
    },
  },
};

const RECON_SCHEMA = {
  type: 'object',
  required: [
    'whatThisIs',
    'packPath',
    'addLenses',
    'removeLenses',
    'notes',
    'possibleGaps',
  ],
  properties: {
    whatThisIs: str,
    packPath: str,
    addLenses: {
      type: 'array',
      items: {
        type: 'object',
        required: ['lens', 'why'],
        properties: {
          lens: str,
          why: str,
          // Only a layer-scoped lens needs these.
          files: { type: 'array', items: str },
        },
      },
    },
    removeLenses: {
      type: 'array',
      items: {
        type: 'object',
        required: ['lens', 'why'],
        properties: { lens: str, why: str },
      },
    },
    // 2-4 sentences per bundle on what is worth flagging in these files.
    notes: {
      type: 'array',
      items: {
        type: 'object',
        required: ['bundle', 'note'],
        properties: { bundle: str, note: str },
      },
    },
    // Roster-drift check: domains with a skill that no lens covers.
    possibleGaps: { type: 'array', items: str },
  },
};

const READ_THIS_FIRST_SCHEMA = {
  type: 'object',
  required: ['readThisFirst'],
  properties: {
    readThisFirst: { type: ['string', 'null'] },
  },
};

// =============================================================================
// Lens roster
// =============================================================================

// The repository's resolved review config, written in by `skills sync`.
const CONFIG = /* CONFIG */ null;

const LENSES = CONFIG.lenses;
const BUNDLES = CONFIG.bundles;
const PROMPTS = CONFIG.prompts;

const BUNDLE_BY_KEY = new Map(BUNDLES.map((bundle) => [bundle.key, bundle]));

// The order fat bundles are split in, longest bundle first.
const SPLIT_ORDER = CONFIG.splitOrder;

/**
 * Finds a bundle's definition, reading a split part's from its parent.
 *
 * @param active - The active bundle or split part
 * @returns The bundle definition
 */
const defFor = (active) => BUNDLE_BY_KEY.get(active.parent ?? active.key);

// Lenses that only make sense against a change.
const DIFF_ONLY_LENSES = new Set(CONFIG.diffOnlyLenses);

// Lenses that also report coverage a diff should have added.
const COVERAGE_LENSES = new Set(CONFIG.coverageLenses);

const ALL_LENS_KEYS = Object.keys(LENSES);

/**
 * Formats a lens key as a title, using the lens's own `title` when it has one.
 *
 * @param key - The kebab-case key
 * @returns The display title
 */
const titleFor = (key) =>
  LENSES[key]?.title ??
  key
    .split('-')
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');

// =============================================================================
// Routing
// =============================================================================

const CODE_FILE = CONFIG.files.code;
const DOC_FILE = CONFIG.files.docs;

// A coverage trigger tests production files only, never these.
const TEST_FILE = CONFIG.files.tests;

/**
 * Works out which lenses fire, and which files each one brought with it.
 *
 * @param allFiles - The files under review
 * @param isDiffMode - Whether the review is of a branch diff
 * @returns A map from lens key to its set of matched files
 */
function routeLenses(allFiles, isDiffMode) {
  const hasCode = allFiles.some((file) => CODE_FILE.test(file));
  const hasDocs = allFiles.some((file) => DOC_FILE.test(file));

  const fired = new Map();

  for (const [lens, def] of Object.entries(LENSES)) {
    if (!isDiffMode && DIFF_ONLY_LENSES.has(lens)) continue;

    const route = def.route ?? {};
    const matched = new Set();

    const alwaysFires =
      (route.always === 'code' && hasCode) ||
      (route.always === 'codeOrDocs' && (hasCode || hasDocs));

    if (alwaysFires) for (const file of allFiles) matched.add(file);

    for (const file of allFiles) {
      if ((route.paths ?? []).some((rule) => rule.test(file))) {
        matched.add(file);
      }
    }

    // Diff mode only, so a production file alone can fire a test lens.
    if (isDiffMode && route.coverage) {
      for (const file of allFiles) {
        if (TEST_FILE.test(file)) continue;
        if (route.coverage.some((rule) => rule.test(file))) {
          matched.add(file);
        }
      }
    }

    if (matched.size > 0) fired.set(lens, matched);
  }

  return fired;
}

/**
 * Turns the fired lenses into the bundles that will run.
 *
 * @param fired - The fired lenses with their matched files
 * @param allFiles - The files under review
 * @returns One `{ key, lenses, files, note }` entry per running bundle
 */
function buildBundles(fired, allFiles) {
  const bundles = [];

  for (const def of BUNDLES) {
    const lenses = def.lenses.filter((lens) => fired.has(lens));
    if (lenses.length === 0) continue;

    const files =
      def.scope === 'target'
        ? allFiles
        : [...new Set(lenses.flatMap((lens) => [...fired.get(lens)]))];

    if (files.length === 0) continue;

    bundles.push({ key: def.key, lenses, files, note: null });
  }

  return bundles;
}

// Reviewers take this share of the concurrency, verifiers the rest.
const REVIEWER_BUDGET_SHARE = 0.6;

const DEFAULT_AGENT_CAP = 12;

/**
 * Splits the fat bundles into two agents each, while reviewer slots remain.
 *
 * @param active - The bundles about to run
 * @param agentCap - The concurrency cap, with `DEFAULT_AGENT_CAP` used when invalid
 * @returns The resulting bundles, the keys split and the reviewer budget
 */
function splitBundles(active, agentCap) {
  const cap =
    Number.isFinite(agentCap) && agentCap > 0 ? agentCap : DEFAULT_AGENT_CAP;
  const budget = Math.max(1, Math.floor(cap * REVIEWER_BUDGET_SHARE));
  const result = [...active];
  const split = [];

  for (const key of SPLIT_ORDER) {
    if (result.length >= budget) break;

    const def = BUNDLE_BY_KEY.get(key);
    if (!def?.split) continue;

    const index = result.findIndex((bundle) => bundle.key === key);
    if (index === -1) continue;

    const bundle = result[index];

    // A half with no firing lens is the same agent under a new name.
    const halves = def.split
      .map((part) => ({
        lenses: part.lenses.filter((lens) => bundle.lenses.includes(lens)),
        model: part.model,
      }))
      .filter((part) => part.lenses.length > 0);

    if (halves.length < 2) continue;

    result.splice(
      index,
      1,
      ...halves.map((part, n) => ({
        ...bundle,
        key: `${key}-${n + 1}`,
        parent: key,
        lenses: part.lenses,
        model: part.model,
      })),
    );
    split.push(key);
  }

  return { bundles: result, split, budget };
}

// =============================================================================
// Recon prompt
// =============================================================================

const NUMBER_WORDS = [
  'no',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
];

// The routing calls a path cannot make, one per lens carrying a judgment hint.
const JUDGMENT_KEYS = ALL_LENS_KEYS.filter(
  (key) => typeof LENSES[key].route?.judgment === 'string',
);

const JUDGMENT_COUNT =
  NUMBER_WORDS[JUDGMENT_KEYS.length] ?? String(JUDGMENT_KEYS.length);

const JUDGMENT_LENSES = JUDGMENT_KEYS.map(
  (key) => `- **${key}** — ${LENSES[key].route.judgment}`,
).join('\n');

/**
 * Builds the recon agent's prompt for writing the context pack and bundle notes.
 *
 * @param input - The workflow input
 * @param allFiles - The files under review
 * @param proposal - The routed lenses and bundles
 * @returns The prompt text
 */
function buildReconPrompt(input, allFiles, proposal) {
  const isDiff = input.mode === 'diff';
  const packPath = `${input.scratchDir}/review-context.tmp.md`;

  const sourceBlock = isDiff
    ? `## The diff
Branch \`${input.target}\` against \`${input.base}\`.
Stat: ${input.diffStat}
Per-file patches mirror the file tree: the patch for a changed file is at
\`${input.patchDir}/<path>.patch\`, so you never load the whole diff to find three files.${
        input.largeDiff
          ? '\nThe diff is large (>4000 lines). Work file by file; do not try to hold it all at once.'
          : ''
      }

Changed files:
${allFiles.join('\n')}`
    : `## The target
${input.moduleTarget ? `Module: ${input.moduleTarget}\n` : ''}Files:
${allFiles.join('\n')}`;

  const graphPath = input.toolReports?.importGraph;

  // The graph lands in the background, so Recon checks for it rather than waiting.
  const graphNote = graphPath
    ? `If \`${graphPath}\` exists, **the import graph is already built** — it was
generated with ripgrep: every exported symbol in the files under review, with
the places that name appears elsewhere. **Do not rebuild it and do not paste it
in.** Link to it from the pack, read it yourself, and correct anything you find
is wrong (it matches on names, so it over-reports lookalikes and under-reports
${PROMPTS.graphUnderReports}). If a symbol's real callers are not what the graph
suggests, say so in the pack — that correction is worth more than the list
itself. **If the file does not exist yet, do not wait for it**: build the
call-site map yourself — for each exported symbol under review, its call sites
as \`file:line\`.`
    : `No import graph was generated for this run, so build the call-site map
yourself: for each exported symbol under review, its call sites as \`file:line\`.`;

  const proposalBlock = `## The routing, already decided

Lens routing ran in JS before you started, from the file list. **This is not a
draft for you to redo** — it is settled, and your job is only the part a path
cannot decide.

Lenses firing: ${proposal.firedLenses.join(', ') || 'none'}
Bundles firing: ${proposal.bundles.map((b) => `${b.key} (${b.lenses.join(', ')})`).join('; ') || 'none'}

Files are assigned per bundle already too. You do not assign them.`;

  return `# Code review — Recon

You are the recon pass of a code review. You report no findings. You do three
things: **write a context pack** the reviewers will all read, **write a note per
bundle**, and **make the ${JUDGMENT_COUNT} routing calls that need a file read rather than a
path matched**.

${sourceBlock}
${buildToolReportBlock(input.toolReports, { wait: false })}

## Step 1 — read
Read every file above in full${isDiff ? ', not just the hunks — the patch shows what moved, the file shows what the branch now IS' : ''}. Follow imports both directions far
enough to know what calls this code and what it calls. Note which layer each
file belongs to (${PROMPTS.fileRoles}).
${PROMPTS.readNote ? `\n${PROMPTS.readNote}\n` : ''}
## Step 2 — write the context pack
Write a markdown file to **${packPath}**. Every reviewer reads it before it
reads any code.

**The pack is a map for general discovery, not a substitute for reading.** Its
job is to remove the hunting — the greps, the dead ends, the "where do the tests
for this live" — so each reviewer spends its budget reading rather than
searching. Reviewers then dive as deep as their own lenses need.

So: **pointers and short quotes, never verdicts.** Do not write "this looks
unsafe" or "this is well factored". Write where things are and what calls what.

Include:

1. **File inventory** — every file under review, one line each: path, layer, and
   what it does in a few words
2. **The import graph.** ${graphNote}
3. **The neighbourhood** — for each area of the target, where its neighbours
   are: ${PROMPTS.neighbours}
4. **Anything a reviewer would otherwise have to discover twice** — a shared
   helper several files use, a type everything derives from, a config value
   that controls behaviour

End the pack with a line saying it is a map, not a review, and that every claim
in it is worth checking against the file.

${proposalBlock}

## Step 3 — the ${JUDGMENT_COUNT} judgment calls
${
  JUDGMENT_KEYS.length === 1
    ? 'This lens cannot be routed from a path, so it is yours. Return it'
    : `These ${JUDGMENT_COUNT} lenses cannot be routed from a path, so they are yours. Return each
one you want switched on`
} in \`addLenses\`, with a one-line \`why\` and, for a
layer-scoped lens, the \`files\` it should read.

${JUDGMENT_LENSES}

${isDiff || DIFF_ONLY_LENSES.size === 0 ? '' : `This is a target review, so ${[...DIFF_ONLY_LENSES].map((key) => `\`${key}\``).join(', ')} does not apply and no coverage analysis runs.\n`}
**Removing a lens is also yours, and it is the rarer call.** If the routing
fired a lens whose files turn out to have nothing for it to judge${PROMPTS.removalExample ? ` — ${PROMPTS.removalExample}, say —` : ','} put it in
\`removeLenses\` with the reason. Removals are logged and printed in the report,
so this is a decision on the record, not a quiet trim. When in doubt, leave the
lens on: a lens with nothing to say costs one short pass.

## Step 4 — write a note per bundle
One entry in \`notes\` for every bundle listed above. 2-4 sentences on what is
actually worth flagging in these files, in your own words, from what you read in
Step 1. Name the concrete concern — "${PROMPTS.concernExample}" beats "review for N+1". A generic
note produces generic findings, and this note is the only part of the reviewer's
prompt that knows anything about this particular code.

Run \`ls ${CONFIG.skillsDir}/\` yourself. If a skill exists for a domain this target
touches and no lens covers it, name it in \`possibleGaps\` — do not invent a
firing rule, just flag it.

## Output
Report through the structured-output tool: whatThisIs (2-4 sentences on what
this code is and what depends on it), packPath (the path you wrote), addLenses,
removeLenses, notes (one per bundle), possibleGaps (may be empty).`;
}

// =============================================================================
// Reviewer prompt
// =============================================================================

/**
 * Builds the prompt block pointing at the prepass tool reports.
 *
 * @param reports - The report paths, with an optional sentinel
 * @param options - `wait: false` for an agent that must not block on the sentinel
 * @returns The block text, empty when no report exists
 */
function buildToolReportBlock(reports, { wait = true } = {}) {
  if (!reports) return '';

  const rows = [
    ...CONFIG.prepass.tools.map(
      (tool) => reports[tool.key] && `- ${tool.label}: \`${reports[tool.key]}\``,
    ),
    reports.importGraph &&
      `- Import graph, generated with ripgrep: \`${reports.importGraph}\``,
  ].filter(Boolean);

  if (rows.length === 0) return '';

  const noWait = `
They are still being produced in the background. **Do not wait for them.** A
report that exists is complete; one that does not is not ready yet, so work
without it.
`;

  // A report is renamed into place only once its tool exits.
  const waitBlock = !wait
    ? noWait
    : reports.sentinel
      ? `
**Wait for the prepass before reading any of them.** It runs in the background
and may still be finishing. FIRST ACTION, before anything else:

\`\`\`bash
for i in $(seq 1 90); do [ -f "${reports.sentinel}" ] && break; sleep 2; done
cat "${reports.sentinel}"
\`\`\`

The sentinel names which reports landed. If it never appears within the three
minutes, say so in the \`whatIChecked\` for the lens that wanted it and carry on
**without running the tool yourself** — one agent running ${PROMPTS.toolCost} is exactly the cost the prepass exists to avoid.
`
      : '';

  return `
## Tool reports — already run, do not re-run them
${rows.join('\n')}
${waitBlock}
These were produced once for the whole review. Read the file rather than running
the tool again.`;
}

const BRANCH_SCOPE_NOTICE = `## Scope — the branch, not the codebase
Report only what this branch adds, changes, or breaks. A pre-existing problem in
a file the branch happens to touch is out of scope, and so is a problem in a
file the branch does not touch at all. The one exception is a latent issue the
change newly exposes — and then say explicitly why the change is what makes it
bite.`;

/**
 * Builds the reviewer's reading instructions.
 *
 * @param isDiff - Whether the review is of a branch diff
 * @returns The brief text
 */
function buildReadingBrief(isDiff) {
  return `## How to read — REQUIRED before reporting anything

**Start with the context pack.** It is a map: the file inventory, the import
graph with call sites, and where the neighbours live. Use it to skip the search.
It is not a review and it is not evidence — nothing in it counts as a finding,
and any claim you rely on gets checked against the file.

**Then read for yourself, as deep as your lenses need.**

1. Read every file assigned to you in full${isDiff ? ', not just the changed lines' : ''}.
2. Follow the call sites the pack lists. ${isDiff ? 'A signature change is only safe if every caller agrees.' : 'You cannot judge a function without seeing how it is used.'}
3. Read downstream too — what this code calls, especially across a layer
   boundary (${PROMPTS.layerChain}).
4. Read the existing tests. They encode intended behaviour and the edge cases
   someone already thought about.
5. For anything touching the database, read ${PROMPTS.databaseReading}.
${PROMPTS.extraReadingSteps.map((step, i) => `${i + 6}. ${step}\n`).join('')}
The pack tells you these exist and where. Reading them is still your job — a
reviewer that reports only what the pack mentioned has reviewed the pack.`;
}

const COVERAGE_HALF = `## The coverage half of this brief
${COVERAGE_LENSES.size === 1 ? 'Your test lens has' : 'Your test lenses have'} a second job: find COVERAGE GAPS. You do not write tests to
fill them — the gap list is the whole output.

- **Prefix the id with "coverage-".** That is what separates an absence from a
  defect in the report.
- **Scope to the diff.** Enumerate only behaviour the branch adds or changes. A
  symbol the branch left alone is a pre-existing gap, not this branch's.
- **Coverage is the difference between two reads**, so do both:
  1. From the diff, list every unit of behaviour the branch added or changed
     that the conventions require covered — ${PROMPTS.coverageUnits}.
  2. Find and read ${PROMPTS.coverageLocation}, in full.
  3. A gap is anything in (1) that (2) does not reach — file ABSENT, or PRESENT
     but omitting the new case. Report both kinds. Never assume an existing test
     file covers a newly added branch.
- **Shape:** \`file\` is the uncovered production file, \`line\` the symbol's
  location, \`issue\` the missing coverage in one line (${PROMPTS.coverageExamples}).
  \`detail\` says whether the file is absent or incomplete, and which convention
  requires it. Severity reflects the gap: ${PROMPTS.coverageSeverity}.`;

const OUTPUT_SPEC = `## Output
Report through the structured-output tool.

Per finding:
  id            <lens>-<n>, or coverage-<lens>-<n> for a coverage gap
  lens          which of your lenses raised it — exactly as spelled above
  file          repo-relative path
  line          "231" or "231-235" — a string
  severity      critical | high | medium | low
  issue         one line
  detail        2-4 sentences: what is wrong and when it bites
  whyItMatters  one sentence: the concrete consequence — ${PROMPTS.whyItMatters}
  evidence      the specific code, call site, or tool output you rely on
  convention    file or rule name, or null

And \`lensesRun\`: **one entry for every lens listed above, including the ones
that found nothing.** Each carries the lens name, its finding count, and one
sentence on what you actually checked for it. An empty list is a fine answer for
a lens; skipping the pass is not, and this field is how that stays visible.

Do not pad. A short honest list beats a long speculative one.`;

/**
 * Builds one reviewer agent's prompt, with one pass per lens it covers.
 *
 * @param active - The bundle or split part, whose key may differ from its parent's
 * @param recon - The recon result
 * @param input - The workflow input
 * @returns The prompt text
 */
function buildReviewerPrompt(active, recon, input) {
  const isDiff = input.mode === 'diff';
  const lensKeys = active.lenses;

  const skillLenses = lensKeys.filter((key) => LENSES[key]?.skill);
  const skillLine =
    skillLenses.length > 0
      ? `FIRST ACTION, before reading any code: invoke ${skillLenses.length === 1 ? 'this skill' : 'these skills'} — ${skillLenses
          .map((key) => `\`${LENSES[key].skill}\``)
          .join(
            ', ',
          )}. They load the project's conventions for your lenses. Review against those, not against generic best practice. Do not load skills for lenses not listed below.\n\n`
      : '';

  const passes = lensKeys
    .map(
      (key, i) =>
        `### Pass ${i + 1} — ${titleFor(key)} (\`${key}\`)\n${LENSES[key].judges}`,
    )
    .join('\n\n');

  const coverage =
    isDiff && lensKeys.some((key) => COVERAGE_LENSES.has(key))
      ? `\n${COVERAGE_HALF}\n`
      : '';

  const diffBlock = isDiff
    ? `## The diff
Branch \`${input.target}\` against \`${input.base}\`. Each changed file's patch is
at \`${input.patchDir}/<path>.patch\` — read only the ones for your files.

${BRANCH_SCOPE_NOTICE}
`
    : '';

  return `# Code review — \`${active.key}\` bundle

${skillLine}You are a code REVIEWER. You find issues; you do not write or edit code. Make no edits.

You cover **${lensKeys.length} lens${lensKeys.length === 1 ? '' : 'es'}**: ${lensKeys.join(', ')}. Work through them
**one at a time, in order**, as separate passes over the same code. Do not
blend them — a finding belongs to exactly one lens, and the pass structure is
what stops the last lens getting a fraction of the attention the first one got.

## Your files
${(active.files ?? []).join('\n')}

## What this code is
${recon.whatThisIs}

## Context pack
\`${recon.packPath}\`
${diffBlock}${buildToolReportBlock(input.toolReports)}

${buildReadingBrief(isDiff)}

## What Recon flagged for this bundle
${active.note}

## The passes
${passes}
${coverage}
${OUTPUT_SPEC}`;
}

// =============================================================================
// Verifier prompt — one agent per file
// =============================================================================

/**
 * Builds the verifier agent's prompt for every finding on one file.
 *
 * @param file - The file the findings concern
 * @param findings - The findings to verify
 * @param recon - The recon result
 * @param input - The workflow input
 * @returns The prompt text
 */
function buildVerifierPrompt(file, findings, recon, input) {
  const isDiff = input.mode === 'diff';

  // A report run against the base names what the branch caused in files it never touched.
  const branchReports = isDiff
    ? CONFIG.prepass.tools
        .filter((tool) => tool.baseCommand && input.toolReports?.[tool.key])
        .map((tool) => `   - ${tool.label}: \`${input.toolReports[tool.key]}\``)
    : [];
  const branchWide = branchReports.length
    ? ` A finding in code the diff left alone is
   also the branch's when one of these reports, run against the base,
   lists it under \`findings\` — read it before refuting:\n${branchReports.join('\n')}`
    : '';
  const branchCheck = isDiff
    ? `2. **Check the claim is about THIS BRANCH.** If the cited code is unchanged by
   the diff, refute it as pre-existing — unless the finding explains why the
   branch is what makes it bite.${branchWide}\n`
    : '';

  const coverageBlock = `## Coverage findings
A "coverage-" finding claims an ABSENCE. Verify by searching for the covering
file (${PROMPTS.coverageFiles}) AND reading it to
check whether the cited case is actually exercised. Refute if something already
covers it. Confirm only if no coverage exists — file absent, or present but
omitting the case.`;

  return `# Verify the review findings against one file

You are a SKEPTICAL verifier. Your job is to **DISPROVE** these findings. Assume
each is wrong until the code forces you to conclude otherwise. Reviewers
routinely report things a wider read shows are already handled elsewhere.

All findings below concern **\`${file}\`**. Read that file once, properly, then
judge each finding against it. Every finding gets its own verdict — they are
independent, and confirming one says nothing about the next.

## Context
${recon.whatThisIs}
Context pack: \`${recon.packPath}\` — a map, not evidence. Verify against files.
${isDiff ? `Branch \`${input.target}\` vs \`${input.base}\`. The file's patch is at \`${input.patchDir}/<path>.patch\`.` : ''}

## How to verify
1. Read the whole file, not just the cited lines.
${branchCheck}${isDiff ? '3' : '2'}. **Check every citation is real** — each file, line, migration, quoted
   convention and ${PROMPTS.errorIdentifier}. A misquoted convention or an invented line
   reference sinks a finding on its own; say so rather than repairing it
   silently.
${isDiff ? '4' : '3'}. **Re-run any experiment a finding claims.** If it reports a test result, a
   measurement, or an error message, reproduce it. Copy files to a scratch
   directory to mutate them — NEVER modify a file inside the repo. A claimed
   result that does not reproduce is a refutation.
${isDiff ? '5' : '4'}. **Trace the claim through the real code path.** If it claims a value can be
   null, find whether an earlier guard, a Zod schema, a database constraint or
   the type system already rules that out.${PROMPTS.authCheck ? ` If it claims a missing auth check, find whether ${PROMPTS.authCheck} already applies one.` : ''} If it claims dead code, grep the
   whole repo — including ${PROMPTS.deadCodeReferences}.
${isDiff ? '6' : '5'}. **Read the tests.** A test asserting current behaviour usually means it is
   intended.
${isDiff ? '7' : '6'}. **Challenge the severity, not just the claim.** A real issue filed three
   levels too high is an amendment. Establish blast radius from the actual
   ${PROMPTS.blastRadius}.
${isDiff ? '8' : '7'}. **Look for the counter-example that kills each finding.** Only when you
   cannot find one should you confirm it.

Holding several findings on one file at once is an advantage: if two of them
contradict each other, at least one is wrong, and saying which is part of the
job.

${coverageBlock}

## Output
Report through the structured-output tool: \`verdicts\`, one entry per finding
below, each with:
  id         the finding's id, copied exactly
  verdict    refuted | confirmed | amended
  reasoning  what you read and what it showed — 2-4 sentences
  corrected  the corrected fields, only when the verdict is amended

Return a verdict for every finding. A missing id is treated as unverified.

## The findings
${JSON.stringify(findings, null, 1)}`;
}

// =============================================================================
// Read-this-first paragraph
// =============================================================================

/**
 * Builds the prompt asking for the report's lead paragraph.
 *
 * @param findings - The confirmed and amended findings
 * @param isDiff - Whether the review is of a branch diff
 * @returns The prompt text
 */
function buildReadThisFirstPrompt(findings, isDiff) {
  const list = findings
    .map(
      (finding) =>
        `- [${finding.severity}] ${finding.title} (${finding.file}) — lenses: ${finding.lenses.join(', ')}`,
    )
    .join('\n');

  return `# Read-this-first paragraph

Given these confirmed or amended review findings, write ONE paragraph (2-4
sentences) naming the single most important thing — usually the root cause
several findings share, or the one that ${isDiff ? 'blocks the merge' : 'bites in production'}. Return null if there
genuinely is not one thing worth leading with.

## Findings
${list}

## Output
Report through the structured-output tool: readThisFirst (string or null).`;
}

// =============================================================================
// Report formatting
// =============================================================================

const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };
const SEVERITY_LETTER = { critical: 'C', high: 'H', medium: 'M', low: 'L' };

// Why a finding carries no verdict, as its note in the report says it.
const UNVERIFIED_NOTES = {
  cap: 'over the per-bundle verification cap',
  empty: 'the verifier returned nothing',
  missing: 'the verifier gave no verdict for this finding',
};

/**
 * Keeps the fields of an amended verdict's correction that fit a finding.
 *
 * @param verdict - The verdict, or null
 * @returns The corrected fields, less any unknown field or severity off the scale
 */
function correctionOf(verdict) {
  if (verdict?.verdict !== 'amended' || !verdict.corrected) return {};

  return Object.fromEntries(
    Object.entries(verdict.corrected).filter(([key, value]) =>
      key === 'severity'
        ? Object.hasOwn(SEVERITY_RANK, value)
        : Object.hasOwn(FINDING_FIELDS, key) &&
          (typeof value === 'string' || (key === 'convention' && value === null)),
    ),
  );
}

/**
 * Makes text safe inside a markdown table cell.
 *
 * @param text - The text
 * @returns The text on one line with pipes escaped
 */
function cell(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
}
/**
 * Tells whether a finding id marks a coverage gap.
 *
 * @param id - The finding id
 * @returns True for a `coverage-` prefixed string
 */
const isCoverage = (id) => typeof id === 'string' && id.startsWith('coverage-');

/**
 * Picks what one merged entry shows, dropping it only when every finding in it was refuted.
 *
 * @param members - The entry's findings, each paired with the verdict on its own uid or null
 * @returns The most severe surviving finding, and its verdict marked with `splitWith` when another verifier disagreed
 */
function resolveEntry(members) {
  const effective = ({ finding, verdict }) => ({
    ...finding,
    ...correctionOf(verdict),
  });
  // An unrecognised severity counts as severe.
  const rank = (member) => SEVERITY_RANK[effective(member).severity] ?? 0;

  const survivors = members.filter(
    ({ verdict }) => verdict?.verdict !== 'refuted',
  );
  const [pick] = [...(survivors.length > 0 ? survivors : members)].sort(
    (a, b) => rank(a) - rank(b) || (a.verdict ? 0 : 1) - (b.verdict ? 0 : 1),
  );

  const others = members
    .map(({ verdict }) => verdict?.verdict)
    .filter((one) => one && one !== pick.verdict?.verdict);
  const splitWith = others.includes('refuted') ? 'refuted' : others[0];

  return {
    finding: pick.finding,
    verdict:
      pick.verdict && splitWith ? { ...pick.verdict, splitWith } : pick.verdict,
  };
}

/**
 * Formats a finding into its report bucket, summary row and section markdown.
 *
 * @param finding - The reviewer's finding
 * @param verdict - The merged verdict, or null when unverified
 * @param unverifiedWhy - A `UNVERIFIED_NOTES` key saying why there is no verdict
 * @returns The formatted finding
 */
function formatFinding(finding, verdict, unverifiedWhy) {
  const split = verdict?.splitWith
    ? ` **Split verdict** — another verifier called it ${verdict.splitWith}.`
    : '';

  if (verdict?.verdict === 'refuted') {
    return {
      bucket: 'refuted',
      lens: finding.lens,
      refutedBullet: `**${finding.issue}** (\`${finding.file}:${finding.line}\`) — ${verdict.reasoning}${split}`,
    };
  }

  const merged = { ...finding, ...correctionOf(verdict) };
  const bucket = verdict == null ? 'unverified' : verdict.verdict;
  const lenses = [finding.lens];
  const coverage = isCoverage(merged.id);

  const verifiedNote =
    verdict == null
      ? `_Not verified — ${UNVERIFIED_NOTES[unverifiedWhy] ?? UNVERIFIED_NOTES.missing}; treat with normal skepticism._`
      : bucket === 'amended'
        ? `_Amended on verification: ${verdict.reasoning}${split}_`
        : split
          ? `_${split.trim()}_`
          : null;

  const lines = [
    `## __N__ — ${merged.issue}`,
    '',
    `**Severity:** ${merged.severity} · **Where:** \`${merged.file}:${merged.line}\` · **Lenses:** ${lenses.join(', ')}`,
    '',
    merged.detail,
    '',
    '```',
    merged.evidence,
    '```',
    '',
    `**Why it matters:** ${merged.whyItMatters}`,
  ];

  if (merged.convention) {
    lines.push('', `**Convention:** \`${merged.convention}\``);
  }
  if (verifiedNote) lines.push('', verifiedNote);

  return {
    bucket,
    lens: merged.lens,
    severity: merged.severity,
    coverage,
    title: merged.issue,
    file: merged.file,
    lenses,
    summaryRow: `| __N__ | ${coverage ? '—' : SEVERITY_LETTER[merged.severity]} | ${cell(merged.issue)} | \`${cell(`${merged.file}:${merged.line}`)}\` |`,
    sectionMarkdown: lines.join('\n'),
  };
}

// =============================================================================
// Dedup
// =============================================================================

/**
 * Parses a `"231"` or `"231-235"` line string into an ordered range.
 *
 * @param line - The finding's line string
 * @returns The `[start, end]` pair, or null when unparseable
 */
function parseRange(line) {
  if (typeof line !== 'string') return null;
  const hit = line.match(/^\s*(\d+)\s*(?:[-–]\s*(\d+))?\s*$/);
  if (!hit) return null;
  const start = Number(hit[1]);
  const end = hit[2] ? Number(hit[2]) : start;
  return start <= end ? [start, end] : [end, start];
}

// Line slack that still counts two findings as the same spot.
const OVERLAP_SLACK = 2;

/**
 * Tells whether a finding repeats a merged entry's: another bundle, the same lens and file, and overlapping lines.
 *
 * @param entry - A merged entry, carrying the `bundles` already in it
 * @param finding - The finding to place
 * @returns True when the lines match or overlap within `OVERLAP_SLACK`
 */
function sameSpot(entry, finding) {
  if (entry.bundles.includes(finding.bundle)) return false;
  if (entry.lens !== finding.lens || entry.file !== finding.file) return false;
  if (entry.line === finding.line) return true;

  const rangeA = parseRange(entry.line);
  const rangeB = parseRange(finding.line);
  if (!rangeA || !rangeB) return false;

  return (
    rangeA[0] - OVERLAP_SLACK <= rangeB[1] + OVERLAP_SLACK &&
    rangeB[0] - OVERLAP_SLACK <= rangeA[1] + OVERLAP_SLACK
  );
}

// =============================================================================
// Paths
// =============================================================================

/**
 * Finds the deepest directory every path shares.
 *
 * @param paths - Repository-relative file paths
 * @returns The shared directory, empty when there is none
 */
function commonDir(paths) {
  if (paths.length === 0) return '';
  const parts = paths.map((one) => one.split('/').slice(0, -1));
  const min = Math.min(...parts.map((one) => one.length));
  const common = [];
  for (let i = 0; i < min; i++) {
    const segment = parts[0][i];
    if (parts.every((one) => one[i] === segment)) common.push(segment);
    else break;
  }
  return common.join('/');
}

/**
 * Builds the report path, named for the branch and, on a target review, the target.
 *
 * @param input - The workflow input
 * @param allFiles - The files under review
 * @returns The report's path inside the scratch directory
 */
function suggestedReportPath(input, allFiles) {
  const dir = (input.scratchDir ?? 'tmp/code-reviews').replace(/\/$/, '');
  const branch = (input.branchLeaf ?? 'review').replace(
    /[^A-Za-z0-9._-]/g,
    '-',
  );

  if (input.mode === 'diff') return `${dir}/${branch}.tmp.md`;

  const target = input.moduleTarget
    ? input.moduleTarget.replace(/\/$/, '').split('/').pop()
    : allFiles.length === 1
      ? allFiles[0]
          .split('/')
          .pop()
          .replace(/\.[^.]+$/, '')
      : commonDir(allFiles).split('/').pop() || 'code';

  return `${dir}/${branch}-${target}.tmp.md`;
}

/**
 * Applies resumed-run area overrides, skipping, patching or adding bundles by key.
 *
 * @param bundles - The routed bundles
 * @param overrides - The area overrides, or none
 * @returns The bundles after the overrides
 */
function applyOverrides(bundles, overrides) {
  if (!overrides?.length) return bundles;
  const byKey = new Map(bundles.map((bundle) => [bundle.key, bundle]));
  for (const override of overrides) {
    if (override.skip) {
      byKey.delete(override.key);
      continue;
    }
    const existing = byKey.get(override.key) ?? {
      key: override.key,
      lenses: BUNDLE_BY_KEY.get(override.key)?.lenses ?? [],
      files: [],
      note: 'Patched in by areaOverrides on a resumed run.',
    };
    byKey.set(override.key, { ...existing, ...override });
  }
  return [...byKey.values()];
}

// =============================================================================
// Recon
// =============================================================================

phase('Recon');

// Some hosts hand `args` over JSON-encoded; accept either shape.
const input = typeof args === 'string' ? JSON.parse(args) : args;

const isDiffMode = input.mode === 'diff';
const allFiles = (isDiffMode ? input.changedFiles : input.targets) ?? [];

if (allFiles.length === 0) {
  return {
    markdown:
      '# Review — nothing to review\n\nNo files were passed to the workflow.',
    stats: { files: 0, findings: 0 },
    bundlesRun: [],
    bundlesSkipped: BUNDLES.map((bundle) => bundle.key),
    bundlesDied: [],
    lensesRun: [],
    lensesSkipped: ALL_LENS_KEYS,
    packPath: null,
    suggestedPath: suggestedReportPath(input, allFiles),
  };
}

// Routing runs first, so Recon is handed a settled roster.
const fired = routeLenses(allFiles, isDiffMode);

const proposal = {
  firedLenses: [...fired.keys()],
  bundles: buildBundles(fired, allFiles),
};

log(
  `Routed ${proposal.firedLenses.length} lens(es) into ${proposal.bundles.length} bundle(s) before Recon`,
);

const recon = await agent(buildReconPrompt(input, allFiles, proposal), {
  label: 'recon',
  phase: 'Recon',
  model: 'opus',
  agentType: 'general-purpose',
  schema: RECON_SCHEMA,
});

// Recon's judgment calls, applied on top of the routing.
const routingDecisions = [];

for (const add of recon?.addLenses ?? []) {
  if (!LENSES[add.lens]) continue;
  if (!isDiffMode && DIFF_ONLY_LENSES.has(add.lens)) continue;
  if (fired.has(add.lens)) continue;

  const files = add.files?.length ? add.files : allFiles;
  fired.set(add.lens, new Set(files));
  routingDecisions.push(`**+ \`${add.lens}\`** — ${add.why}`);
}

for (const drop of recon?.removeLenses ?? []) {
  if (!fired.has(drop.lens)) continue;

  fired.delete(drop.lens);
  routingDecisions.push(`**− \`${drop.lens}\`** — ${drop.why}`);
}

if (routingDecisions.length > 0) {
  log(`Recon adjusted routing: ${routingDecisions.length} change(s)`);
}

const notesByBundle = new Map(
  (recon?.notes ?? []).map((note) => [note.bundle, note.note]),
);

const GENERIC_NOTE =
  'Recon did not write a note for this bundle. Review it against your lenses on the code alone.';

let activeBundles = applyOverrides(
  buildBundles(fired, allFiles).map((bundle) => ({
    ...bundle,
    note: notesByBundle.get(bundle.key) ?? GENERIC_NOTE,
  })),
  input.areaOverrides,
);

// An override can name a bundle that never fired, so re-check the shape.
activeBundles = activeBundles
  .filter((bundle) => BUNDLE_BY_KEY.has(bundle.key))
  .map((bundle) => ({
    ...bundle,
    lenses: (bundle.lenses ?? [])
      .filter((lens) => BUNDLE_BY_KEY.get(bundle.key).lenses.includes(lens))
      .filter((lens) => isDiffMode || !DIFF_ONLY_LENSES.has(lens)),
    files: bundle.files?.length ? bundle.files : allFiles,
  }))
  .filter((bundle) => bundle.lenses.length > 0);

if (activeBundles.length === 0) {
  log(
    'Routing produced no bundles — falling back to the cross-cutting set so the review is not empty',
  );
  activeBundles = BUNDLES.filter((bundle) => bundle.scope === 'target').map(
    (bundle) => ({
      key: bundle.key,
      lenses: bundle.lenses.filter(
        (lens) => isDiffMode || !DIFF_ONLY_LENSES.has(lens),
      ),
      note: 'This bundle did not route explicitly; reviewing under the cross-cutting default.',
      files: allFiles,
    }),
  );
}

// Splitting happens once the roster is settled, on the spare concurrency.
const splitResult = splitBundles(activeBundles, input.agentCap);
activeBundles = splitResult.bundles;

if (splitResult.split.length > 0) {
  log(
    `Split ${splitResult.split.join(', ')} into two agents each — ${activeBundles.length} reviewer(s) against a budget of ${splitResult.budget}`,
  );
} else {
  log(
    `No bundles split — ${activeBundles.length} reviewer(s) already at or over the budget of ${splitResult.budget}`,
  );
}

const reconResult = {
  whatThisIs: recon?.whatThisIs ?? '(Recon returned no summary.)',
  packPath: recon?.packPath ?? `${input.scratchDir}/review-context.tmp.md`,
};

log(
  `${activeBundles.length} bundles active: ${activeBundles
    .map((bundle) => `${bundle.key}(${bundle.lenses.length})`)
    .join(', ')}`,
);
if (recon?.possibleGaps?.length) {
  log(`Recon flagged possible roster gaps: ${recon.possibleGaps.join(', ')}`);
}

// =============================================================================
// Review — one agent per bundle
// =============================================================================

phase('Review');

const PER_BUNDLE_VERIFY_CAP = 12;
const PER_VERIFIER_CAP = 8;

// An unrecognised severity counts as severe.
const SEVERE_SEVERITIES = new Set(['critical', 'high']);
/**
 * Picks the verifier model, using opus when any finding is severe.
 *
 * @param findings - The findings one verifier checks
 * @returns `'opus'` or `'sonnet'`
 */
const verifierModelFor = (findings) =>
  findings.some(
    (finding) =>
      !Object.hasOwn(SEVERITY_RANK, finding.severity) ||
      SEVERE_SEVERITIES.has(finding.severity),
  )
    ? 'opus'
    : 'sonnet';

// One pipeline with no barrier, so a bundle verifies as soon as it returns.
const reviewed = await pipeline(
  activeBundles,

  (active) => {
    const def = defFor(active);

    return (
      agent(buildReviewerPrompt(active, reconResult, input), {
        label: `review:${active.key}`,
        phase: 'Review',
        // A split half carries its own model.
        model: active.model ?? def.model,
        agentType: 'general-purpose',
        schema: FINDINGS,
      })
        .then((result) => ({
          bundle: active.key,
          parent: active.parent ?? active.key,
          // A skipped or dead agent resolves to null rather than throwing.
          died: result == null,
          findings: (result?.findings ?? []).map((finding) => ({
            ...finding,
            bundle: active.key,
            // Namespaced, since two bundles can both raise `bugs-1`.
            uid: `${active.key}::${finding.id}`,
            lens:
              finding.lens && LENSES[finding.lens]
                ? finding.lens
                : active.lenses[0],
          })),
          lensesRun: result?.lensesRun ?? [],
          declaredLenses: active.lenses,
        }))
        // A throwing stage drops the item, losing the bundle's lens table.
        .catch(() => ({
          bundle: active.key,
          parent: active.parent ?? active.key,
          findings: [],
          lensesRun: [],
          declaredLenses: active.lenses,
          died: true,
        }))
    );
  },

  async (result) => {
    const anchored = result.findings.filter((finding) => finding.line);
    const droppedForNoLine = result.findings.length - anchored.length;

    // Severity order within the bundle, matching the per-bundle cap.
    const ordered = [...anchored].sort(
      (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
    );
    const toVerify = ordered.slice(0, PER_BUNDLE_VERIFY_CAP);
    const overCap = ordered.slice(PER_BUNDLE_VERIFY_CAP);

    // One verifier per file, capped so no agent takes a wall of JSON.
    const byFile = new Map();
    for (const finding of toVerify) {
      if (!byFile.has(finding.file)) byFile.set(finding.file, []);
      byFile.get(finding.file).push(finding);
    }

    const batches = [];
    for (const [file, findings] of byFile) {
      for (let i = 0; i < findings.length; i += PER_VERIFIER_CAP) {
        batches.push({
          file,
          findings: findings.slice(i, i + PER_VERIFIER_CAP),
        });
      }
    }

    const verdicts = await parallel(
      batches.map(
        (batch) => () =>
          agent(
            buildVerifierPrompt(batch.file, batch.findings, reconResult, input),
            {
              label: `verify:${batch.file.split('/').pop()}`,
              phase: 'Verify',
              model: verifierModelFor(batch.findings),
              agentType: 'general-purpose',
              schema: VERDICTS,
            },
          ).then((reply) =>
            // Mapped back onto the namespaced uid, never the raw id.
            reply == null
              ? null
              : (reply.verdicts ?? [])
                  .map((verdict) => {
                    const finding = batch.findings.find(
                      (one) => one.id === verdict.id,
                    );
                    return finding ? [finding.uid, verdict] : null;
                  })
                  .filter(Boolean),
          ),
      ),
    );

    // Every finding left without a verdict, and why.
    const unverified = overCap.map((finding) => [finding.uid, 'cap']);
    batches.forEach((batch, i) => {
      const got = new Set((verdicts[i] ?? []).map(([uid]) => uid));
      for (const finding of batch.findings) {
        if (verdicts[i] == null) unverified.push([finding.uid, 'empty']);
        else if (!got.has(finding.uid)) unverified.push([finding.uid, 'missing']);
      }
    });

    return {
      ...result,
      findings: anchored,
      droppedForNoLine,
      overCap: overCap.length,
      verifierCount: batches.length,
      emptyVerifiers: verdicts.filter((one) => one == null).length,
      verifiedCount: toVerify.length,
      verdicts: verdicts.filter(Boolean).flat(),
      unverified,
    };
  },
);

const reviewResults = reviewed.filter(Boolean);

// =============================================================================
// Merge
// =============================================================================

const verdictByUid = new Map(
  reviewResults.flatMap((result) => result.verdicts ?? []),
);
const unverifiedWhyByUid = new Map(
  reviewResults.flatMap((result) => result.unverified ?? []),
);

const merged = [];
let twinCount = 0;

// An entry keeps the first finding's file, lens and line, which later ones must overlap.
for (const finding of reviewResults.flatMap((result) => result.findings)) {
  const twin = merged.find((one) => sameSpot(one, finding));

  if (!twin) {
    merged.push({
      file: finding.file,
      lens: finding.lens,
      line: finding.line,
      bundles: [finding.bundle],
      members: [finding],
    });
    continue;
  }

  twinCount++;
  twin.bundles.push(finding.bundle);
  twin.members.push(finding);
}

const droppedForNoLine = reviewResults.reduce(
  (total, result) => total + (result.droppedForNoLine ?? 0),
  0,
);
const overCapCount = reviewResults.reduce(
  (total, result) => total + (result.overCap ?? 0),
  0,
);
const verifyAgentCount = reviewResults.reduce(
  (total, result) => total + (result.verifierCount ?? 0),
  0,
);
const sentToVerification = reviewResults.reduce(
  (total, result) => total + (result.verifiedCount ?? 0),
  0,
);
const emptyVerifierCount = reviewResults.reduce(
  (total, result) => total + (result.emptyVerifiers ?? 0),
  0,
);
const bundlesDied = [
  ...new Set(
    reviewResults.filter((result) => result.died).map((result) => result.parent),
  ),
];

if (bundlesDied.length > 0) {
  log(
    `${bundlesDied.length} bundle(s) had a reviewer return nothing: ${bundlesDied.join(', ')}`,
  );
}
if (emptyVerifierCount > 0) {
  log(
    `${emptyVerifierCount} verifier(s) returned nothing — their findings are kept, marked unverified`,
  );
}

if (droppedForNoLine > 0) {
  log(
    `Dropped ${droppedForNoLine} finding(s) with no line reference — cannot anchor in the report`,
  );
}
if (overCapCount > 0) {
  log(
    `${overCapCount} finding(s) over the ${PER_BUNDLE_VERIFY_CAP}-per-bundle verify cap — kept, marked unverified, not dropped`,
  );
}
log(
  `${merged.length} findings after dedup — ${twinCount} cross-bundle twin(s) verified more than once`,
);

let splitVerdictCount = 0;

const allFormatted = merged.map((entry) => {
  // A finding the cap left out stays unverified, never confirmed.
  const { finding, verdict } = resolveEntry(
    entry.members.map((member) => ({
      finding: member,
      verdict: verdictByUid.get(member.uid) ?? null,
    })),
  );

  if (verdict?.splitWith) splitVerdictCount++;

  return formatFinding(finding, verdict, unverifiedWhyByUid.get(finding.uid));
});

// Counted after merging, so a twin verified twice counts once.
const unverifiedCount = allFormatted.filter(
  (finding) => finding.bucket === 'unverified',
).length;

if (splitVerdictCount > 0) {
  log(
    `${splitVerdictCount} finding(s) came back with two different verdicts — kept unless every verifier refuted it, and the disagreement is printed`,
  );
}

// =============================================================================
// Compose
// =============================================================================

phase('Compose');

// Coverage always last: non-coverage before coverage, severity within each.
const numbered = allFormatted
  .filter((finding) => finding.bucket !== 'refuted')
  .sort((a, b) => {
    if (a.coverage !== b.coverage) return a.coverage ? 1 : -1;
    return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
  })
  .map((finding, i) => ({ ...finding, n: i + 1 }));

const refutedBullets = allFormatted
  .filter((finding) => finding.bucket === 'refuted')
  .map((finding) => finding.refutedBullet);

const confirmedOrAmended = numbered.filter(
  (finding) => finding.bucket === 'confirmed' || finding.bucket === 'amended',
);

const readThisFirst =
  confirmedOrAmended.length > 0
    ? await agent(buildReadThisFirstPrompt(confirmedOrAmended, isDiffMode), {
        label: 'compose:read-this-first',
        phase: 'Compose',
        model: 'sonnet',
        agentType: 'general-purpose',
        schema: READ_THIS_FIRST_SCHEMA,
      }).then((reply) => reply?.readThisFirst ?? null)
    : null;

const normalFindings = numbered.filter((finding) => !finding.coverage);
const coverageFindings = numbered.filter((finding) => finding.coverage);

/**
 * Groups findings by lens, keeping the order each lens first appears in.
 *
 * @param list - The numbered findings
 * @returns The lens order and a map from lens to its findings
 */
function groupByLens(list) {
  const order = [];
  const map = new Map();
  for (const finding of list) {
    if (!map.has(finding.lens)) {
      map.set(finding.lens, []);
      order.push(finding.lens);
    }
    map.get(finding.lens).push(finding);
  }
  return { order, map };
}

const normal = groupByLens(normalFindings);
const cover = groupByLens(coverageFindings);

const counts = { critical: 0, high: 0, medium: 0, low: 0 };
normalFindings.forEach((finding) => counts[finding.severity]++);

const summaryTable = numbered
  .map((finding) =>
    finding.summaryRow.replace(/__N__/g, `[${finding.n}](#f${finding.n})`),
  )
  .join('\n');

let sections = '';
for (const lens of normal.order) {
  sections += `\n---\n\n# ${titleFor(lens)}\n\n`;
  for (const finding of normal.map.get(lens)) {
    sections += `<a id="f${finding.n}"></a>\n\n${finding.sectionMarkdown.replace(/__N__/g, finding.n)}\n\n`;
  }
}

let coverageSection = '';
if (coverageFindings.length > 0) {
  coverageSection += '\n---\n\n# Coverage gaps\n\n';
  for (const lens of cover.order) {
    coverageSection += `## ${titleFor(lens)}\n\n`;
    for (const finding of cover.map.get(lens)) {
      coverageSection += `<a id="f${finding.n}"></a>\n\n${finding.sectionMarkdown.replace(/__N__/g, finding.n)}\n\n`;
    }
  }
}

// What each bundle says it checked.
const firedLenses = activeBundles.flatMap((bundle) => bundle.lenses);
const skippedLenses = ALL_LENS_KEYS.filter((key) => !firedLenses.includes(key));

// A split bundle's two halves report into one table.
const tableByParent = new Map();
for (const result of reviewResults) {
  if (!tableByParent.has(result.parent)) {
    tableByParent.set(result.parent, { declared: [], reported: new Map() });
  }
  const entry = tableByParent.get(result.parent);
  entry.declared.push(...result.declaredLenses);
  for (const lens of result.lensesRun) entry.reported.set(lens.lens, lens);
  if (result.died) entry.died = true;
}

let lensTable = '';
for (const [parent, entry] of tableByParent) {
  const rows = entry.declared.map((lens) => {
    const hit = entry.reported.get(lens);
    return hit
      ? `| \`${lens}\` | ${hit.findingCount} | ${cell(hit.whatIChecked)} |`
      : `| \`${lens}\` | — | **Not reported back — treat this lens as unrun.** |`;
  });

  const died = entry.died
    ? '\n**A reviewer for this bundle returned nothing (skipped, or dead after retries) — the lenses it covered were not reviewed.**\n'
    : '';

  lensTable += `\n### ${BUNDLE_BY_KEY.get(parent)?.title ?? parent}\n${died}\n| Lens | Findings | What it checked |\n| ---- | -------- | --------------- |\n${rows.join('\n')}\n`;
}

// The report names bundles, not the agents they ran as.
const bundlesFired = [
  ...new Set(activeBundles.map((bundle) => bundle.parent ?? bundle.key)),
];
const bundlesSkipped = BUNDLES.map((bundle) => bundle.key).filter(
  (key) => !bundlesFired.includes(key),
);

const verificationSummary = `${sentToVerification} finding(s) sent to verification across ${verifyAgentCount} agent(s), ${confirmedOrAmended.length} confirmed or amended, ${refutedBullets.length} refuted and dropped${
  unverifiedCount
    ? `, ${unverifiedCount} kept unverified (${overCapCount} over the per-bundle verify cap${emptyVerifierCount ? `, ${emptyVerifierCount} verifier(s) returned nothing` : ''})`
    : ''
}${
  twinCount
    ? `. ${twinCount} finding(s) were raised by more than one bundle and verified more than once — the cost of verifying each bundle as it lands rather than waiting for all of them`
    : ''
}${
  splitVerdictCount
    ? `. ${splitVerdictCount} came back with two DIFFERENT verdicts; each was kept unless every verifier refuted it, and says so where it appears`
    : ''
}.`;

const routingSection =
  routingDecisions.length > 0
    ? `\n\n## Routing changed by Recon\n\nLens routing runs in JS from the file list. Recon made these calls on top of it:\n\n${routingDecisions.map((decision) => `- ${decision}`).join('\n')}`
    : '';

const refutedSection =
  refutedBullets.length > 0
    ? `\n\n## Refuted and dropped\n\n${refutedBullets.map((bullet) => `- ${bullet}`).join('\n')}`
    : '';

const headline = isDiffMode
  ? `# Branch review — \`${input.target}\``
  : `# Review — \`${input.moduleTarget ?? allFiles.join(', ')}\``;

const metaLine = isDiffMode
  ? `**Base:** \`${input.base}\` · **Reviewed:** ${input.today ?? 'unknown date'} · **Files changed:** ${allFiles.length} · **Findings:** ${normalFindings.length} (${counts.critical} critical, ${counts.high} high, ${counts.medium} medium, ${counts.low} low, ${coverageFindings.length} coverage)`
  : `**Reviewed:** ${input.today ?? 'unknown date'} · **Files:** ${allFiles.length} · **Findings:** ${normalFindings.length} (${counts.critical} critical, ${counts.high} high, ${counts.medium} medium, ${counts.low} low)`;

// Diff mode reviews commits while agents read the working tree, so a dirty tree is named.
const stateLine =
  isDiffMode && input.treeState
    ? `\n**State reviewed:** ${input.treeState}\n`
    : '';

const markdown = `${headline}

${metaLine}
${stateLine}
**Bundles run:** ${bundlesFired.join(', ')}

## What this ${isDiffMode ? 'branch does' : 'code is'}

${reconResult.whatThisIs}

## Summary

| # | Sev | Issue | Where |
| - | --- | ----- | ----- |
${summaryTable || '| — | — | No findings survived verification | — |'}

${readThisFirst ? `**Read this first.** ${readThisFirst}\n` : ''}
${sections}${coverageSection}
---

# Verification

${verificationSummary}${refutedSection}${routingSection}

# What each lens checked
${lensTable}
**Lenses that did not fire:** ${skippedLenses.length > 0 ? skippedLenses.join(', ') : 'none — every lens on the roster fired'}

Context pack: \`${reconResult.packPath}\`${input.toolReports?.importGraph ? `\nImport graph: \`${input.toolReports.importGraph}\`` : ''}`;

const reportPath = suggestedReportPath(input, allFiles);

// =============================================================================
// The PR review body
// =============================================================================

const coverageNote =
  coverageFindings.length > 0
    ? ` · ${coverageFindings.length} coverage gaps`
    : '';

const prBody = [
  `Deep review — ${allFiles.length} files, ${activeBundles.length} review agents, ${verifyAgentCount} verifiers.`,
  `**${counts.critical} critical · ${counts.high} high · ${counts.medium} medium · ${counts.low} low${coverageNote}.**`,
  readThisFirst ? `**Read this first.** ${readThisFirst}` : null,
  `Full report: \`${reportPath}\``,
]
  .filter(Boolean)
  .join('\n\n');

return {
  markdown,
  prBody,
  stats: {
    mode: input.mode,
    files: allFiles.length,
    findings: normalFindings.length,
    ...counts,
    coverage: coverageFindings.length,
    refuted: refutedBullets.length,
    unverified: unverifiedCount,
    twins: twinCount,
    splitVerdicts: splitVerdictCount,
    reviewAgents: activeBundles.length,
    verifyAgents: verifyAgentCount,
  },
  bundlesRun: bundlesFired,
  bundlesSkipped,
  bundlesSplit: splitResult.split,
  bundlesDied,
  routingDecisions,
  lensesRun: firedLenses,
  lensesSkipped: skippedLenses,
  packPath: reconResult.packPath,
  suggestedPath: reportPath,
};
