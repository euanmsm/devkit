// ============================================================================
// Comment Budget — Tests
// ============================================================================
//
// One pair per implemented rule: a source that breaks it, and a source that
// does not.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { scan, newFindings, governs } from "../src/scanner.mjs";

// =============================================================================
// Fixtures
// =============================================================================

const BAR = "// ============================================================================";
const HEADER = `${BAR}\n// Fixture\n${BAR}`;

const ANCHOR = "export const anchor = 0;";

/** Prefixes JSDoc to any export line not already carrying it, for rule 2. */
function documented(body) {
	const out = [];

	for (const line of body) {
		if (/^export\s/.test(line) && !out.at(-1)?.trim().endsWith("*/")) out.push("/** Fixture. */");
		out.push(line);
	}

	return out;
}

/** Builds a source with a legal header and the given body lines. */
function src(...body) {
	return `${HEADER}\n\n${documented([ANCHOR, "", ...body]).join("\n")}\n`;
}

/** Builds a source long enough for rule 18 to permit a section banner. */
function long(...body) {
	const filler = Array.from({ length: 160 }, (_, i) => `export const p${i} = ${i};`);
	return src(...body, ...filler);
}

/** Rule numbers a source breaks. */
function rules(source) {
	return [...new Set(scan(source).map((f) => f.rule))].sort((a, b) => a - b);
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

describe("governs", () => {
	test("covers every hand-written source extension", () => {
		const paths = [
			"apps/main/src/a.ts",
			"apps/main/src/b.tsx",
			"scripts/ci/c.mjs",
			"scripts/d.cjs",
			"apps/main/eslint.config.mjs",
			"compliance/export.mjs",
			".claude/hooks/comment-gate.mjs",
		];

		for (const path of paths) assert.equal(governs(path), true, path);
	});

	test("skips vendored and generated files", () => {
		const paths = [
			"node_modules/pkg/index.js",
			"apps/main/public/pdfjs/pdf.min.mjs",
			"src/vitest-jest-dom.d.ts",
		];

		for (const path of paths) assert.equal(governs(path), false, path);
	});

	test("skips extensions the contract says nothing about", () => {
		const paths = ["README.md", "supabase/migrations/x.sql", "package.json", "a/b.yml"];

		for (const path of paths) assert.equal(governs(path), false, path);
	});
});

// =============================================================================
// Coverage
// =============================================================================

describe("rule 1 — file header", () => {
	test("flags a file that opens with code", () => {
		breaks(1, "/** Fixture. */\nexport const a = 1;\n");
	});

	test("accepts a `// ====` header", () => {
		passes(src("export const a = 1;"));
	});

	test("accepts a header below an executable script's shebang", () => {
		passes(`#!/usr/bin/env node\n${HEADER}\n\n/** F. */\nexport const a = 1;\n`);
	});

	test("flags a shebang with no header under it", () => {
		breaks(1, "#!/usr/bin/env node\n/** F. */\nexport const a = 1;\n");
	});
});

describe("rule 2 — exported symbols", () => {
	test("flags an export with no JSDoc", () => {
		breaks(2, `${HEADER}\n\nexport const a = 1;\n`);
	});

	test("flags an export carrying only a `//` comment", () => {
		breaks(2, `${HEADER}\n\n// Room id.\nexport const a = 1;\n`);
	});

	test("accepts an export carrying JSDoc", () => {
		passes(`${HEADER}\n\n/** Room id. */\nexport const a = 1;\n`);
	});

	test("ignores a re-export, which binds no new symbol", () => {
		passes(
			`${HEADER}\n\nexport { a } from "./x";\nexport * from "./y";\nexport type { Z } from "./z";\n`,
		);
	});

	test("ignores a default export of an existing binding", () => {
		passes(`${HEADER}\n\n/** Meta. */\nconst meta = 1;\nexport default meta;\n`);
	});
});

describe("rule 3 — property JSDoc", () => {
	test("flags a property with no JSDoc", () => {
		breaks(3, src("export interface P {", "\tname: string;", "}"));
	});

	test("flags a block-form property JSDoc", () => {
		breaks(3, src("export interface P {", "\t/**", "\t * Name.", "\t */", "\tname: string;", "}"));
	});

	test("flags a property JSDoc carrying a second sentence", () => {
		breaks(
			3,
			src("export interface P {", "\t/** Name. Set at creation. */", "\tname: string;", "}"),
		);
	});

	test("accepts a one-line, one-clause property JSDoc", () => {
		passes(src("export interface P {", "\t/** Name of the room. */", "\tname: string;", "}"));
	});

	test("anchors the finding on the property, not the line above it", () => {
		const found = scan(src("export interface P {", "\tname: string;", "}"));

		assert.equal(found[0].line, 10);
	});

	test("accepts the ✓ property docs from 2-examples.md rules 3 and 12", () => {
		passes(
			src(
				"export interface P {",
				"\t/** Application role from the JWT. */",
				"\trole: UserRole;",
				"\t/** Tenant org status, `null` when unreadable. */",
				"\torgStatus: OrgStatus | null;",
				"\t/** Rate limiter for school-admin invites, keyed by org. */",
				"\tinviteLimiter: Limiter;",
				"\t/** Smallest scale the layout may shrink to. */",
				"\tminScale: number;",
				"}",
			),
		);
	});
});

describe("rule 2 — brace counting", () => {
	test("keeps checking exports after a brace inside a string", () => {
		breaks(2, `${HEADER}\n\n/** Open. */\nexport const open = "{";\n\nexport const b = 2;\n`);
	});

	test("keeps checking exports after a brace inside a regex", () => {
		breaks(2, `${HEADER}\n\n/** Open. */\nexport const re = /\\{/;\n\nexport const b = 2;\n`);
	});

	test("keeps checking exports after a brace inside a template literal", () => {
		breaks(2, `${HEADER}\n\n/** Open. */\nexport const t = \`{\`;\n\nexport const b = 2;\n`);
	});

	test("balances a JSX comment, whose braces sit either side of `/* */`", () => {
		breaks(
			2,
			`${HEADER}\n\n/** F. */\nexport const a = <p>{/* Note. */}</p>;\n\nexport const b = 2;\n`,
		);
	});

	test("balances a JSX comment running over two lines", () => {
		breaks(
			2,
			`${HEADER}\n\n/** F. */\nexport const a = <p>{/* Note\n * and more. */}</p>;\n\nexport const b = 2;\n`,
		);
	});

	test("balances a self-closing JSX element after a brace", () => {
		breaks(
			2,
			`${HEADER}\n\n/** F. */\nexport const a = <p>{x && <i n={y} />}</p>;\n\nexport const b = 2;\n`,
		);
	});
});

describe("rule 5 — header cap", () => {
	test("flags a header over eight lines", () => {
		const overview = Array.from({ length: 8 }, (_, i) => `// Line ${i}.`).join("\n");

		breaks(5, `${BAR}\n// Fixture\n${BAR}\n//\n${overview}\n\n/** F. */\nexport const a = 1;\n`);
	});

	test("flags a subsection inside the header", () => {
		breaks(
			5,
			`${BAR}\n// Fixture\n${BAR}\n//\n// Detail\n// ------\n\n/** F. */\nexport const a = 1;\n`,
		);
	});

	test("accepts a header at the cap", () => {
		passes(`${BAR}\n// Fixture\n${BAR}\n//\n// Overview.\n\n/** F. */\nexport const a = 1;\n`);
	});

	test("anchors the cap on the first line past it", () => {
		const overview = Array.from({ length: 8 }, (_, i) => `// Line ${i}.`).join("\n");
		const found = scan(
			`${BAR}\n// Fixture\n${BAR}\n//\n${overview}\n\n/** F. */\nexport const a = 1;\n`,
		);

		assert.equal(found[0].line, 9);
	});

	test("catches a header grown past the cap by an added line", () => {
		const body = "\n/** F. */\nexport const a = 1;\n";
		const overview = (n) => Array.from({ length: n }, (_, i) => `// Line ${i}.`).join("\n");
		const before = `${BAR}\n// Fixture\n${BAR}\n//\n${overview(4)}\n${body}`;
		const after = `${BAR}\n// Fixture\n${BAR}\n//\n${overview(5)}\n${body}`;

		const found = newFindings(before, after, [{ from: 9, to: 9 }]);

		assert.equal(found.length, 1);
		assert.equal(found[0].rule, 5);
	});

	test("does not absorb a comment block sitting below the header", () => {
		const source = `${BAR}\n// Fixture\n${BAR}\n//\n// Overview.\n\n// The regex matches a slug.\n// The regex matches a code.\n\n/** F. */\nexport const a = 1;\n`;

		assert.deepEqual(rules(source), [7]);
	});
});

describe("rule 6 — JSDoc cap", () => {
	test("flags more than four prose lines", () => {
		const prose = Array.from({ length: 5 }, (_, i) => ` * Line ${i}.`).join("\n");

		breaks(6, src("/**", prose, " */", "export const a = 1;"));
	});

	test("flags a tag wrapping onto a second line", () => {
		breaks(
			6,
			src(
				"/**",
				" * Does a thing.",
				" * @param id - The id",
				" * of the room",
				" */",
				"export function f(id) {}",
			),
		);
	});

	test("accepts a summary plus tags", () => {
		passes(
			src(
				"/**",
				" * Does a thing.",
				" *",
				" * @param id - Room id",
				" */",
				"export function f(id) {}",
			),
		);
	});

	test("catches a block grown past the cap by an added line", () => {
		const block = (n) => [
			"/**",
			...Array.from({ length: n }, (_, i) => ` * Line ${i}.`),
			" */",
			"export const a = 1;",
		];
		const before = src(...block(4));
		const after = src(...block(5));

		const found = newFindings(before, after, [{ from: 13, to: 13 }]);

		assert.equal(found.length, 1);
		assert.equal(found[0].rule, 6);
	});
});

describe("rule 7 — logic comment cap", () => {
	test("flags a two-line logic comment", () => {
		breaks(
			7,
			src("// The regex matches a slug.", "// The regex matches a code.", "export const a = 1;"),
		);
	});

	test("accepts a single line", () => {
		passes(src("// The regex matches a slug.", "export const a = 1;"));
	});
});

describe("rule 9 — no history", () => {
	test("flags past tense about the code", () => {
		breaks(9, src("// The value is no longer read here.", "export const a = 1;"));
	});
});

describe("rule 10 — no conversation", () => {
	test("flags a reference to the plan", () => {
		breaks(10, src("// Removed as requested.", "export const a = 1;"));
	});
});

describe("rule 11 — no issue ids", () => {
	test("flags a bare issue code", () => {
		breaks(11, src("// Matches the shape CUR-1234 describes.", "export const a = 1;"));
	});

	test("accepts a live TODO marker", () => {
		passes(src("// TODO(CUR-1234): drop the shim.", "export const a = 1;"));
	});
});

describe("rule 12 — no justification", () => {
	test("flags a rationale clause", () => {
		breaks(12, src("// The list is sorted so that the picker is stable.", "export const a = 1;"));
	});
});

describe("rule 13 — one sentence, one clause, 100 chars", () => {
	test("flags a comment over the character cap", () => {
		breaks(13, src(`// ${"a".repeat(120)}`, "export const a = 1;"));
	});

	test("flags a second sentence", () => {
		breaks(13, src("// Matches a slug. Matches a code.", "export const a = 1;"));
	});
});

describe("rule 15 — no commented-out code", () => {
	test("flags a commented-out statement", () => {
		breaks(15, src("// const b = 2;", "export const a = 1;"));
	});
});

describe("rule 16 — marker form", () => {
	test("flags a bare TODO", () => {
		breaks(16, src("// TODO: sort this out", "export const a = 1;"));
	});

	test("flags a FIXME", () => {
		breaks(16, src("// FIXME: broken", "export const a = 1;"));
	});

	test("accepts `TODO(CUR-1234):`", () => {
		passes(src("// TODO(CUR-1234): drop the shim.", "export const a = 1;"));
	});
});

describe("rule 17 — allowed tags", () => {
	test("flags @example", () => {
		breaks(
			17,
			src("/**", " * Does a thing.", " * @example f(1)", " */", "export function f(id) {}"),
		);
	});

	test("accepts @throws and @deprecated", () => {
		passes(
			src(
				"/**",
				" * Does a thing.",
				" *",
				" * @throws When absent",
				" * @deprecated Use g",
				" */",
				"export function f(id) {}",
			),
		);
	});
});

describe("rule 18 — section banners", () => {
	test("flags a banner in a short file", () => {
		breaks(18, src("export const a = 1;", BAR, "// Section", BAR, "export const b = 2;"));
	});

	test("accepts a banner past 150 lines of code", () => {
		passes(long("export const a = 1;", BAR, "// Section", BAR));
	});
});

// =============================================================================
// Scan options
// =============================================================================

describe("scan output", () => {
	test("findings carry 1-based line numbers", () => {
		const found = scan(src("export const a = 1;", "// The value is no longer read here."));

		assert.equal(found[0].line, 10);
	});

	test("findings come back in line order", () => {
		const found = scan(
			src(
				"// The value is no longer read here.",
				"export const a = 1;",
				"// Removed as requested.",
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

describe("newFindings blocks", () => {
	test("a comment the edit introduces", () => {
		const before = src();
		const after = src("// The value is now read from the cache.");

		const found = newFindings(before, after);

		assert.equal(found.length, 1);
		assert.equal(found[0].rule, 9);
	});

	test("every rule a single comment breaks", () => {
		const after = src(
			"// This is now what we use here, rather than the old approach, because it was previously broken and slow.",
		);

		const rules = newFindings(src(), after).map((f) => f.rule);

		assert.deepEqual(
			[...new Set(rules)].sort((a, b) => a - b),
			[9, 12, 13, 14],
		);
	});

	test("a violation the same violation later in the file would otherwise absorb", () => {
		const stale = "// The value is no longer read here.";
		const before = src("export const b = 2;", stale);
		const after = src(stale, "export const b = 2;", stale);
		const span = [{ from: 8, to: 8 }];

		const found = newFindings(before, after, span);

		assert.equal(found.length, 1);
		assert.equal(found[0].line, 8);
	});

	test("a new file with no header", () => {
		const found = newFindings("", "export const a = 1;\n", null);

		assert.equal(
			found.some((f) => f.rule === 1),
			true,
		);
	});

	test("a second copy of a violation the file already had once", () => {
		const before = src("// The flag is no longer read here.");
		const after = src(
			"// The flag is no longer read here.",
			"export const b = 2;",
			"// The route is no longer live.",
		);

		const found = newFindings(before, after);

		assert.equal(found.length, 1);
		assert.equal(found[0].rule, 9);
	});
});

// =============================================================================
// newFindings — what it lets through
// =============================================================================

describe("newFindings allows", () => {
	test("an untouched violation the file already carried", () => {
		const before = src("// The value is now read from the cache.");
		const after = src("// The value is now read from the cache.", "export const b = 2;");

		assert.deepEqual(newFindings(before, after), []);
	});

	test("a violation inside the span that the change did not introduce", () => {
		const stale = "// The value is now read from the cache.";
		const before = src(stale, "export const b = 2;");
		const after = src(stale, "export const b = 3;");
		const span = [{ from: 8, to: 10 }];

		assert.deepEqual(newFindings(before, after, span), []);
	});

	test("a rule 18 finding whose line count shifts as the file grows", () => {
		const banner = "// ==========================================================================";
		const before = `${HEADER}\n\n/** F. */\nexport const a = 1;\n${banner}\n/** F. */\nexport const b = 2;\n`;
		const padding = Array.from({ length: 40 }, (_, i) => `/** F. */\nexport const p${i} = ${i};`);
		const after = `${HEADER}\n\n/** F. */\nexport const a = 1;\n${banner}\n/** F. */\nexport const b = 2;\n${padding.join("\n")}\n`;

		// The banner is illegal in both, and its message names a line count that moved.
		assert.equal(rules(before).includes(18), true);
		assert.equal(rules(after).includes(18), true);
		assert.deepEqual(newFindings(before, after), []);
	});

	test("a clean edit to a file full of debt", () => {
		const before = src(
			"// The value is now read from the cache.",
			"// TODO: sort this out",
			"// We used to call the service directly here, which was slower.",
		);
		const after = `${before}/** C. */\nexport const c = 3;\n`;

		assert.deepEqual(newFindings(before, after), []);
	});

	test("a violation that merely moves within the file", () => {
		const before = src("// The value is now read from the cache.", "export const b = 2;");
		const after = src("export const b = 2;", "// The value is now read from the cache.");

		assert.deepEqual(newFindings(before, after), []);
	});

	test("a new violation outside the span the edit wrote", () => {
		const before = src("// The value is now read from the cache.");
		const after = src("// The value is now read from the cache.", "export const b = 2;");
		const span = [{ from: 1, to: 2 }];

		assert.deepEqual(newFindings(before, after, span), []);
	});
});
