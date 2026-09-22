// ============================================================================
// Skill Gate Tests
// ============================================================================

import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";

import { loadedSkills, requiredFor } from "../src/gate.mjs";

const MAP = {
	exclude: ["^tmp/", "\\.d\\.ts$"],
	primary: [
		{ pattern: "^src/api/", skills: ["api-routes"] },
		{ pattern: "^src/", skills: ["readability"] },
	],
	universal: [{ pattern: "\\.(tsx?|mjs)$", skills: ["comments"] }],
};

describe("requiredFor", () => {
	test("takes the first matching primary rule, not the broadest", () => {
		assert.deepEqual(requiredFor("src/api/x.ts", MAP), ["api-routes", "comments"]);
	});

	test("adds universal skills on top of the primary one", () => {
		assert.deepEqual(requiredFor("src/x.ts", MAP), ["readability", "comments"]);
	});

	test("requires nothing of an excluded path, however well it matches", () => {
		assert.deepEqual(requiredFor("tmp/x.ts", MAP), []);
		assert.deepEqual(requiredFor("src/x.d.ts", MAP), []);
	});

	test("requires nothing of a path no rule names", () => {
		assert.deepEqual(requiredFor("README.md", MAP), []);
	});

	test("ignores an unusable pattern rather than blocking every edit", () => {
		const broken = { exclude: [], primary: [{ pattern: "(((", skills: ["x"] }], universal: [] };

		assert.deepEqual(requiredFor("src/x.ts", broken), []);
	});
});

describe("loadedSkills", () => {
	test("reads every Skill call out of a transcript", () => {
		const path = join(mkdtempSync(join(tmpdir(), "devkit-")), "t.jsonl");
		writeFileSync(
			path,
			'{"type":"assistant"}\n' +
				'{"content":[{"name":"Skill","input":{"skill":"comments"}}]}\n' +
				'{"content":[{"name":"Skill","input":{"skill":"readability"}}]}\n',
		);

		assert.deepEqual([...loadedSkills(path)].sort(), ["comments", "readability"]);
	});
});
