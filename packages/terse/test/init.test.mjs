// ============================================================================
// Init Tests
// ============================================================================

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { RULES } from '../src/scanner.mjs';
import { template } from '../src/init.mjs';

describe('template', () => {
  test('writes valid JSON', () => {
    assert.doesNotThrow(() => JSON.parse(template()));
  });

  test('lists every rule, so none is discoverable only from a README', () => {
    const written = Object.keys(JSON.parse(template()).rules);

    assert.deepEqual(written.sort(), Object.keys(RULES).sort());
  });

  test('switches every rule on, leaving the repo to turn them off', () => {
    const rules = JSON.parse(template()).rules;

    assert.equal(
      Object.values(rules).every((on) => on === true),
      true,
    );
  });

  test('describes what each rule does beside the switch', () => {
    const about = JSON.parse(template())._rules;

    for (const name of Object.keys(RULES)) {
      assert.match(about[name], new RegExp(`rule ${RULES[name].number}\\)$`));
    }
  });

  test('spells out every cap rather than leaving it to a default', () => {
    const written = JSON.parse(template());

    for (const key of [
      'governed',
      'exclude',
      'headerMax',
      'jsdocProseMax',
      'commentMaxChars',
      'bannerMinCode',
      'sectionBanners',
      'todoPrefix',
      'allowedTags',
      'bans',
    ]) {
      assert.notEqual(written[key], undefined, key);
    }
  });
});
