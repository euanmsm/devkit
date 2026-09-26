// ============================================================================
// Workflow Harness
// ============================================================================
//
// Runs a generated review workflow script with stand-in agents, the way the
// Workflow tool would, and records every agent call it makes.

/**
 * Runs a workflow script to completion with canned agent replies.
 *
 * @param source - The generated `review.workflow.js` text
 * @param args - The workflow's `args`
 * @returns The script's `result` and every agent `call` it made
 */
export async function runWorkflow(source, args) {
  const body = source.replace(/^export const meta/m, 'const meta');
  const AsyncFunction = (async () => {}).constructor;
  const script = new AsyncFunction(
    'agent',
    'parallel',
    'pipeline',
    'phase',
    'log',
    'args',
    body,
  );

  const calls = [];

  const agent = async (prompt, options) => {
    calls.push({ label: options.label, model: options.model, prompt });
    return reply(options.label, prompt);
  };
  const parallel = (thunks) => Promise.all(thunks.map((thunk) => thunk()));
  const pipeline = (items, ...stages) =>
    Promise.all(
      items.map(async (item) => {
        let value = item;
        for (const stage of stages) value = await stage(value);
        return value;
      }),
    );

  const result = await script(
    agent,
    parallel,
    pipeline,
    () => {},
    () => {},
    args,
  );

  return { result, calls };
}

/**
 * Builds a canned reply for one agent call.
 *
 * @param label - The call's label, which names its stage
 * @param prompt - The prompt it was given
 * @returns A reply in the shape that stage's schema asks for
 */
function reply(label, prompt) {
  if (label === 'recon') {
    return {
      whatThisIs: 'A test target.',
      packPath: 'tmp/pack.md',
      addLenses: [],
      removeLenses: [],
      notes: [],
      possibleGaps: [],
    };
  }

  if (label.startsWith('review:')) {
    const lenses = prompt
      .match(/You cover \*\*\d+ lens(?:es)?\*\*: ([^\n]+?)\. Work/)[1]
      .split(', ');
    const file = prompt.match(/## Your files\n(\S+)/)[1];

    return {
      findings: lenses.map((lens, i) => ({
        id: `${lens}-1`,
        lens,
        file,
        line: String(10 + i * 10),
        severity: 'high',
        issue: `${lens} issue`,
        detail: 'detail',
        whyItMatters: 'why',
        evidence: 'evidence',
        convention: null,
      })),
      lensesRun: lenses.map((lens) => ({
        lens,
        findingCount: 1,
        whatIChecked: 'checked',
      })),
    };
  }

  if (label.startsWith('verify:')) {
    const findings = JSON.parse(
      prompt.slice(prompt.indexOf('## The findings\n') + 16),
    );
    return {
      verdicts: findings.map((finding) => ({
        id: finding.id,
        verdict: 'confirmed',
        reasoning: 'held up',
        corrected: null,
      })),
    };
  }

  return { readThisFirst: 'Read this.' };
}
