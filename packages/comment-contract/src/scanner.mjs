// ============================================================================
// Comment Budget
// ============================================================================
//
// Checks every governed source file against the comment contract. Caps, banned
// phrases and scope all come from .devkit/comment-contract.json. Findings carry
// the rule number they break.

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { compile, loadConfig } from "@litebyte/devkit-core";

// ============================================================================
// Config
// ============================================================================

const DEFAULTS = {
	governed: "\\.(tsx?|mjs|cjs|js)$",
	exclude: ["(^|/)node_modules/", "\\.min\\.[cm]?js$", "\\.d\\.ts$"],
	headerMax: 8,
	jsdocProseMax: 4,
	commentMaxChars: 100,
	bannerMinCode: 150,
	todoPrefix: "[A-Z]{2,}",
	rulesDoc: "",
	examplesDoc: "",
	bans: [
		{
			rule: 9,
			label: "history",
			pattern:
				"\\b(previously|used to|no longer|now that|was originally|is now|has been (renamed|moved|replaced|removed))\\b",
		},
		{
			rule: 10,
			label: "conversation",
			pattern: "\\b(as requested|per the plan|as discussed|this wave|we decided|phase \\d)\\b",
		},
		{ rule: 11, label: "issue id", pattern: "\\b[A-Z]{2,}-\\d+\\b", flags: "" },
		{
			rule: 12,
			label: "justification or consequence",
			pattern:
				"\\b(so that|rather than|which is what|the reason|deliberately|on purpose|prevents|defaults to|falls back)\\b",
		},
		{ rule: 14, label: "first or second person", pattern: "\\b(we|our|ours|us|you|your)\\b" },
	],
};

export const config = { ...DEFAULTS, ...(loadConfig("comment-contract.json", {}) ?? {}) };

// ============================================================================
// Scope
// ============================================================================

const GOVERNED = new RegExp(config.governed);
const EXCLUDED = compile(config.exclude);

/**
 * True when the contract governs a file.
 *
 * @param path - Repo-relative path
 * @returns Whether the file is hand-written source the rules cover
 */
export function governs(path) {
	return GOVERNED.test(path) && !EXCLUDED.some((p) => p.test(path));
}

// ============================================================================
// Rules
// ============================================================================

const HEADER_MAX = config.headerMax;
const JSDOC_PROSE_MAX = config.jsdocProseMax;
const COMMENT_MAX_CHARS = config.commentMaxChars;
const BANNER_MIN_CODE = config.bannerMinCode;

const TODO_FORM = new RegExp(`\\bTODO\\(${config.todoPrefix}-\\d+\\):`);
const TODO_EXAMPLE = `TODO(${config.todoPrefix === "[A-Z]{2,}" ? "ABC" : config.todoPrefix}-1234): one line`;

const BANS = config.bans.map((ban) => ({
	rule: ban.rule,
	label: ban.label,
	re: new RegExp(ban.pattern, ban.flags ?? "i"),
}));

// The trailing identifier class excludes a re-export's `{`.
const EXPORTED =
	/^export\s+(?:default\s+)?(?:async\s+)?(?:abstract\s+)?(?:const|let|var|function|class|interface|type|enum)\s+[A-Za-z_$]/;

