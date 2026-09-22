// ============================================================================
// Skill Gate
// ============================================================================
//
// PreToolUse hook on Edit and Write. Blocks the edit until the file's required
// convention skills have been loaded this session. Fails open on any error.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative } from "node:path";

import { compile, loadConfig, repoRoot } from "@euanmsm/devkit-core";

const CONFIG_NAME = "skill-map.json";

/** Anything other than an explicit deny lets the tool call through. */
function allow() {
	process.exit(0);
}

/** Blocks the tool call, showing the agent which skills to load. */
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

/**
 * Locates the session transcript the hook payload belongs to.
 *
 * @param input - The hook payload
 * @returns Path to the transcript, or null when it cannot be found
 */
export function findTranscript(input) {
	if (input.transcript_path && existsSync(input.transcript_path)) return input.transcript_path;

	const projects = join(homedir(), ".claude", "projects");
	if (!input.session_id || !existsSync(projects)) return null;

	for (const dir of readdirSync(projects)) {
		const candidate = join(projects, dir, `${input.session_id}.jsonl`);
		if (existsSync(candidate)) return candidate;
	}

	return null;
}

/**
 * Reads every skill loaded in a transcript.
 *
 * @param transcriptPath - Path to the session's JSONL transcript
 * @returns Skill names, one per Skill tool call
 */
export function loadedSkills(transcriptPath) {
	const raw = readFileSync(transcriptPath, "utf8");
	const skills = new Set();

	for (const match of raw.matchAll(/"name":"Skill","input":\{"skill":"([^"]+)"/g)) {
		skills.add(match[1]);
	}

	return skills;
}

/**
 * Names the skills a path requires.
 *
 * @param rel - Repo-relative path of the edited file
 * @param map - Parsed skill map
 * @returns Required skill names, empty when the path is ungoverned
 */
export function requiredFor(rel, map) {
	if (compile(map.exclude).some((p) => p.test(rel))) return [];

	const required = new Set();

	// First match wins, so the map lists the most specific pattern first.
	const hit = (map.primary ?? []).find((rule) => matches(rule.pattern, rel));
	if (hit) hit.skills.forEach((s) => required.add(s));

	for (const rule of map.universal ?? []) {
		if (matches(rule.pattern, rel)) rule.skills.forEach((s) => required.add(s));
	}

	return [...required];
}

/** True when a pattern compiles and matches, false when it does neither. */
function matches(pattern, rel) {
	return compile([pattern]).some((p) => p.test(rel));
}

/** Reads the hook payload and denies when a required skill is missing. */
export function main() {
	if (process.env.SKILL_GATE === "off") allow();

	const input = JSON.parse(readFileSync(0, "utf8"));
	const filePath = input?.tool_input?.file_path;
	if (!filePath) allow();

	const root = repoRoot();
	const rel = relative(root, filePath);

	// A file in another checkout is not this repo's to govern.
	if (rel.startsWith("..")) allow();

	const map = loadConfig(CONFIG_NAME, null, root);
	if (!map) allow();

	const required = requiredFor(rel, map);
	if (required.length === 0) allow();

	const transcript = findTranscript(input);
	if (!transcript) allow();

	const loaded = loadedSkills(transcript);
	const missing = required.filter((s) => !loaded.has(s));
	if (missing.length === 0) allow();

	const calls = missing.map((s) => `  Skill(skill: "${s}")`).join("\n");

	deny(
		`BLOCKED — ${rel} is governed by convention skills you have not loaded this session.\n\n` +
			`Load them, then make this edit again:\n${calls}\n\n` +
			`These skills hold the conventions this file must follow. Do not work around this by ` +
			`writing from memory. The mapping lives in .devkit/${CONFIG_NAME}.`,
	);
}
