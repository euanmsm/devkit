// ============================================================================
// Comment Budget — Tests
// ============================================================================
//
// One pair per implemented rule: a source that breaks it, and a source that
// does not.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { scan, newFindings, governs } from '../src/scanner.mjs';

// =============================================================================
// Fixtures
// =============================================================================

const BAR =
  '// ============================================================================';
const HEADER = `${BAR}\n// Fixture\n${BAR}`;

const ANCHOR = 'export const anchor = 0;';

/** Prefixes JSDoc to any export line not already carrying it, for rule 2. */
function documented(body) {
  const out = [];

  for (const line of body) {
    if (/^export\s/.test(line) && !out.at(-1)?.trim().endsWith('*/'))
      out.push('/** Fixture. */');
    out.push(line);
  }

  return out;
}

/** Builds a source with a legal header and the given body lines. */
function src(...body) {
  return `${HEADER}\n\n${documented([ANCHOR, '', ...body]).join('\n')}\n`;
}

/** Rule names a source breaks. */
function rules(source) {
  return [...new Set(scan(source).map((f) => f.rule))].sort();
}

/** Asserts a source breaks exactly one rule, the given one. */
function breaks(rule, source) {
  assert.deepEqual(rules(source), [rule]);
}

/** Asserts a source breaks nothing. */
function passes(source) {
  assert.deepEqual(scan(source), []);
}

// =============================================================================
// Scope
// =============================================================================

describe('governs', () => {
  test('covers every hand-written source extension', () => {
    const paths = [
      'apps/main/src/a.ts',
      'apps/main/src/b.tsx',
      'scripts/ci/c.mjs',
      'scripts/d.cjs',
      'apps/main/eslint.config.mjs',
      'compliance/export.mjs',
      '.claude/hooks/comment-gate.mjs',
    ];

    for (const path of paths) assert.equal(governs(path), true, path);
  });

  test('skips vendored and generated files', () => {
    const paths = [
      'node_modules/pkg/index.js',
      'apps/main/public/pdfjs/pdf.min.mjs',
      'src/vitest-jest-dom.d.ts',
    ];

    for (const path of paths) assert.equal(governs(path), false, path);
  });

  test('skips extensions the contract says nothing about', () => {
    const paths = [
      'README.md',
      'supabase/migrations/x.sql',
      'package.json',
      'a/b.yml',
    ];

    for (const path of paths) assert.equal(governs(path), false, path);
  });
});

// =============================================================================
// Coverage
// =============================================================================

describe('rule 1 — file header', () => {
  test('flags a file that opens with code', () => {
    breaks('file-header', '/** Fixture. */\nexport const a = 1;\n');
  });

  test('accepts a `// ====` header', () => {
    passes(src('export const a = 1;'));
  });

  test("accepts a header below an executable script's shebang", () => {
    passes(
      `#!/usr/bin/env node\n${HEADER}\n\n/** F. */\nexport const a = 1;\n`,
    );
  });

  test('flags a shebang with no header under it', () => {
    breaks(
      'file-header',
      '#!/usr/bin/env node\n/** F. */\nexport const a = 1;\n',
    );
  });
});

describe('rule 2 — exported symbols', () => {
  test('flags an export with no JSDoc', () => {
    breaks('exported-jsdoc', `${HEADER}\n\nexport const a = 1;\n`);
  });

  test('flags an export carrying only a `//` comment', () => {
    breaks('exported-jsdoc', `${HEADER}\n\n// Room id.\nexport const a = 1;\n`);
  });

  test('accepts an export carrying JSDoc', () => {
    passes(`${HEADER}\n\n/** Room id. */\nexport const a = 1;\n`);
  });

  test('ignores a re-export, which binds no new symbol', () => {
    passes(
      `${HEADER}\n\nexport { a } from "./x";\nexport * from "./y";\nexport type { Z } from "./z";\n`,
    );
  });

  test('ignores a default export of an existing binding', () => {
    passes(
      `${HEADER}\n\n/** Meta. */\nconst meta = 1;\nexport default meta;\n`,
    );
  });
});

