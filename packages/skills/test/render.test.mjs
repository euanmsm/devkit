// ============================================================================
// Render Tests
// ============================================================================

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { render } from '../src/render.mjs';

describe('render', () => {
  test('fills placeholders', () => {
    assert.equal(render('on {{branch}}', { branch: 'main' }), 'on main');
  });

  test('keeps a # block when its value is present and drops the ^ block', () => {
    const template =
      '{{#rules}}see {{rules}}{{/rules}}{{^rules}}none{{/rules}}';

    assert.equal(render(template, { rules: 'a.md' }), 'see a.md');
  });

  test('drops a # block and keeps the ^ block when the value is empty', () => {
    const template =
      '{{#rules}}see {{rules}}{{/rules}}{{^rules}}none{{/rules}}';

    assert.equal(render(template, { rules: '' }), 'none');
    assert.equal(render(template, { rules: [] }), 'none');
  });

  test('keeps text spanning lines inside a block', () => {
    assert.equal(render('{{#a}}x\ny{{/a}}', { a: 'on' }), 'x\ny');
  });

  test('throws on a placeholder with no value', () => {
    assert.throws(
      () => render('{{missing}}', {}),
      /No value for \{\{missing\}\}/,
    );
  });

  test('throws on a block with no value, rather than dropping it', () => {
    assert.throws(
      () => render('A{{#qaGates}}X{{/qaGates}}B', {}),
      /No value for \{\{#qaGates\}\}/,
    );
    assert.throws(
      () => render('A{{^qaGates}}X{{/qaGates}}B', {}),
      /No value for \{\{\^qaGates\}\}/,
    );
  });

  test('throws when a block tag is left unrendered', () => {
    assert.throws(
      () => render('{{#a}}1{{#b}}x{{/b}}2{{/a}}', { a: true, b: true }),
      /\{\{#b\}\}/,
    );
    assert.throws(() => render('x{{/a}}', { a: true }), /\{\{\/a\}\}/);
  });
});
