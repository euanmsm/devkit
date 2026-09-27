// ============================================================================
// Workflow Harness
// ============================================================================
//
// Runs a generated workflow script with stand-in agents, the way the
// Workflow tool would, and records every agent call it makes.

/**
 * Runs a workflow script to completion with canned agent replies.
 *
 * @param source - The generated workflow script's text
 * @param args - The workflow's `args`
 * @param options - A `reply` builder in place of the review's canned replies, and a `delay` in milliseconds per call
 * @returns The script's `result`, every agent `call` it made with its start and end order, and its `logs`
 */
export async function runWorkflow(
  source,
  args,
  { reply: replyFor = reply, delay = () => 0 } = {},
) {
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
  const logs = [];
  let clock = 0;

  const agent = async (prompt, options) => {
    const call = {
      label: options.label,
      model: options.model,
      prompt,
      started: clock++,
    };
    calls.push(call);

    const wait = delay(options.label, prompt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));

    call.ended = clock++;
    return replyFor(options.label, prompt);
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
    (line) => logs.push(line),
    args,
  );

  return { result, calls, logs };
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