describe('rule 3 — property JSDoc', () => {
  test('flags a property with no JSDoc', () => {
    breaks(
      'property-jsdoc',
      src('export interface P {', '\tname: string;', '}'),
    );
  });

  test('flags a block-form property JSDoc', () => {
    breaks(
      'property-jsdoc',
      src(
        'export interface P {',
        '\t/**',
        '\t * Name.',
        '\t */',
        '\tname: string;',
        '}',
      ),
    );
  });

  test('flags a property JSDoc carrying a second sentence', () => {
    breaks(
      'property-jsdoc',
      src(
        'export interface P {',
        '\t/** Name. Set at creation. */',
        '\tname: string;',
        '}',
      ),
    );
  });

  test('accepts a one-line, one-clause property JSDoc', () => {
    passes(
      src(
        'export interface P {',
        '\t/** Name of the room. */',
        '\tname: string;',
        '}',
      ),
    );
  });

  test('anchors the finding on the property, not the line above it', () => {
    const found = scan(src('export interface P {', '\tname: string;', '}'));

    assert.equal(found[0].line, 10);
  });

  test('accepts the ✓ property docs from 2-examples.md rules 3 and 12', () => {
    passes(
      src(
        'export interface P {',
        '\t/** Application role from the JWT. */',
        '\trole: UserRole;',
        '\t/** Tenant org status, `null` when unreadable. */',
        '\torgStatus: OrgStatus | null;',
        '\t/** Rate limiter for school-admin invites, keyed by org. */',
        '\tinviteLimiter: Limiter;',
        '\t/** Smallest scale the layout may shrink to. */',
        '\tminScale: number;',
        '}',
      ),
    );
  });
});

describe('rule 2 — scope', () => {
  test('flags a function the file keeps to itself', () => {
    breaks('exported-jsdoc', src('function local(): void {}'));
  });

  test('flags an arrow-function const the file keeps to itself', () => {
    breaks('exported-jsdoc', src('const local = (): void => {};'));
  });

  test('flags one carrying a TypeScript annotation on its name', () => {
    breaks('exported-jsdoc', src('const local: Handler = (): void => {};'));
  });

  test('leaves a plain value, class, type and interface alone', () => {
    passes(
      src(
        'const MAX_PORT = 3000;',
        'class Local {}',
        'type Local2 = string;',
        'interface Local3 {',
        '\t/** A name. */',
        '\tname: string;',
        '}',
      ),
    );
  });

  test('leaves a helper nested inside another function alone', () => {
    passes(
      src(
        '/** Does a thing. */',
        'function outer(): void {',
        '\tfunction inner() {}',
        '\tinner();',
        '}',
      ),
    );
  });

  test('accepts JSDoc a blank line separates from its declaration', () => {
    passes(src('/** Does a thing. */', '', 'function local(): void {}'));
  });

  test('accepts a documented local function', () => {
    passes(src('/** Does a thing. */', 'function local(): void {}'));
  });
});

