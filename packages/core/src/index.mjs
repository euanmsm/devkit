// ============================================================================
// Devkit Core
// ============================================================================
//
// Finds the consuming repository's root and reads a tool's config file out of
// it. Every devkit tool runs from inside node_modules, so neither can be
// derived from the tool's own location.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * Walks up from a directory to the nearest one holding a `.git` entry.
 *
 * @param start - Directory to search from, defaulting to the process cwd
 * @returns The repository root
 * @throws When no ancestor holds a `.git` entry
 */
export function repoRoot(start = process.cwd()) {
	let dir = resolve(start);

	for (;;) {
		if (existsSync(join(dir, ".git"))) return dir;

		const up = dirname(dir);
		if (up === dir) throw new Error(`No git repository above ${start}`);
		dir = up;
	}
}

/**
 * Reads a tool's JSON config from the repository root.
 *
 * @param name - Config file name, such as `skill-gate.config.json`
 * @param fallback - Value to return when the file is absent
 * @param root - Repository root, defaulting to a discovered one
 * @returns The parsed config, or the fallback
 * @throws When the file exists but does not parse
 */
export function loadConfig(name, fallback = null, root = repoRoot()) {
	const path = join(root, ".devkit", name);
	if (!existsSync(path)) return fallback;

	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch (error) {
		throw new Error(`${path} is not valid JSON — ${error.message}`);
	}
}

/**
 * Compiles a list of regex source strings, skipping any that will not compile.
 *
 * @param patterns - Regex sources from a config file
 * @param flags - Flags applied to every pattern
 * @returns One RegExp per usable pattern
 */
export function compile(patterns = [], flags = "") {
	const out = [];

	for (const p of patterns) {
		try {
			out.push(new RegExp(p, flags));
		} catch (error) {
			process.stderr.write(`devkit: ignoring unusable pattern ${p} — ${error.message}\n`);
		}
	}

	return out;
}
