// ============================================================================
// Workflow Harness Tests
// ============================================================================
//
// Checks the harness holds scripts to the Workflow tool's rules, so the
// workflow tests run under the same rules as the real tool.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { runWorkflow, schemaProblem } from './workflow.mjs';

const META = "export const meta = { name: 'test', phases: [{ title: 'A' }] };";
const OBJECT = { type: 'object', properties: {} };

/**
 * Runs a script body under the harness with a sound meta.
 *
 * @param body - The script after its meta
 * @param reply - The canned reply builder
 * @returns What `runWorkflow` returns
 */
const run = (body, reply = () => ({})) =>
  runWorkflow(`${META}\n${body}`, {}, { reply });

describe('workflow harness — parallel and pipeline', () => {
  it('resolves a throwing thunk to null and keeps the others', async () => {
    const { result } = await run(
      `
      return parallel([
        () => 1,
        () => { throw new Error('boom'); },
        () => agent('p', { label: 'bad', schema: ${JSON.stringify(OBJECT)} }),
      ]);
    `,
      (label) => {
        if (label === 'bad') throw new Error('agent failed');
        return {};
      },
    );

    assert.deepEqual(result, [1, null, null]);
  });

  it('drops an item to null at a throwing stage and skips its later stages', async () => {
    const { result, logs } = await run(`
      return pipeline(
        [1, 2, 3],
        (n) => { if (n === 2) throw new Error('boom'); return n * 10; },
        (n) => { log('second ' + n); return n + 1; },
      );
    `);

    assert.deepEqual(result, [11, null, 31]);
    assert.deepEqual(logs, ['second 10', 'second 30']);
  });
});

describe('workflow harness — clock and randomness', () => {
  for (const [what, call] of [
    ['Date.now()', 'Date.now()'],
    ['Math.random()', 'Math.random()'],
    ['argless new Date()', 'new Date()'],
  ]) {
    it(`fails a run that calls ${what}`, async () => {
      await assert.rejects(run(`return ${call};`), /workflow/);
    });
  }

  it('fails the run even when parallel swallowed the call', async () => {
    await assert.rejects(
      run('return parallel([() => Date.now()]);'),
      /Date\.now\(\)/,
    );
  });

  it('still builds a date from an explicit value', async () => {
    const { result } = await run(
      "return new Date('2026-01-02T00:00:00Z').getUTCDate() + Math.max(1, 2);",
    );
    assert.equal(result, 4);
  });
});

describe('workflow harness — schemas', () => {
  it('accepts a sound nested schema', () => {
    assert.equal(
      schemaProblem({
        type: 'object',
        required: ['items'],
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id'],
              properties: { id: { type: 'string' } },
            },
          },
        },
      }),
      null,
    );
  });

  it('rejects a root that is not an object', () => {
    assert.match(schemaProblem({ type: 'array' }), /root/);
  });

  it('rejects a required field missing from properties, at any depth', () => {
    assert.match(
      schemaProblem({ type: 'object', required: ['a'], properties: {} }),
      /"a"/,
    );
    assert.match(
      schemaProblem({
        type: 'object',
        properties: {
          list: {
            type: 'array',
            items: { type: 'object', required: ['id'], properties: {} },
          },
        },
      }),
      /schema\.list\[\] requires "id"/,
    );
  });

  it('fails the run when an agent gets a bad schema inside parallel', async () => {
    await assert.rejects(
      run(`
        return parallel([
          () => agent('p', { label: 'x', schema: { type: 'object', required: ['a'] } }),
        ]);
      `),
      /x: schema requires "a"/,
    );
  });
});

describe('workflow harness — meta', () => {
  it('accepts a literal meta with comments and plain templates', async () => {
    const source = `export const meta = {
      // A comment
      name: \`test\`,
      count: -1,
      on: true,
      phases: [{ title: "A" }],
    };
    return 1;`;
    assert.equal((await runWorkflow(source, {})).result, 1);
  });

  for (const [what, meta] of [
    ['a variable', '{ name: NAME }'],
    ['a call', "{ name: String('x') }"],
    ['a spread', '{ ...BASE }'],
    ['an interpolated template', '{ name: `a${1}` }'],
    ['a shorthand property', '{ name }'],
    ['a bare variable', 'META'],
  ]) {
    it(`rejects a meta with ${what}`, async () => {
      await assert.rejects(
        runWorkflow(`export const meta = ${meta};\nreturn 1;`, {}),
        /pure literal/,
      );
    });
  }
});
