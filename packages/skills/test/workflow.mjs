// ============================================================================
// Workflow Harness
// ============================================================================
//
// Runs a generated workflow script with stand-in agents under the Workflow
// tool's rules, and records every agent call it makes.

/**
 * Runs a workflow script to completion with canned agent replies.
 *
 * Mirrors the Workflow tool: `parallel` resolves a failed thunk to null,
 * `pipeline` drops an item to null at the first stage that throws, and
 * `Date.now()`, `Math.random()` and argless `new Date()` throw. It also
 * refuses a `meta` that is not a pure literal and an agent schema whose root
 * is not an object or whose `required` names a field `properties` lacks. A
 * schema or clock violation fails the run even when `parallel` or `pipeline`
 * swallowed it.
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
  checkMeta(source);

  const body = source.replace(/^export const meta/m, 'const meta');
  const AsyncFunction = (async () => {}).constructor;
  const script = new AsyncFunction(
    'agent',
    'parallel',
    'pipeline',
    'phase',
    'log',
    'args',
    'Date',
    'Math',
    body,
  );

  const calls = [];
  const logs = [];
  const violations = [];
  let clock = 0;

  const violation = (message) => {
    const error = new Error(message);
    violations.push(error);
    return error;
  };

  const agent = async (prompt, options) => {
    if (options.schema) {
      const problem = schemaProblem(options.schema);
      if (problem) throw violation(`${options.label}: ${problem}`);
    }

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
  const settle = async (run) => {
    try {
      return await run();
    } catch {
      return null;
    }
  };
  const parallel = (thunks) =>
    Promise.all(thunks.map((thunk) => settle(thunk)));
  const pipeline = (items, ...stages) =>
    Promise.all(
      items.map((item) =>
        settle(async () => {
          let value = item;
          for (const stage of stages) value = await stage(value);
          return value;
        }),
      ),
    );

  const result = await script(
    agent,
    parallel,
    pipeline,
    () => {},
    (line) => logs.push(line),
    args,
    strictDate(violation),
    strictMath(violation),
  );

  if (violations.length > 0) throw violations[0];
  return { result, calls, logs };
}

// =============================================================================
// Tool rules
// =============================================================================

/**
 * Builds a `Date` whose clock reads throw, as they do in a workflow script.
 *
 * @param violation - Records a rule break and returns the error to throw
 * @returns A `Date` stand-in that still builds dates from explicit values
 */
function strictDate(violation) {
  return new Proxy(Date, {
    apply: () => {
      throw violation('Date() reads the clock, which a workflow cannot');
    },
    construct: (target, values, newTarget) => {
      if (values.length === 0) {
        throw violation('new Date() reads the clock, which a workflow cannot');
      }
      return Reflect.construct(target, values, newTarget);
    },
    get: (target, key, receiver) =>
      key === 'now'
        ? () => {
            throw violation(
              'Date.now() reads the clock, which a workflow cannot',
            );
          }
        : Reflect.get(target, key, receiver),
  });
}

/**
 * Builds a `Math` whose `random` throws, as it does in a workflow script.
 *
 * @param violation - Records a rule break and returns the error to throw
 * @returns A `Math` stand-in with every other method intact
 */
function strictMath(violation) {
  return Object.create(Math, {
    random: {
      value: () => {
        throw violation('Math.random() is not allowed in a workflow');
      },
    },
  });
}

/**
 * Finds the first way a schema breaks the tool's rules.
 *
 * @param schema - A schema passed to `agent`
 * @returns What is wrong, or null when the schema is sound
 */
export function schemaProblem(schema) {
  if (schema?.type !== 'object')
    return "the schema root must have type 'object'";
  return nestedProblem(schema, 'schema');
}

/**
 * Checks one schema node and everything under it.
 *
 * @param node - A schema node
 * @param path - Where the node sits, for the message
 * @returns What is wrong, or null when the node is sound
 */
function nestedProblem(node, path) {
  if (!node || typeof node !== 'object') return null;

  const properties = node.properties ?? {};
  for (const field of node.required ?? []) {
    if (!Object.hasOwn(properties, field)) {
      return `${path} requires "${field}", which its properties lack`;
    }
  }

  const children = [
    ...Object.entries(properties).map(([key, child]) => [
      `${path}.${key}`,
      child,
    ]),
    [`${path}[]`, node.items],
    ...['anyOf', 'oneOf', 'allOf'].flatMap((key) =>
      (node[key] ?? []).map((child, i) => [`${path}.${key}[${i}]`, child]),
    ),
  ];
  for (const [childPath, child] of children) {
    const problem = nestedProblem(child, childPath);
    if (problem) return problem;
  }
  return null;
}

const META_TOKEN =
  /\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/|'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\$]|\\.|\$(?!\{))*`|-?\d+(?:\.\d+)?|[A-Za-z_$][\w$]*|\.\.\.|[\s\S]/y;

/**
 * Refuses a `meta` that is not a pure literal, the way the tool does.
 *
 * @param source - The workflow script's text
 * @throws When `meta` is missing, or uses a variable, call, spread or template interpolation
 */
export function checkMeta(source) {
  const start = source.match(/^export const meta\s*=\s*/m);
  if (!start) throw new Error('The workflow has no `export const meta`');

  const tokens = [];
  let depth = 0;
  META_TOKEN.lastIndex = start.index + start[0].length;
  do {
    const token = META_TOKEN.exec(source)?.[0];
    if (token === undefined) break;
    if (/^(\s|\/\/|\/\*)/.test(token)) continue;
    if (token === '{' || token === '[') depth++;
    if (token === '}' || token === ']') depth--;
    tokens.push(token);
  } while (depth > 0);

  const literal = (token, next) =>
    /^['"`]|^-?\d/.test(token) ||
    ['{', '}', '[', ']', ':', ','].includes(token) ||
    ['true', 'false', 'null'].includes(token) ||
    (/^[A-Za-z_$]/.test(token) && next === ':');

  const bad = tokens.find((token, i) => !literal(token, tokens[i + 1]));
  if (bad !== undefined || depth !== 0) {
    throw new Error(
      `Workflow meta must be a pure literal, but has \`${bad ?? 'an unclosed brace'}\``,
    );
  }
}

// =============================================================================
// Canned replies
// =============================================================================

/**
 * Builds a canned reply for one agent call.
 *
 * @param label - The call's label, which names its stage
 * @param prompt - The prompt it was given
 * @returns A reply in the shape that stage's schema asks for
 */
export function reply(label, prompt) {
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