describe('rule 20 — tag coverage', () => {
  test('flags a parameter with no @param', () => {
    breaks(
      'jsdoc-tag-coverage',
      src('/** Does a thing. */', 'export function f(id: string): void {}'),
    );
  });

  test('flags a @param naming a parameter the signature has lost', () => {
    const found = scan(
      src(
        '/**',
        ' * Does a thing.',
        ' *',
        ' * @param old - The id',
        ' */',
        'export function f(fresh: string): void {}',
      ),
    );

    assert.deepEqual(
      found.map((f) => f.message),
      ['`fresh` has no @param.', '@param `old` names no parameter.'],
    );
  });

  test('flags a function returning a value with no @returns', () => {
    const found = scan(
      src(
        '/**',
        ' * Does a thing.',
        ' *',
        ' * @param id - The id',
        ' */',
        'export function f(id: string): string {',
        '\treturn id;',
        '}',
      ),
    );

    assert.deepEqual(
      found.map((f) => f.message),
      ['Function returns a value but has no @returns.'],
    );
  });

  test('asks nothing of a void function', () => {
    passes(src('/** Does a thing. */', 'export function f(): void {}'));
  });

  test('flags a function that throws with no @throws', () => {
    const found = scan(
      src(
        '/** Does a thing. */',
        'export function f(): void {',
        "\tthrow new Error('no');",
        '}',
      ),
    );

    assert.deepEqual(
      found.map((f) => f.message),
      ['Function throws but has no @throws.'],
    );
  });

  test('asks nothing of a throw belonging to a nested function', () => {
    passes(
      src(
        '/** Does a thing. */',
        'export function f(): void {',
        '\tconst inner = (): void => {',
        "\t\tthrow new Error('no');",
        '\t};',
        '\tinner();',
        '}',
      ),
    );
  });

  test('counts a parameter list split across lines', () => {
    passes(
      src(
        '/**',
        ' * Does a thing.',
        ' *',
        ' * @param a - One',
        ' * @param b - Two',
        ' */',
        'export function f(',
        '\ta: number,',
        '\tb: number,',
        '): void {}',
      ),
    );
  });

  test('flags a missing @param on a parameter list split across lines', () => {
    const found = scan(
      src(
        '/**',
        ' * Does a thing.',
        ' *',
        ' * @param a - One',
        ' */',
        'export function f(',
        '\ta: number,',
        '\tb: number,',
        '): void {}',
      ),
    );

    assert.deepEqual(
      found.map((f) => f.message),
      ['`b` has no @param.'],
    );
  });

  test('asks nothing of a block that is not JSDoc', () => {
    passes(
      src('/*', ' * Does a thing.', ' */', 'export function f(id: string) {}'),
    );
  });

  test('counts a destructured parameter as one', () => {
    passes(
      src(
        '/**',
        ' * Does a thing.',
        ' *',
        ' * @param options - The options',
        ' */',
        'export function f({ a, b }: Options): void {}',
      ),
    );
  });

  test('flags a destructured parameter documented by no @param', () => {
    const found = scan(
      src(
        '/** Does a thing. */',
        'export function f({ a, b }: Options): void {}',
      ),
    );

    assert.deepEqual(
      found.map((f) => f.message),
      ['A destructured parameter has no @param.'],
    );
  });

  test('counts a default value carrying a comma as one parameter', () => {
    passes(
      src(
        '/**',
        ' * Does a thing.',
        ' *',
        ' * @param a - One',
        ' * @param b - Two',
        ' */',
        'export function f(a = g(1, 2), b: number): void {}',
      ),
    );
  });

  test('asks nothing of an overload, whose body is another function', () => {
    passes(
      src(
        '/** Does a thing. */',
        'export function f(id: string): void;',
        '',
        '/** Does a thing. */',
        'export function g(): void {',
        '\th();',
        '}',
      ),
    );
  });

  test('asks nothing of a return type it cannot read', () => {
    passes(
      src(
        '/** Does a thing. */',
        'export function f(): { a: number } {',
        '\treturn { a: 1 };',
        '}',
      ),
    );
  });

  test('ignores a comma inside a default string value', () => {
    const found = scan(
      src(
        '/**',
        ' * Does a thing.',
        ' *',
        ' * @param sep - The separator',
        ' */',
        "export function f(sep = ',', n: number): void {}",
      ),
    );

    assert.deepEqual(
      found.map((f) => f.message),
      ['`n` has no @param.'],
    );
  });
});

