// ============================================================================
// Review Page Preview Tests
// ============================================================================
//
// The preview builds a page from made-up data for working on the template.
// These keep it building as the page and its fixture change.

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { buildPreview } from '../preview/review-page/preview.mjs';

describe('review-page — preview', () => {
  it('builds a page from the fixture with every note matching its hunk', () => {
    const root = mkdtempSync(join(tmpdir(), 'review-page-preview-'));
    try {
      const warnings = [];
      const warn = console.warn;
      console.warn = (line) => warnings.push(line);
      let result;
      try {
        result = buildPreview({ root });
      } finally {
        console.warn = warn;
      }

      assert.deepEqual(result.problems, []);
      assert.deepEqual(warnings, []);
      assert.deepEqual(result.stats, {
        files: 11,
        hunkNotes: 12,
        walkthroughs: 1,
      });
      const html = readFileSync(result.file, 'utf8');
      assert.match(html, /"branch":"preview\/upload-retries"/);
      assert.match(html, /"pr":\{"number":123/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('adds generated files for a large preview', () => {
    const root = mkdtempSync(join(tmpdir(), 'review-page-preview-'));
    try {
      const result = buildPreview({ root, large: 3 });

      assert.deepEqual(result.problems, []);
      assert.equal(result.stats.files, 14);
      assert.match(
        readFileSync(result.file, 'utf8'),
        /src\/generated\/module003\.ts/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
