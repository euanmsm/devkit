// ============================================================================
// Postinstall Allowlist
// ============================================================================
//
// Runs install and postinstall scripts for trusted packages while `.npmrc`'s
// `ignore-scripts=true` blocks lifecycle scripts for everyone else.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { loadConfig, repoRoot } from "@litebyte/devkit-core";

const CONFIG_NAME = "postinstall-allowlist.json";
const DEFAULT_TIMEOUT_MS = 300_000;

/**
 * Runs every allowed lifecycle script that has a package installed.
 *
 * @param entries - Allowlist entries, each naming a package and its script
 * @param root - Directory holding `node_modules`
 * @returns One message per failure, empty when every script succeeded
 */
export function run(entries, root) {
	const failures = [];

	for (const { pkg, script, reason, timeout } of entries) {
		if (!existsSync(join(root, "node_modules", pkg))) continue;

		console.log(`  Running ${script} for ${pkg} (${reason})`);

		try {
			execFileSync("npm", ["explore", pkg, "--", "npm", "run", script], {
				cwd: root,
				stdio: "inherit",
				timeout: timeout ?? DEFAULT_TIMEOUT_MS,
			});
		} catch (error) {
			failures.push(`${script} for ${pkg} failed: ${error.message}`);
		}
	}

	return failures;
}

/** Reads the allowlist and runs it, exiting non-zero on any failure. */
export function main() {
	const root = repoRoot();
	const config = loadConfig(CONFIG_NAME, { allowed: [] }, root);
	const entries = config.allowed ?? [];

	if (entries.length === 0) {
		console.log(`No allowlist entries in .devkit/${CONFIG_NAME} — nothing to run.`);
		return;
	}

	const failures = run(entries, root);
	if (failures.length === 0) return;

	console.error("\nPostinstall allowlist failures:");
	for (const f of failures) console.error(`  - ${f}`);
	process.exit(1);
}