describe('rule 20 — harder signatures', () => {
  test('counts a function-typed parameter as one', () => {
    passes(
      src(
        '/**',
        ' * Does a thing.',
        ' *',
        ' * @param cb - What to call',
        ' * @param n - How often',
        ' */',
        'export function f(cb: (a: string) => void, n: number): void {}',
      ),
    );
  });

  test('counts a generic parameter list', () => {
    passes(
      src(
        '/**',
        ' * Does a thing.',
        ' *',
        ' * @param m - The map',
        ' */',
        'export function f<T>(m: Map<string, T>): void {}',
      ),
    );
  });

  test('asks nothing of an async function returning Promise<void>', () => {
    passes(
      src(
        '/** Does a thing. */',
        'export async function f(): Promise<void> {',
        '\tawait g();',
        '}',
      ),
    );
  });

  test('asks for a @returns from an async function returning a value', () => {
    const found = scan(
      src(
        '/** Does a thing. */',
        'export async function f(): Promise<string> {',
        '\treturn g();',
        '}',
      ),
    );

    assert.deepEqual(
      found.map((f) => f.message),
      ['Function returns a value but has no @returns.'],
    );
  });

  test('asks for a @returns from an arrow returning an expression', () => {
    const found = scan(
      src('/** Does a thing. */', 'export const f = (n: number) => n + 1;'),
    );

    assert.deepEqual(
      found.map((f) => f.message),
      ['`n` has no @param.', 'Function returns a value but has no @returns.'],
    );
  });

  test('asks nothing of a bare `return` in an unannotated function', () => {
    passes(
      src(
        '/** Does a thing. */',
        'export function f() {',
        '\tif (!g()) return;',
        '\th();',
        '}',
      ),
    );
  });

  test('reads a @param written without a dash', () => {
    passes(
      src(
        '/**',
        ' * Does a thing.',
        ' *',
        ' * @param id The id',
        ' */',
        'export function f(id: string): void {}',
      ),
    );
  });

  test('reads a rest parameter and an optional one', () => {
    passes(
      src(
        '/**',
        ' * Does a thing.',
        ' *',
        ' * @param first - The first',
        ' * @param rest - The others',
        ' */',
        'export function f(first?: string, ...rest: string[]): void {}',
      ),
    );
  });

  test('asks nothing of a TypeScript `this` parameter', () => {
    passes(
      src(
        '/**',
        ' * Does a thing.',
        ' *',
        ' * @param n - The number',
        ' */',
        'export function f(this: Widget, n: number): void {}',
      ),
    );
  });

  test('reads a default export function', () => {
    const found = scan(
      src('/** Does a thing. */', 'export default function f(id: string) {}'),
    );

    assert.deepEqual(
      found.map((f) => f.message),
      ['`id` has no @param.'],
    );
  });

  test('asks nothing of a method, which sits below the top level', () => {
    passes(
      src(
        '/** A widget. */',
        'export class Widget {',
        '\tresize(width: number): number {',
        '\t\treturn width;',
        '\t}',
        '}',
      ),
    );
  });

  test('flags a documented function whose @param count is short', () => {
    const found = scan(
      src(
        '/**',
        ' * Does a thing.',
        ' *',
        ' * @param a - One',
        ' */',
        'export function f(a: number, b: number): void {}',
      ),
    );

    assert.deepEqual(
      found.map((f) => f.message),
      ['`b` has no @param.'],
    );
  });
});

describe('rule 20 — where a body ends', () => {
  const DOC = [
    '/**',
    ' * Does a thing.',
    ' *',
    ' * @param x - The input',
    ' * @returns The output',
    ' */',
  ];
  const VOID_DOC = [
    '/**',
    ' * Does a thing.',
    ' *',
    ' * @param x - The input',
    ' */',
  ];

  test('leaves a function alone when a top-level throw follows it', () => {
    passes(
      src(
        ...DOC,
        'function a(x) {',
        '\treturn x;',
        '}',
        '',
        "if (!x) throw new Error('boom');",
      ),
    );
  });

  test('leaves an arrow alone when a top-level throw follows it', () => {
    passes(
      src(
        ...DOC,
        'const a = (x) => {',
        '\treturn x;',
        '};',
        '',
        "if (!x) throw new Error('boom');",
      ),
    );
  });

  test("keeps a later function's return out of a void function", () => {
    passes(
      src(
        ...VOID_DOC,
        'function a(x) {',
        '\tconsole.log(x);',
        '}',
        '',
        ...DOC,
        'function b(x) {',
        '\treturn x;',
        '}',
      ),
    );
  });

  test("keeps a later arrow's return out of a void arrow", () => {
    passes(
      src(
        ...VOID_DOC,
        'const a = (x) => {',
        '\tconsole.log(x);',
        '};',
        '',
        ...DOC,
        'const b = (x) => {',
        '\treturn x;',
        '};',
      ),
    );
  });

  test('flags a function that throws inside its own body', () => {
    const found = scan(
      src(
        ...DOC,
        'function a(x) {',
        "\tif (!x) throw new Error('boom');",
        '\treturn x;',
        '}',
      ),
    );

    assert.deepEqual(
      found.map((f) => f.message),
      ['Function throws but has no @throws.'],
    );
  });

  test('flags an arrow that throws inside its own body', () => {
    const found = scan(
      src(
        ...DOC,
        'const a = (x) => {',
        "\tif (!x) throw new Error('boom');",
        '\treturn x;',
        '};',
      ),
    );

    assert.deepEqual(
      found.map((f) => f.message),
      ['Function throws but has no @throws.'],
    );
  });
});