const ALLOWED_TAGS = new Set(["@param", "@returns", "@throws", "@deprecated"]);
const CODE_SHAPE =
	/^(import |export |const |let |var |return |await |if \(|for \(|\w+\.\w+\(|\}|\{)/;
const DECLARATION = /^(export\s+)?(interface\s+\w+|type\s+\w+(<[^>]*>)?\s*=)/;
const PROPERTY = /^(readonly\s+)?[\w"'`]+\??\s*:/;

// ============================================================================
// Helpers
// ============================================================================

// ======== Text ==============================================================

/** Strips the leading comment marker from a line. */
function body(line) {
	return line
		.trim()
		.replace(/^\/\/+\s?/, "")
		.replace(/^\/?\*+\/?\s?/, "")
		.replace(/\s*\*\/$/, "")
		.trim();
}

/** True when a line opens or closes a `// ====` banner rule. */
function isBannerRule(line) {
	return /^\s*\/\/\s*[=-]{5,}\s*$/.test(line);
}

/** Counts lines that are neither blank nor a comment. */
function codeLineCount(lines) {
	return lines.filter((l) => l.trim() && !/^\s*(\/\/|\*|\/\*)/.test(l.trim())).length;
}

// ======== Braces ============================================================

// A `/` opens a regex only where a value may start, and never after JSX's `<`.
const REGEX_OPENS_AFTER = new Set([
	"",
	"=",
	"(",
	",",
	":",
	"[",
	"!",
	"&",
	"|",
	"?",
	"{",
	"}",
	";",
	"+",
	"-",
	"%",
	">",
]);

/**
 * Counts a line's braces, ignoring any inside a string, template or regex.
 *
 * @param line - One raw source line
 * @returns `{ open, close }` brace counts
 */
function braceCounts(line) {
	let open = 0;
	let close = 0;
	let prev = "";

	for (let i = 0; i < line.length; i++) {
		const c = line[i];

		if (c === "/" && line[i + 1] === "/") break;

		// A JSX comment closes on its own line, between the braces of `{/* … */}`.
		if (c === "/" && line[i + 1] === "*") {
			const close = line.indexOf("*/", i + 2);
			if (close === -1) break;
			i = close + 1;
			continue;
		}

		// `/>` closes a JSX element; a regex matching `>` alone is not worth the miss.
		const opensRegex = c === "/" && line[i + 1] !== ">" && REGEX_OPENS_AFTER.has(prev);

		if (c === '"' || c === "'" || c === "`" || opensRegex) {
			i = closingDelimiter(line, i, c);
			prev = c;
			continue;
		}

		if (c === "{") open++;
		else if (c === "}") close++;
		if (c.trim()) prev = c;
	}

	return { open, close };
}

/** Index of a literal's closing delimiter, or the line's end when unterminated. */
function closingDelimiter(line, start, delimiter) {
	for (let i = start + 1; i < line.length; i++) {
		if (line[i] === "\\") i++;
		else if (line[i] === delimiter) return i;
	}

	return line.length;
}

// ======== Findings ==========================================================

/** Builds one finding against a numbered rule. */
function finding(rule, line, message) {
	return { rule, line, message };
}

// ============================================================================
// Checks
// ============================================================================

// ======== File header =======================================================

/**
 * Checks rules 1 and 5 — a header exists, is capped, and has no subsections.
 *
 * @param lines - Every line of the file
 * @returns `{ findings, next }`, where `next` is the line the body starts on
 */
function checkHeader(lines) {
	// An executable script opens with `#!`, and the header follows it.
	const top = lines[0]?.startsWith("#!") ? 1 : 0;

	if (!lines[top]?.startsWith("//"))
		return { findings: [finding(1, top + 1, "No `// ====` file header.")], next: top };

	let end = top;
	while (end + 1 < lines.length && lines[end + 1].startsWith("//")) end++;

	const header = lines.slice(top, end + 1);
	const findings = [];

	// Anchoring past the cap keeps the finding inside the span that grew the header.
	if (header.length > HEADER_MAX)
		findings.push(
			finding(
				5,
				top + HEADER_MAX + 1,
				`File header is ${header.length} lines, cap is ${HEADER_MAX}.`,
			),
		);

	const underline = header.findIndex((l, n) => n > 3 && /^\/\/\s*-{4,}\s*$/.test(l));
	if (underline !== -1)
		findings.push(
			finding(5, top + underline + 1, "File header has a subsection. Subsections are banned."),
		);

	for (const [n, line] of header.entries())
		if (!isBannerRule(line))
			findings.push(...checkContent(body(line), top + n + 1, { prose: false }));

	return { findings, next: end + 1 };
}

// ======== Comment content ===================================================

/**
 * Checks rules 9 to 14 and 16 on one comment line.
 *
 * @param text - The comment's text, marker already stripped
 * @param lineNo - Line the comment sits on, 1-based
 * @param options - `prose` skips rule 13, which rule 5 already covers in a header
 * @returns Findings the line breaks
 */
function checkContent(text, lineNo, options = {}) {
	if (!text) return [];

	const { prose = true } = options;
	const out = [];

	if (/\b(TODO|FIXME|XXX|HACK)\b/.test(text)) {
		if (!TODO_FORM.test(text)) out.push(finding(16, lineNo, `Marker must be \`${TODO_EXAMPLE}\`.`));
		return out;
	}

	if (prose && text.length > COMMENT_MAX_CHARS)
		out.push(finding(13, lineNo, `Comment is ${text.length} chars, cap is ${COMMENT_MAX_CHARS}.`));

	if (prose && /\.\s+\S/.test(text))
		out.push(finding(13, lineNo, "More than one sentence. One clause only."));

	for (const ban of BANS)
		if (ban.re.test(text)) out.push(finding(ban.rule, lineNo, `Comment mentions ${ban.label}.`));

	return out;
}

// ======== JSDoc =============================================================

/** Checks rules 6 and 17 on one JSDoc block. */
function checkJsdoc(lines, start, end) {
	const out = [];
	let prose = 0;
	let capLine = start + 1;
	let openTag = null;

	for (let n = start; n <= end; n++) {
		const text = body(lines[n]);
		const tag = /^(@\w+)/.exec(text);

		if (tag) {
			openTag = tag[1];
			if (!ALLOWED_TAGS.has(openTag))
				out.push(finding(17, n + 1, `\`${openTag}\` is not an allowed tag.`));
			continue;
		}

		if (openTag && text) {
			out.push(finding(6, n + 1, `\`${openTag}\` wraps onto a second line.`));
			continue;
		}

		openTag = null;
		if (text) {
			prose++;
			if (prose === JSDOC_PROSE_MAX + 1) capLine = n + 1;
		}
		out.push(...checkContent(text, n + 1));
	}

	// Anchoring past the cap keeps the finding inside the span that grew the block.
	if (prose > JSDOC_PROSE_MAX)
		out.push(finding(6, capLine, `JSDoc has ${prose} prose lines, cap is ${JSDOC_PROSE_MAX}.`));

	return out;
}

// ======== Exports ===========================================================

/** Checks rule 2 — every exported declaration carries JSDoc. */
function checkExport(lines, n) {
	for (let i = n - 1; i >= 0; i--) {
		if (!lines[i].trim()) continue;
		if (lines[i].trim().endsWith("*/")) return [];
		break;
	}

	return [finding(2, n + 1, "Exported symbol has no JSDoc.")];
}

// ======== Properties ========================================================

/** Checks rule 3 — every property carries a one-line, one-clause JSDoc. */
function checkProperty(lines, n) {
	const prev = lines[n - 1]?.trim() ?? "";

	if (/^\/\*\*.*\*\/$/.test(prev)) {
		if (/\.\s+\S/.test(body(prev)))
			return [finding(3, n + 1, "Property JSDoc has a second sentence.")];
		return [];
	}

	if (prev.endsWith("*/"))
		return [finding(3, n + 1, "Property JSDoc must be the single-line `/** … */` form.")];

	return [finding(3, n + 1, "Property has no JSDoc.")];
}

// ============================================================================
// Main Export
// ============================================================================

/**
 * Scans one source file for comment-contract violations.
 *
 * @param source - File contents, or the incoming text of an edit
 * @returns Findings, each naming the rule number it breaks
 */
export function scan(source) {
	const lines = source.split("\n");
	const header = checkHeader(lines);

	const out = [...header.findings];
	const start = header.next;
	const code = codeLineCount(lines);

	let inBlock = false;
	let blockStart = 0;
	let isDoc = false;
	let run = 0;
	let runStart = 0;
	let depth = 0;
	let declDepth = null;

	for (let n = start; n < lines.length; n++) {
		const raw = lines[n];
		const trimmed = raw.trim();

		if (!inBlock && trimmed.startsWith("/*")) {
			inBlock = true;
			blockStart = n;
			isDoc = trimmed.startsWith("/**");
		}
		if (inBlock) {
			if (trimmed.includes("*/")) {
				inBlock = false;
				// A single-line block is a property doc, checked by rule 3 instead.
				if (isDoc && n > blockStart) out.push(...checkJsdoc(lines, blockStart, n));
			}
			continue;
		}

		if (isBannerRule(raw)) {
			if (code < BANNER_MIN_CODE && n > start)
				out.push(
					finding(
						18,
						n + 1,
						`Section banner in a ${code}-line file, minimum is ${BANNER_MIN_CODE}.`,
					),
				);
			continue;
		}

		if (trimmed.startsWith("//")) {
			const text = body(raw);
			if (CODE_SHAPE.test(text)) out.push(finding(15, n + 1, "Commented-out code."));
			else out.push(...checkContent(text, n + 1));

			if (run === 0) runStart = n;
			run++;
			continue;
		}

		if (run > 1) out.push(finding(7, runStart + 1, `Logic comment runs ${run} lines, cap is 1.`));
		run = 0;

		if (depth === 0 && EXPORTED.test(trimmed)) out.push(...checkExport(lines, n));

		const { open, close } = braceCounts(raw);

		if (declDepth === null && DECLARATION.test(trimmed) && open) declDepth = depth;
		else if (declDepth !== null && depth + open - close <= declDepth) declDepth = null;
		else if (declDepth !== null && depth === declDepth + 1 && PROPERTY.test(trimmed))
			out.push(...checkProperty(lines, n));

		// Clamping stops one miscounted line disabling rule 2 for the rest of the file.
		depth = Math.max(0, depth + open - close);
	}

	return out.sort((a, b) => a.line - b.line);
}

// ============================================================================
// Comparing two versions
// ============================================================================

// Digits are stripped: a message can name the file's code-line count.
function key(f) {
	return `${f.rule}|${f.message.replace(/\d+/g, "#")}`;
}

/**
 * Finds violations one version introduces, ignoring those the other already had.
 *
 * @param before - File contents beforehand, empty for a new file
 * @param after - File contents afterwards
 * @param span - Lines the change wrote, or null for the whole file
 * @returns Findings surplus to `before` and inside `span`
 */
export function newFindings(before, after, span) {
	// An absent file scans as a missing header, which a new file must not inherit.
	const counts = new Map();
	for (const f of before ? scan(before) : []) counts.set(key(f), (counts.get(key(f)) ?? 0) + 1);

	const inSpan = (f) => !span || span.some((r) => f.line >= r.from && f.line <= r.to);
	const found = scan(after);

	// Untouched findings match first, leaving the newly written one exposed.
	for (const f of found.filter((f) => !inSpan(f))) {
		const remaining = counts.get(key(f)) ?? 0;
		if (remaining > 0) counts.set(key(f), remaining - 1);
	}

	const out = [];

	for (const f of found.filter(inSpan)) {
		const remaining = counts.get(key(f)) ?? 0;
		if (remaining > 0) {
			counts.set(key(f), remaining - 1);
			continue;
		}
		out.push(f);
	}

	return out;
}

// ============================================================================
// CLI
// ============================================================================

/** Lists the files to scan, from argv or the whole tree. */
function targets(args) {
	if (args.length) return args;
	return execSync("git ls-files", { encoding: "utf8", maxBuffer: 1 << 28 })
		.trim()
		.split("\n")
		.filter(governs);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const files = targets(process.argv.slice(2));
	let total = 0;

	let unreadable = 0;

	for (const file of files) {
		let source;
		// One bad path must not suppress the findings for every file after it.
		try {
			source = readFileSync(file, "utf8");
		} catch (error) {
			console.error(`${file}  could not be read — ${error.message}`);
			unreadable++;
			continue;
		}

		const found = scan(source);
		total += found.length;
		for (const f of found) console.log(`${file}:${f.line}  [rule ${f.rule}]  ${f.message}`);
	}

	console.log(`\n${total} finding(s) across ${files.length} file(s).`);
	process.exit(total > 0 || unreadable > 0 ? 1 : 0);
}
