// ============================================================================
// Postinstall Allowlist Tests
// ============================================================================

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";

import { run } from "../src/allowlist.mjs";

/** Builds a throwaway root whose node_modules holds one runnable package. */
function fixture(script) {
	const root = mkdtempSync(join(tmpdir(), "devkit-"));
	const pkg = join(root, "node_modules", "fake");
	mkdirSync(pkg, { recursive: true });
	writeFileSync(join(root, "package.json"), '{ "name": "host" }');
	writeFileSync(
		join(pkg, "package.json"),
		JSON.stringify({ name: "fake", version: "1.0.0", scripts: { install: script } }),
	);
	return root;
}

describe("run", () => {
	test("skips an allowlisted package that is not installed", () => {
		const entry = { pkg: "absent", script: "install", reason: "x" };

		assert.deepEqual(run([entry], fixture("exit 0")), []);
	});

	test("runs the script of a package that is installed", () => {
		const entry = { pkg: "fake", script: "install", reason: "x" };

		assert.deepEqual(run([entry], fixture("exit 0")), []);
	});

	test("reports a failing script rather than passing silently", () => {
		const entry = { pkg: "fake", script: "install", reason: "x" };
		const failures = run([entry], fixture("exit 1"));

		assert.equal(failures.length, 1);
		assert.match(failures[0], /^install for fake failed:/);
	});
});