describe('rule 2 — brace counting', () => {
  test('keeps checking exports after a brace inside a string', () => {
    breaks(
      'exported-jsdoc',
      `${HEADER}\n\n/** Open. */\nexport const open = "{";\n\nexport const b = 2;\n`,
    );
  });

  test('keeps checking exports after a brace inside a regex', () => {
    breaks(
      'exported-jsdoc',
      `${HEADER}\n\n/** Open. */\nexport const re = /\\{/;\n\nexport const b = 2;\n`,
    );
  });

  test('keeps checking exports after a brace inside a template literal', () => {
    breaks(
      'exported-jsdoc',
      `${HEADER}\n\n/** Open. */\nexport const t = \`{\`;\n\nexport const b = 2;\n`,
    );
  });

  test('balances a JSX comment, whose braces sit either side of `/* */`', () => {
    breaks(
      'exported-jsdoc',
      `${HEADER}\n\n/** F. */\nexport const a = <p>{/* Note. */}</p>;\n\nexport const b = 2;\n`,
    );
  });

  test('balances a JSX comment running over two lines', () => {
    breaks(
      'exported-jsdoc',
      `${HEADER}\n\n/** F. */\nexport const a = <p>{/* Note\n * and more. */}</p>;\n\nexport const b = 2;\n`,
    );
  });

  test('balances a self-closing JSX element after a brace', () => {
    breaks(
      'exported-jsdoc',
      `${HEADER}\n\n/** F. */\nexport const a = <p>{x && <i n={y} />}</p>;\n\nexport const b = 2;\n`,
    );
  });
});

describe('rule 5 — header cap', () => {
  test('flags a header over eight lines', () => {
    const overview = Array.from({ length: 8 }, (_, i) => `// Line ${i}.`).join(
      '\n',
    );

    breaks(
      'header-cap',
      `${BAR}\n// Fixture\n${BAR}\n//\n${overview}\n\n/** F. */\nexport const a = 1;\n`,
    );
  });

  test('flags a subsection inside the header', () => {
    breaks(
      'header-cap',
      `${BAR}\n// Fixture\n${BAR}\n//\n// Detail\n// ------\n\n/** F. */\nexport const a = 1;\n`,
    );
  });

  test('accepts a header at the cap', () => {
    passes(
      `${BAR}\n// Fixture\n${BAR}\n//\n// Overview.\n\n/** F. */\nexport const a = 1;\n`,
    );
  });

  test('anchors the cap on the first line past it', () => {
    const overview = Array.from({ length: 8 }, (_, i) => `// Line ${i}.`).join(
      '\n',
    );
    const found = scan(
      `${BAR}\n// Fixture\n${BAR}\n//\n${overview}\n\n/** F. */\nexport const a = 1;\n`,
    );

    assert.equal(found[0].line, 9);
  });

  test('catches a header grown past the cap by an added line', () => {
    const body = '\n/** F. */\nexport const a = 1;\n';
    const overview = (n) =>
      Array.from({ length: n }, (_, i) => `// Line ${i}.`).join('\n');
    const before = `${BAR}\n// Fixture\n${BAR}\n//\n${overview(4)}\n${body}`;
    const after = `${BAR}\n// Fixture\n${BAR}\n//\n${overview(5)}\n${body}`;

    const found = newFindings(before, after, [{ from: 9, to: 9 }]);

    assert.equal(found.length, 1);
    assert.equal(found[0].rule, 'header-cap');
  });

  test('does not absorb a comment block sitting below the header', () => {
    const source = `${BAR}\n// Fixture\n${BAR}\n//\n// Overview.\n\n// The regex matches a slug.\n// The regex matches a code.\n\n/** F. */\nexport const a = 1;\n`;

    assert.deepEqual(rules(source), ['logic-comment-length']);
  });
});

