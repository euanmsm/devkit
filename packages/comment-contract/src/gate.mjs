#!/usr/bin/env node
// ============================================================================
// Comment Gate
// ============================================================================
//
// PreToolUse hook on Edit and Write. Denies an edit introducing a comment that
// breaks the mechanical half of the comment contract.

import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative } from "node:path";

import { repoRoot } from "@euanmsm/devkit-core";

// A dynamic import keeps a broken config inside this file's own fail-open path.
let contract = null;
try {
	contract = await import("./scanner.mjs");
} catch (error) {
	process.stderr.write(`comment-gate: no scanner, every edit allowed — ${error.message}\n`);
}

/** Lets the tool call through. */
function allow() {
	process.exit(0);
}

/** Blocks the tool call, showing the agent what to fix. */
function deny(reason) {
	process.stdout.write(
		JSON.stringify({
			hookSpecificOutput: {
				hookEventName: "PreToolUse",
				permissionDecision: "deny",
				permissionDecisionReason: reason,
			},
		}),
	);
	process.exit(0);
}

/** Line number, 1-based, of a character offset in a source. */
function lineAt(source, offset) {
	let line = 1;
	for (let i = 0; i < offset && i < source.length; i++) if (source[i] === "\n") line++;
	return line;
}

/**
 * Builds the text a tool call would leave on disk, plus the lines it writes.
 *
 * @param source - File contents before the call, empty for a new file
 * @param toolInput - The hook payload's `tool_input`
 * @returns `{ after, span }`, where a null span means the whole file
 */
export function applyEdit(source, toolInput) {
	const { content, old_string: before, new_string: after, replace_all: all } = toolInput;

	if (typeof content === "string") return { after: content, span: null };
	if (typeof before !== "string" || typeof after !== "string") return null;

	// String.replace expands a `$&` or `$1` appearing inside a comment.
	if (all) {
		if (!source.includes(before)) return null;
		return { after: source.split(before).join(after), span: null };
	}

	const start = source.indexOf(before);
	if (start === -1) return null;

	const text = source.slice(0, start) + after + source.slice(start + before.length);

	return {
		after: text,
		span: [{ from: lineAt(text, start), to: lineAt(text, start + after.length) }],
	};
}

/**
 * Builds the deny reason for a set of findings.
 *
 * @param findings - Violations the edit introduces
 * @param path - Repo-relative path of the edited file
 * @returns The message the agent reads
 */
export function format(findings, path, docs = {}) {
	const count = findings.length;
	const lines = findings.map((f) => `  line ${f.line}  [rule ${f.rule}]  ${f.message}`);
	const pointers = [
		docs.rulesDoc && `The rules are in ${docs.rulesDoc}`,
		docs.examplesDoc && `Paired examples are in ${docs.examplesDoc}`,
	].filter(Boolean);

	return (
		`BLOCKED — ${path}\n\n` +
		`This edit introduces ${count} comment-contract violation${count === 1 ? "" : "s"}:\n\n` +
		`${lines.join("\n")}\n\n` +
		`Fix or remove them, then make the edit again. Deleting a comment is often the ` +
		`right fix — the contract makes \`//\` comments exception-only.` +
		(pointers.length ? `\n\n${pointers.join("\n")}` : "")
	);
}

/** Reads the hook payload and denies when the edit adds a violation. */
export function main() {
	if (process.env.COMMENT_GATE === "off") allow();
	if (!contract) allow();

	const input = JSON.parse(readFileSync(0, "utf8"));
	const filePath = input?.tool_input?.file_path;
	if (!filePath) allow();

	// A file in another checkout is not this repo's to judge.
	const rel = relative(repoRoot(), filePath);
	if (rel.startsWith("..") || isAbsolute(rel)) allow();
	if (!contract.governs(rel)) allow();

	const source = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
	const edit = applyEdit(source, input.tool_input);
	if (!edit) allow();

	const found = contract.newFindings(source, edit.after, edit.span);
	if (found.length === 0) allow();

	deny(format(found, rel, contract.config));
}
