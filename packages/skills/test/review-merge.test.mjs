// ============================================================================
// Review Merge Options Tests
// ============================================================================
//
// The `dedupe` and `verdicts` options of the code-review config: how findings
// at one spot are merged, and when a split verdict drops a finding.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

import { resolveReviewConfig } from '../src/review/config.mjs';
import { renderEngine } from '../src/sync.mjs';
import { reply, runWorkflow } from './workflow.mjs';

const ENGINE = readFileSync(
  new URL('../templates/code-review/review.workflow.js', import.meta.url),
  'utf8',
);

const DIFF_ARGS = {
  mode: 'diff',
  target: 'feat/x',
  base: 'abc123',
  diffStat: '3 files',
  patchDir: 'tmp/patch',
  largeDiff: false,
  scratchDir: 'tmp/code-reviews',
  branchLeaf: 'x',
  today: '2026-09-26',
  agentCap: 14,
  changedFiles: ['src/a.ts'],
};

/**
 * Resolves a raw review config the way sync does, minus the skill check.
 *
 * @param raw - The config object
 * @returns The resolved config
 */
function resolve(raw) {
  return resolveReviewConfig(raw, {
    name: 'code-review',
    skillsDir: '.claude/skills',
    source: 'test',
  });
}

/**
 * Builds one finding on `src/a.ts` the way a reviewer returns it.
 *
 * @param id - The finding id
 * @param lens - The lens that raised it
 * @param line - The line string
 * @param severity - Its severity
 * @param issue - Its one-line title
 * @returns The finding
 */
function finding(id, lens, line, severity, issue) {
  return {
    id,
    lens,
    file: 'src/a.ts',
    line,
    severity,
    issue,
    detail: 'detail',
    whyItMatters: 'why',
    evidence: 'evidence',
    convention: null,
  };
}

/**
 * Reviews `src/a.ts` with some reviewer findings and verdicts replaced.
 *
 * @param raw - The review config
 * @param findings - Findings by reviewer label, less `review:`; every other reviewer finds nothing
 * @param verdicts - Verdict by finding id, in place of `confirmed`
 * @returns The workflow's result and logs
 */
function review(raw, findings, verdicts = {}) {
  return runWorkflow(renderEngine(ENGINE, resolve(raw)), DIFF_ARGS, {
    reply: (label, prompt) => {
      const canned = reply(label, prompt);
      const bundle = label.replace(/^review:/, '');

      if (label.startsWith('review:')) {
        return { ...canned, findings: findings[bundle] ?? [] };
      }
      if (label.startsWith('verify:')) {
        return {
          verdicts: canned.verdicts.map((one) =>
            verdicts[one.id]
              ? { ...one, verdict: verdicts[one.id], reasoning: 'no' }
              : one,
          ),
        };
      }
      return canned;
    },
  });
}

// Two lenses in two bundles, two lines apart, and one further away.
const SAME_SPOT = {
  'correctness-1': [finding('bugs-a', 'bugs', '40', 'high', 'Null deref')],
  security: [
    finding('sec-a', 'security', '42', 'critical', 'Unchecked input'),
    finding('sec-b', 'security', '50', 'low', 'Log noise'),
  ],
};

describe('review config — dedupe and verdicts', () => {
  test('default to merging by location and dropping only when every verifier refutes', () => {
    const { dedupe, verdicts } = resolve({});
    assert.deepEqual(dedupe, { by: 'location', lines: 2 });
    assert.equal(verdicts, 'all-refute');
  });

  test('take location merging, a line slack and any-refutes', () => {
    const resolved = resolve({
      dedupe: { by: 'location', lines: 0 },
      verdicts: 'any-refutes',
    });
    assert.deepEqual(resolved.dedupe, { by: 'location', lines: 0 });
    assert.equal(resolved.verdicts, 'any-refutes');
  });

  test('refuse an unknown mode, key or slack', () => {
    assert.throws(() => resolve({ dedupe: { by: 'file' } }), /dedupe\.by/);
    assert.throws(() => resolve({ dedupe: { lens: true } }), /unknown key/);
    assert.throws(() => resolve({ dedupe: { lines: -1 } }), /dedupe\.lines/);
    assert.throws(() => resolve({ dedupe: { lines: 1.5 } }), /dedupe\.lines/);
    assert.throws(
      () => resolve({ dedupe: 'lens' }),
      /dedupe must be an object/,
    );
    assert.throws(() => resolve({ verdicts: 'majority' }), /verdicts must be/);
  });
});

describe('review workflow — merging by location', () => {
  test('keeps findings from different lenses apart when merging by lens', async () => {
    const { result } = await review({ dedupe: { by: 'lens' } }, SAME_SPOT);
    assert.equal(result.stats.twins, 0);
    assert.match(result.markdown, /### \d+ — Null deref/);
    assert.match(result.markdown, /### \d+ — Unchecked input/);
  });

  test('merges any lens within the slack by default, showing the most severe and every lens', async () => {
    const { result, logs } = await review({}, SAME_SPOT);

    assert.equal(result.stats.twins, 1);
    assert.match(result.markdown, /### \d+ — Unchecked input/);
    assert.doesNotMatch(result.markdown, /— Null deref/);
    assert.match(result.markdown, /\*\*Lenses:\*\* security, bugs/);
    // A low finding is a row in its section's table, not a full write-up.
    assert.match(
      result.markdown,
      /\| <a id="f\d+"><\/a>\d+ \| L \| Log noise \|/,
    );
    assert.ok(logs.some((line) => /1 same-spot twin/.test(line)));
  });

  test('uses the configured slack', async () => {
    const { result } = await review(
      { dedupe: { by: 'location', lines: 0 } },
      SAME_SPOT,
    );
    assert.equal(result.stats.twins, 0);
  });
});

describe('review workflow — any-refutes', () => {
  const twins = {
    'correctness-1': [
      finding('bugs-a', 'bugs', '42', 'critical', 'Null deref'),
    ],
    security: [finding('bugs-b', 'bugs', '42', 'low', 'Null deref, maybe')],
  };

  test('drops a merged finding when one verifier refutes it', async () => {
    const { result, logs } = await review({ verdicts: 'any-refutes' }, twins, {
      'bugs-b': 'refuted',
    });

    assert.equal(result.stats.critical, 0);
    assert.equal(result.stats.refuted, 1);
    assert.match(
      result.markdown,
      /## Refuted and dropped\n\n- \*\*Null deref, maybe\*\*.*Split verdict/,
    );
    assert.ok(
      logs.some((line) => /dropped if any verifier refuted it/.test(line)),
    );
  });

  test('keeps it when no verifier refutes it', async () => {
    const { result } = await review({ verdicts: 'any-refutes' }, twins);
    assert.equal(result.stats.critical, 1);
    assert.equal(result.stats.refuted, 0);
  });
});