describe('rule 6 — JSDoc cap', () => {
  test('flags more than four prose lines', () => {
    const prose = Array.from({ length: 5 }, (_, i) => ` * Line ${i}.`).join(
      '\n',
    );

    breaks('jsdoc-cap', src('/**', prose, ' */', 'export const a = 1;'));
  });

  test('flags a tag wrapping onto a second line', () => {
    breaks(
      'jsdoc-cap',
      src(
        '/**',
        ' * Does a thing.',
        ' * @param id - The id',
        ' * of the room',
        ' */',
        'export function f(id) {}',
      ),
    );
  });

  test('accepts a summary plus tags', () => {
    passes(
      src(
        '/**',
        ' * Does a thing.',
        ' *',
        ' * @param id - Room id',
        ' */',
        'export function f(id) {}',
      ),
    );
  });

  test('catches a block grown past the cap by an added line', () => {
    const block = (n) => [
      '/**',
      ...Array.from({ length: n }, (_, i) => ` * Line ${i}.`),
      ' */',
      'export const a = 1;',
    ];
    const before = src(...block(4));
    const after = src(...block(5));

    const found = newFindings(before, after, [{ from: 13, to: 13 }]);

    assert.equal(found.length, 1);
    assert.equal(found[0].rule, 'jsdoc-cap');
  });
});

describe('rule 7 — logic comment cap', () => {
  test('flags a two-line logic comment', () => {
    breaks(
      'logic-comment-length',
      src(
        '// The regex matches a slug.',
        '// The regex matches a code.',
        'export const a = 1;',
      ),
    );
  });

  test('accepts a single line', () => {
    passes(src('// The regex matches a slug.', 'export const a = 1;'));
  });
});

describe('rule 9 — no history', () => {
  test('flags past tense about the code', () => {
    breaks(
      'no-history',
      src('// The value is no longer read here.', 'export const a = 1;'),
    );
  });
});

describe('rule 10 — no conversation', () => {
  test('flags a reference to the plan', () => {
    breaks(
      'no-conversation',
      src('// Removed as requested.', 'export const a = 1;'),
    );
  });
});

describe('rule 11 — no issue ids', () => {
  test('flags a bare issue code', () => {
    breaks(
      'no-issue-id',
      src('// Matches the shape CUR-1234 describes.', 'export const a = 1;'),
    );
  });

  test('accepts a live TODO marker', () => {
    passes(src('// TODO(CUR-1234): drop the shim.', 'export const a = 1;'));
  });
});

describe('rule 12 — no justification', () => {
  test('flags a rationale clause', () => {
    breaks(
      'no-justification',
      src(
        '// The list is sorted so that the picker is stable.',
        'export const a = 1;',
      ),
    );
  });
});

describe('rule 13 — one sentence, one clause, 100 chars', () => {
  test('flags a comment over the character cap', () => {
    breaks(
      'comment-length',
      src(`// ${'a'.repeat(120)}`, 'export const a = 1;'),
    );
  });

  test('flags a second sentence', () => {
    breaks(
      'comment-length',
      src('// Matches a slug. Matches a code.', 'export const a = 1;'),
    );
  });
});

describe('rule 15 — no commented-out code', () => {
  test('flags a commented-out statement', () => {
    breaks('no-commented-code', src('// const b = 2;', 'export const a = 1;'));
  });
});

describe('rule 16 — marker form', () => {
  test('flags a bare TODO', () => {
    breaks('todo-form', src('// TODO: sort this out', 'export const a = 1;'));
  });

  test('flags a FIXME', () => {
    breaks('todo-form', src('// FIXME: broken', 'export const a = 1;'));
  });

  test('accepts `TODO(CUR-1234):`', () => {
    passes(src('// TODO(CUR-1234): drop the shim.', 'export const a = 1;'));
  });
});

describe('rule 17 — allowed tags', () => {
  test('flags @example', () => {
    breaks(
      'jsdoc-tags',
      src(
        '/**',
        ' * Does a thing.',
        ' * @example f(1)',
        ' * @param id - A thing',
        ' */',
        'export function f(id) {}',
      ),
    );
  });

  test('accepts @throws and @deprecated', () => {
    passes(
      src(
        '/**',
        ' * Does a thing.',
        ' *',
        ' * @param id - A thing',
        ' * @throws When absent',
        ' * @deprecated Use g',
        ' */',
        'export function f(id) {}',
      ),
    );
  });
});

// =============================================================================
// Scan options
// =============================================================================

describe('scan output', () => {
  test('findings carry 1-based line numbers', () => {
    const found = scan(
      src('export const a = 1;', '// The value is no longer read here.'),
    );

    assert.equal(found[0].line, 10);
  });

  test('findings come back in line order', () => {
    const found = scan(
      src(
        '// The value is no longer read here.',
        'export const a = 1;',
        '// Removed as requested.',
      ),
    );
    const lines = found.map((f) => f.line);

    assert.deepEqual(
      lines,
      [...lines].sort((a, b) => a - b),
    );
  });
});

// =============================================================================
// newFindings — what it blocks
// =============================================================================

describe('newFindings blocks', () => {
  test('a comment the edit introduces', () => {
    const before = src();
    const after = src('// The value is now read from the cache.');

    const found = newFindings(before, after);

    assert.equal(found.length, 1);
    assert.equal(found[0].rule, 'no-history');
  });

  test('every rule a single comment breaks', () => {
    const after = src(
      '// This is now what we use here, rather than the old approach, because it was previously broken and slow.',
    );

    const rules = newFindings(src(), after).map((f) => f.rule);

    assert.deepEqual([...new Set(rules)].sort(), [
      'comment-length',
      'no-history',
      'no-justification',
      'no-person',
    ]);
  });

  test('a violation the same violation later in the file would otherwise absorb', () => {
    const stale = '// The value is no longer read here.';
    const before = src('export const b = 2;', stale);
    const after = src(stale, 'export const b = 2;', stale);
    const span = [{ from: 8, to: 8 }];

    const found = newFindings(before, after, span);

    assert.equal(found.length, 1);
    assert.equal(found[0].line, 8);
  });

  test('a new file with no header', () => {
    const found = newFindings('', 'export const a = 1;\n', null);

    assert.equal(
      found.some((f) => f.rule === 'file-header'),
      true,
    );
  });

  test('a second copy of a violation the file already had once', () => {
    const before = src('// The flag is no longer read here.');
    const after = src(
      '// The flag is no longer read here.',
      'export const b = 2;',
      '// The route is no longer live.',
    );

    const found = newFindings(before, after);

    assert.equal(found.length, 1);
    assert.equal(found[0].rule, 'no-history');
  });
});

// =============================================================================
// newFindings — what it lets through
// =============================================================================

describe('newFindings scope', () => {
  test('flags a local function an edit adds', () => {
    const found = newFindings(src(), src('function local(): void {}'));

    assert.deepEqual(
      found.map((f) => f.rule),
      ['exported-jsdoc'],
    );
  });

  test('leaves the same edit alone in a test file', () => {
    const found = newFindings(
      src(),
      src('function local(): void {}'),
      null,
      'src/a.test.ts',
    );

    assert.deepEqual(found, []);
  });
});

describe('newFindings allows', () => {
  test('an untouched violation the file already carried', () => {
    const before = src('// The value is now read from the cache.');
    const after = src(
      '// The value is now read from the cache.',
      'export const b = 2;',
    );

    assert.deepEqual(newFindings(before, after), []);
  });

  test('a violation inside the span that the change did not introduce', () => {
    const stale = '// The value is now read from the cache.';
    const before = src(stale, 'export const b = 2;');
    const after = src(stale, 'export const b = 3;');
    const span = [{ from: 8, to: 10 }];

    assert.deepEqual(newFindings(before, after, span), []);
  });

  test('a clean edit to a file full of debt', () => {
    const before = src(
      '// The value is now read from the cache.',
      '// TODO: sort this out',
      '// We used to call the service directly here, which was slower.',
    );
    const after = `${before}/** C. */\nexport const c = 3;\n`;

    assert.deepEqual(newFindings(before, after), []);
  });

  test('a violation that merely moves within the file', () => {
    const before = src(
      '// The value is now read from the cache.',
      'export const b = 2;',
    );
    const after = src(
      'export const b = 2;',
      '// The value is now read from the cache.',
    );

    assert.deepEqual(newFindings(before, after), []);
  });

  test('a new violation outside the span the edit wrote', () => {
    const before = src('// The value is now read from the cache.');
    const after = src(
      '// The value is now read from the cache.',
      'export const b = 2;',
    );
    const span = [{ from: 1, to: 2 }];

    assert.deepEqual(newFindings(before, after, span), []);
  });
});
