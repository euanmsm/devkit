// ============================================================================
// PR Workflow Engine Tests
// ============================================================================
//
// Runs the generated pr-qa workflow for both fixtures with canned agents, and
// checks what runs, in what order, on which model, and what it assembles.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  prArgs,
  prReplies,
  prWorkflow,
  promptEntries,
  promptUnits,
} from './pr-helpers.mjs';
import { runWorkflow } from './workflow.mjs';

const labels = (calls) => calls.map((call) => call.label);
const find = (calls, label) => calls.find((call) => call.label === label);
const unitNames = (call) => promptUnits(call.prompt).map((unit) => unit.name);

describe('pr workflow — what runs', () => {
  it('writes only a summary when no section is touched', async () => {
    const source = await prWorkflow('curricular');
    const { result, calls } = await runWorkflow(source, prArgs({}), {
      reply: prReplies(),
    });

    assert.deepEqual(labels(calls), ['summary']);
    assert.equal(calls[0].model, 'sonnet');
    assert.equal(result.summary, 'Adds the thing.');
    assert.match(
      result.checklist,
      /^_No manual checks needed — no runtime surface touched\._\n\n---\n\n### Local CI\n\n- \[ \] Review agents/,
    );
    assert.deepEqual(result.unresolved, []);
  });

  it('runs every stage for a branch touching the backend and frontend', async () => {
    const source = await prWorkflow('curricular');
    const { calls } = await runWorkflow(
      source,
      prArgs({ backend: true, frontend: true }),
      { reply: prReplies() },
    );
    const names = labels(calls);

    for (const label of [
      'draft:summary',
      'surfaces:frontend',
      'context-pack',
      'draft:boot',
      'inventory:backend',
      'inventory:frontend',
      'inventory:cross-cutting',
      'audit:hunks',
      'audit:dimensions',
      'draft:backend',
      'draft:frontend',
      'verify:backend',
      'verify:frontend',
      'verify:boot',
    ]) {
      assert.ok(names.includes(label), `${label} ran`);
    }
    // One checker per group: three backend entries plus the cross-cutting one.
    assert.equal(names.filter((n) => n.startsWith('verify:')).length, 3);
    assert.equal(unitNames(find(calls, 'verify:backend')).length, 4);
    assert.equal(unitNames(find(calls, 'verify:frontend')).length, 2);
  });

  it('accepts args handed over as a JSON string', async () => {
    const source = await prWorkflow('curricular');
    const { result } = await runWorkflow(
      source,
      JSON.stringify(prArgs({ backend: true })),
      { reply: prReplies() },
    );

    assert.match(result.checklist, /## Agent-Runnable Backend Checks/);
  });

  it('uses Opus for judgement and Sonnet for the narrow checks', async () => {
    const source = await prWorkflow('curricular');
    const { calls } = await runWorkflow(
      source,
      prArgs({ backend: true, frontend: true }, { storyCount: 1 }),
      { reply: prReplies({ claims: ['be-1'] }) },
    );

    for (const label of [
      'context-pack',
      'surfaces:frontend',
      'inventory:backend',
      'audit:hunks',
      'draft:backend',
      'draft:frontend',
      'draft:boot',
      'verify:boot',
    ]) {
      assert.equal(find(calls, label).model, 'opus', label);
    }
    for (const label of ['draft:summary', 'draft:storybook', 'claim:be-1']) {
      assert.equal(find(calls, label).model, 'sonnet', label);
    }
    assert.equal(find(calls, 'verify:sb').model, 'sonnet');
  });

  it('skips the human inventory and draft when the pack finds nothing a person could notice', async () => {
    const source = await prWorkflow('curricular');
    const { result, calls } = await runWorkflow(
      source,
      prArgs({ backend: true, frontend: true }),
      { reply: prReplies({ visible: [] }) },
    );

    assert.ok(!labels(calls).includes('inventory:frontend'));
    assert.ok(!labels(calls).includes('draft:frontend'));
    assert.match(
      result.checklist,
      /## Human Frontend Checks\n\n_Nothing a signed-in user could notice changed on this branch._/,
    );
  });

  it('drops the cross-cutting inventory under its experiment', async () => {
    const source = await prWorkflow('curricular', {
      experiments: { dropCrossCutting: true },
    });
    const { calls } = await runWorkflow(source, prArgs({ backend: true }), {
      reply: prReplies(),
    });

    assert.ok(!labels(calls).includes('inventory:cross-cutting'));
    assert.ok(labels(calls).includes('audit:dimensions'));
  });

  it('runs Storybook only when the config has it and the branch has stories', async () => {
    const curricular = await prWorkflow('curricular');
    const withStories = await runWorkflow(
      curricular,
      prArgs({ frontend: true }, { storyCount: 2 }),
      { reply: prReplies({ stories: 2 }) },
    );
    assert.match(
      withStories.result.checklist,
      /## Storybook Review Checks\n\n- \[ \] \*\*Features\/Thing0\*\* — Default/,
    );
    assert.equal(withStories.result.stats.storybookItems, 2);

    const noStories = await runWorkflow(
      curricular,
      prArgs({ frontend: true }),
      {
        reply: prReplies(),
      },
    );
    assert.ok(!labels(noStories.calls).includes('draft:storybook'));

    const sales = await prWorkflow('sales');
    const salesRun = await runWorkflow(
      sales,
      prArgs({ tui: true }, { storyCount: 3 }),
      { reply: prReplies() },
    );
    assert.ok(!labels(salesRun.calls).includes('draft:storybook'));
  });
});

describe('pr workflow — the backend drafters', () => {
  it('splits backend entries across drafters, each entry exactly once', async () => {
    const source = await prWorkflow('curricular');
    const { calls, result } = await runWorkflow(
      source,
      prArgs({ backend: true }),
      {
        reply: prReplies({ backend: 20, files: 5 }),
      },
    );

    const drafters = calls.filter((c) => c.label.startsWith('draft:backend'));
    assert.ok(drafters.length >= 3, `${drafters.length} drafters`);
    assert.ok(drafters.every((c) => /draft:backend:\d+$/.test(c.label)));

    const covered = drafters.flatMap((c) =>
      promptEntries(c.prompt).map((e) => e.id),
    );
    assert.equal(covered.length, 21);
    assert.equal(new Set(covered).size, 21);
    assert.ok(drafters.every((c) => promptEntries(c.prompt).length <= 8));
    assert.equal(result.stats.backendDrafters, drafters.length);

    // Each drafter is told only its own entries are its job.
    assert.match(
      drafters[0].prompt,
      /you are\nnumber 1\. Cover ONLY the entries below/,
    );
  });

  it('keeps one drafter, with no split note, for a small backend', async () => {
    const source = await prWorkflow('curricular');
    const { calls } = await runWorkflow(source, prArgs({ backend: true }), {
      reply: prReplies({ backend: 3 }),
    });
    const drafter = find(calls, 'draft:backend');

    assert.ok(drafter);
    assert.doesNotMatch(drafter.prompt, /split across/);
  });

  it('keeps a file’s entries with the same drafter where it can', async () => {
    const source = await prWorkflow('curricular');
    const { calls } = await runWorkflow(source, prArgs({ backend: true }), {
      reply: prReplies({ backend: 12, files: 2 }),
    });

    for (const drafter of calls.filter((c) =>
      c.label.startsWith('draft:backend'),
    )) {
      const files = new Set(
        promptEntries(drafter.prompt).map((e) => e.where.split(':')[0]),
      );
      assert.ok(files.size <= 2, `${drafter.label} spans ${files.size} files`);
    }
  });
});

describe('pr workflow — verification', () => {
  it('turns a failed coverage claim into a verified backend step', async () => {
    const source = await prWorkflow('curricular');
    const { result, calls } = await runWorkflow(
      source,
      prArgs({ backend: true }),
      {
        reply: prReplies({ claims: ['be-1', 'be-2'], failClaims: ['be-2'] }),
      },
    );

    assert.ok(labels(calls).includes('claim:be-1'));
    assert.ok(labels(calls).includes('convert:be-2'));
    assert.ok(!labels(calls).includes('convert:be-1'));
    assert.deepEqual(unitNames(find(calls, 'verify:converted')), [
      'converted:Converted be-2',
    ]);
    assert.match(result.checklist, /Backend \d — Converted be-2/);
    assert.equal(result.stats.claimsChecked, 2);
    assert.equal(result.stats.claimsConverted, 1);
    assert.equal(find(calls, 'convert:be-2').model, 'opus');
  });

  it('starts a conversion while other steps are still being verified', async () => {
    const source = await prWorkflow('curricular');
    const slow = 'verify:backend:Check be-2';
    const { calls } = await runWorkflow(source, prArgs({ backend: true }), {
      reply: prReplies({
        claims: ['be-1'],
        failClaims: ['be-1'],
        verify: (label) =>
          label.startsWith(slow) && !label.endsWith(':r2')
            ? {
                verdict: 'FAIL',
                findings: 'wrong port',
                rewrite: '```bash\ncurl\n```\n\n**Expect:** `201`',
              }
            : { verdict: 'PASS', findings: 'holds' },
      }),
      delay: (label) => (label.startsWith('verify:backend') ? 15 : 0),
    });

    const convert = find(calls, 'convert:be-1');
    const lastSlowRound = find(calls, 'verify:backend:r2');
    assert.ok(lastSlowRound, 'the slow step took two rounds');
    assert.ok(
      convert.started < lastSlowRound.ended,
      'the conversion did not wait for the slow step',
    );
  });

  it('verifies the human section without waiting for the backend draft', async () => {
    const source = await prWorkflow('curricular');
    const { calls } = await runWorkflow(
      source,
      prArgs({ backend: true, frontend: true }),
      {
        reply: prReplies(),
        delay: (label) => (label === 'draft:backend' ? 30 : 0),
      },
    );

    const humanVerify = find(calls, 'verify:frontend');
    assert.ok(humanVerify.started < find(calls, 'draft:backend').ended);
  });

  it('starts the summary and surfaces before the context pack', async () => {
    const source = await prWorkflow('curricular');
    const { calls } = await runWorkflow(
      source,
      prArgs({ backend: true, frontend: true }),
      { reply: prReplies() },
    );
    const pack = find(calls, 'context-pack');

    assert.ok(find(calls, 'draft:summary').started < pack.started);
    assert.ok(find(calls, 'surfaces:frontend').started < pack.started);
    assert.ok(
      find(calls, 'draft:boot').started < find(calls, 'audit:hunks').started,
    );
  });

  it('publishes a step with no accurate version as a gap', async () => {
    const source = await prWorkflow('curricular');
    const { result, logs } = await runWorkflow(
      source,
      prArgs({ backend: true }),
      {
        reply: prReplies({
          verify: (label) =>
            label.includes('Check be-3')
              ? {
                  verdict: 'FAIL',
                  findings: 'unreachable by hand',
                  rewrite: null,
                }
              : { verdict: 'PASS', findings: 'holds' },
        }),
      },
    );

    assert.doesNotMatch(result.checklist, /Check be-3\*\*/);
    assert.match(
      result.checklist,
      /backend:Check be-3 — no accurate manual version — unreachable by hand/,
    );
    assert.equal(result.stats.deleted, 1);
    assert.ok(logs.some((line) => line.startsWith('Deleted')));
  });

  it('leaves out a step still failing after two rounds, as a gap', async () => {
    const source = await prWorkflow('curricular');
    const { result, calls, logs } = await runWorkflow(
      source,
      prArgs({ backend: true }),
      {
        reply: prReplies({
          backend: 1,
          verify: (label) =>
            label.includes('Check be-1')
              ? {
                  verdict: 'FAIL',
                  findings: 'still wrong',
                  rewrite: '```bash\ncurl\n```\n\n**Expect:** `x`',
                }
              : { verdict: 'PASS', findings: 'holds' },
        }),
      },
    );

    // Round 2 re-checks only the failing step.
    assert.deepEqual(
      calls
        .filter((c) => c.label.startsWith('verify:backend'))
        .map((c) => [c.label, unitNames(c).length]),
      [
        ['verify:backend', 2],
        ['verify:backend:r2', 1],
      ],
    );
    assert.deepEqual(result.unresolved, ['backend:Check be-1']);
    assert.equal(result.stats.unresolved, 1);
    assert.equal(result.stats.exhausted, 1);
    assert.doesNotMatch(result.checklist, /Backend \d — Check be-1/);
    assert.match(
      result.checklist,
      /- backend:Check be-1 — failed verification 2 times — still wrong/,
    );
    assert.ok(
      logs.includes(
        'Left out, still failing after 2 rounds: backend:Check be-1',
      ),
    );
  });

  it('fixes a step’s format with Sonnet before an Opus round sees it', async () => {
    const source = await prWorkflow('curricular');
    const { calls } = await runWorkflow(source, prArgs({ frontend: true }), {
      reply: prReplies({ badFormat: true }),
    });

    const fix = calls.find((c) => c.label.startsWith('format:'));
    assert.ok(fix);
    assert.equal(fix.model, 'sonnet');
    assert.match(fix.prompt, /- no \*\*Expect:\*\* line/);

    const verify = find(calls, 'verify:frontend');
    assert.ok(fix.ended <= verify.started);
    assert.match(promptUnits(verify.prompt)[0].body, /\*\*Expect:\*\* "Fixed"/);
  });

  it('leaves a well-formed step alone', async () => {
    const source = await prWorkflow('curricular');
    const { calls } = await runWorkflow(
      source,
      prArgs({ backend: true, frontend: true }),
      {
        reply: prReplies(),
      },
    );

    assert.ok(!calls.some((c) => c.label.startsWith('format:')));
  });

  it('rechecks rewrites narrowly on Sonnet under its experiment', async () => {
    const source = await prWorkflow('curricular', {
      experiments: { narrowRounds: true },
    });
    const { calls } = await runWorkflow(source, prArgs({ backend: true }), {
      reply: prReplies({
        backend: 1,
        verify: (label) =>
          label.endsWith(':r2')
            ? { verdict: 'PASS', findings: 'fixed' }
            : {
                verdict: 'FAIL',
                findings: 'wrong status code',
                rewrite: '```bash\ncurl\n```\n\n**Expect:** `404`',
              },
      }),
    });

    const first = find(calls, 'verify:backend');
    const second = find(calls, 'verify:backend:r2');
    assert.equal(first.model, 'opus');
    assert.equal(second.model, 'sonnet');
    const [unit] = promptUnits(second.prompt);
    assert.equal(unit.previousFindings, 'wrong status code');
    assert.match(unit.body, /\*\*Expect:\*\* `404`/);
  });

  it('rechecks rewrites narrowly on Opus without the experiment', async () => {
    const source = await prWorkflow('curricular');
    const { calls } = await runWorkflow(source, prArgs({ backend: true }), {
      reply: prReplies({
        backend: 1,
        verify: (label) =>
          label.endsWith(':r2')
            ? { verdict: 'PASS', findings: 'fixed' }
            : {
                verdict: 'FAIL',
                findings: 'wrong',
                rewrite: '```bash\ncurl\n```\n\n**Expect:** `404`',
              },
      }),
    });

    const second = find(calls, 'verify:backend:r2');
    assert.equal(second.model, 'opus');
    assert.doesNotMatch(second.prompt, /## Checks — run all that apply/);
    assert.equal(promptUnits(second.prompt)[0].previousFindings, 'wrong');
  });
});

describe('pr workflow — batched verification', () => {
  it('verifies a group up to eight units to a checker, logging the count first', async () => {
    const source = await prWorkflow('curricular');
    const { calls, logs, result } = await runWorkflow(
      source,
      prArgs({ frontend: true }),
      {
        reply: prReplies({
          human: 10,
          verify: (label) =>
            /See frontend-(2|9)$/.test(label)
              ? {
                  verdict: 'FAIL',
                  findings: 'wrong copy',
                  rewrite: 'Open the page.\n\n**Expect:** "Done"',
                }
              : { verdict: 'PASS', findings: 'holds' },
        }),
      },
    );

    const checkers = calls
      .filter((c) => c.label.startsWith('verify:frontend'))
      .map((c) => [c.label, unitNames(c).length]);
    assert.deepEqual(checkers, [
      ['verify:frontend:b1', 8],
      ['verify:frontend:b2', 2],
      ['verify:frontend:r2', 2],
    ]);
    assert.ok(logs.includes('Verifying 10 frontend unit(s) with 2 checker(s)'));
    // Two frontend checkers, one re-check, and the boot block's own.
    assert.equal(result.stats.checkerAgents, 4);
    assert.match(
      result.checklist,
      /Frontend \d+ — See frontend-9\*\*\n\nOpen the page\.\n\n\*\*Expect:\*\* "Done"/,
    );
  });

  it('asks each checker for a verdict per unit id, under a sound schema', async () => {
    const source = await prWorkflow('curricular');
    const { calls } = await runWorkflow(source, prArgs({ backend: true }), {
      reply: prReplies({ backend: 3 }),
    });
    const checker = find(calls, 'verify:backend');

    assert.deepEqual(
      promptUnits(checker.prompt).map((unit) => unit.id),
      ['u1', 'u2', 'u3', 'u4'],
    );
    assert.deepEqual(checker.schema.required, ['verdicts']);
    assert.deepEqual(checker.schema.properties.verdicts.items.required, [
      'id',
      'verdict',
      'findings',
    ]);
    assert.match(checker.prompt, /A missing id counts as unverified/);
  });

  it('uses a handful of checkers for a forty-step checklist, not one per step', async () => {
    const source = await prWorkflow('curricular');
    const { calls, result } = await runWorkflow(
      source,
      prArgs({ backend: true }),
      { reply: prReplies({ backend: 39, files: 5 }) },
    );

    const checkers = calls.filter(
      (c) => c.label.startsWith('verify:') && c.label !== 'verify:boot',
    );
    assert.equal(result.stats.steps, 40);
    assert.equal(checkers.length, result.stats.backendDrafters);
    assert.ok(checkers.length <= 6, `${checkers.length} checkers`);
    assert.ok(checkers.every((c) => unitNames(c).length <= 8));
  });

  it('keeps Storybook items in their own checker on Sonnet, rendering the verified text', async () => {
    const source = await prWorkflow('curricular');
    const { calls, result } = await runWorkflow(
      source,
      prArgs({ frontend: true }, { storyCount: 1 }),
      {
        reply: prReplies({
          stories: 2,
          verify: (label) =>
            label === 'verify:sb:Features/Thing0'
              ? {
                  verdict: 'FAIL',
                  findings: 'the title is Fixed/Title',
                  rewrite: '**Fixed/Title** — Default\nThe badge is now blue.',
                }
              : { verdict: 'PASS', findings: 'holds' },
        }),
      },
    );

    assert.deepEqual(unitNames(find(calls, 'verify:sb')), [
      'sb:Features/Thing0',
      'sb:Features/Thing1',
    ]);
    assert.equal(find(calls, 'verify:sb:r2').model, 'sonnet');
    assert.match(
      result.checklist,
      /- \[ \] \*\*Fixed\/Title\*\* — Default\n      The badge is now blue\./,
    );
    assert.doesNotMatch(result.checklist, /Features\/Thing0/);
    assert.match(result.checklist, /\*\*Features\/Thing1\*\* — Default/);
  });

  it('takes a step’s priority and title from its verified rewrite', async () => {
    const source = await prWorkflow('curricular');
    const { result } = await runWorkflow(source, prArgs({ backend: true }), {
      reply: prReplies({
        backend: 1,
        verify: (label) =>
          label === 'verify:backend:Check be-1'
            ? {
                verdict: 'FAIL',
                findings: 'a test already asserts the status',
                rewrite:
                  '**[if-time] Check the body only**\n\n```bash\ncurl -s "$PORT/x"\n```\n\n**Expect:** `{}`',
              }
            : { verdict: 'PASS', findings: 'holds' },
      }),
    });

    assert.match(
      result.checklist,
      /- \[ \] \*\*\[if-time\] Backend 2 — Check the body only\*\*\n\n```bash/,
    );
    assert.doesNotMatch(result.checklist, /Check be-1/);
    assert.match(
      result.checklist,
      /_About \d+ minutes; 1 of 2 steps are blocking\./,
    );
  });
});

describe('pr workflow — the assembled checklist', () => {
  it('lays out the Curricular checklist', async () => {
    const source = await prWorkflow('curricular');
    const { result } = await runWorkflow(
      source,
      prArgs({ backend: true, frontend: true }),
      { reply: prReplies() },
    );
    const text = result.checklist;

    const order = [
      '```bash\nnpm run dev\n```',
      '## Agent-Runnable Backend Checks',
      '## Human Frontend Checks',
      "**When you're finished**, stop the stack: `npm run supabase:stop`",
      '**Not covered by these checks**',
      '### Local CI',
    ].map((part) => text.indexOf(part));
    assert.ok(
      order.every((index) => index !== -1),
      String(order),
    );
    assert.deepEqual(
      order,
      [...order].sort((a, b) => a - b),
    );

    assert.match(
      text,
      /_About 8 minutes; 4 of 4 steps are blocking\. Paste what you observed under each step\._/,
    );
    assert.match(text, /_About 6 minutes; 1 of 2 steps are blocking\._/);
    assert.match(text, /- \[ \] \*\*\[blocking\] Backend 1 — Check be-1\*\*/);
    assert.match(
      text,
      /- \[ \] \*\*\[blocking\] Frontend 1 — See frontend-1\*\*/,
    );
    assert.match(
      text,
      /- \[ \] \*\*\[if-time\] Frontend 2 — See frontend-2\*\*/,
    );
    assert.match(text, /- screen reader output — needs a screen reader/);
    assert.match(
      text,
      /- \[ \] Review agents \(run locally before merge\)\n- \[ \] Full test suite passes/,
    );
    assert.match(
      text,
      /Storybook tests are dispatch-only: `gh workflow run pr-main\.yml --ref feature\/thing`\./,
    );
    assert.equal(result.stats.steps, 6);
  });

  it('lays out the Sales harness checklist', async () => {
    const source = await prWorkflow('sales');
    const { result } = await runWorkflow(
      source,
      prArgs({ backend: true, tui: true }),
      {
        reply: prReplies(),
      },
    );

    assert.match(result.checklist, /## Human TUI Checks/);
    assert.match(result.checklist, /TUI 1 — See tui-1/);
    assert.match(result.checklist, /stop the stack: `docker compose down`/);
    assert.match(
      result.checklist,
      /- \[ \] `npm test && npm run test:integration`/,
    );
    assert.doesNotMatch(result.checklist, /Storybook/);
  });

  it('puts a visible entry in the backend section when no human section is touched', async () => {
    const source = await prWorkflow('curricular');
    const replies = prReplies({ backend: 1 });
    const { calls } = await runWorkflow(source, prArgs({ backend: true }), {
      reply: (label, prompt) =>
        label === 'audit:hunks'
          ? {
              entries: [
                {
                  id: 'aud-1',
                  behaviour: 'a new banner',
                  where: 'src/ui/banner.tsx:1',
                  reachable: 'load',
                  actors: 'teacher',
                  visible: true,
                  section: 'frontend',
                },
              ],
            }
          : replies(label, prompt),
    });

    const covered = promptEntries(find(calls, 'draft:backend').prompt).map(
      (e) => e.id,
    );
    assert.ok(covered.includes('aud-1'));
  });
});

describe('pr workflow — config reaches the prompts', () => {
  it('writes each repository’s own wording into its prompts', async () => {
    const sales = await prWorkflow('sales');
    const { calls } = await runWorkflow(
      sales,
      prArgs({ backend: true, tui: true }),
      {
        reply: prReplies(),
      },
    );

    assert.match(find(calls, 'draft:backend').prompt, /redis-cli reads/);
    assert.match(find(calls, 'draft:backend').prompt, /\$PORT, \$DB, \$TOKEN/);
    assert.match(
      find(calls, 'inventory:backend').prompt,
      /worker loop \/ API caller \/ TUI operator \/ inbound webhook/,
    );
    assert.match(
      find(calls, 'inventory:cross-cutting').prompt,
      /idempotency \(the same webhook or step run twice\)/,
    );
    assert.match(
      find(calls, 'context-pack').prompt,
      /flows and steps that run them/,
    );
    assert.match(
      find(calls, 'surfaces:tui').prompt,
      /the `shared` package is the\s+contract/,
    );
    assert.match(find(calls, 'draft:tui').prompt, /Step 1 is starting the TUI/);
    assert.match(find(calls, 'draft:boot').prompt, /npm run db:up/);
    const verify = find(calls, 'verify:backend');
    assert.match(
      verify.prompt,
      /Read `\.agents\/skills\/pr\/TRAPS\.md` in full/,
    );
    assert.match(verify.prompt, /Redis keys/);
    assert.match(verify.prompt, /the worker loop intercept first/);
  });

  it('leaves backend-only boot variables out when there is no backend section', async () => {
    const source = await prWorkflow('curricular');
    const { calls } = await runWorkflow(source, prArgs({ frontend: true }), {
      reply: prReplies(),
    });
    const boot = find(calls, 'draft:boot').prompt;

    assert.match(boot, /\\\$PORT — the dev server port/);
    assert.doesNotMatch(boot, /TOKEN/);
    assert.match(boot, /supabase:reset/);
  });

  it('tells every drafter and verifier never to run anything', async () => {
    const source = await prWorkflow('curricular');
    const { calls } = await runWorkflow(
      source,
      prArgs({ backend: true, frontend: true }),
      {
        reply: prReplies({ claims: ['be-1'] }),
      },
    );

    for (const call of calls.filter((c) =>
      /^(draft:(backend|frontend)|verify:backend)/.test(c.label),
    )) {
      assert.match(
        call.prompt,
        /Never run a command while drafting|CODE-READING ONLY/,
        call.label,
      );
    }
    assert.match(find(calls, 'claim:be-1').prompt, /Never run the test/);
  });
});

describe('pr workflow — edges', () => {
  it('numbers each audit angle’s entries apart, so their ids never collide', async () => {
    const source = await prWorkflow('curricular');
    const { calls } = await runWorkflow(source, prArgs({ backend: true }), {
      reply: prReplies(),
    });

    assert.match(find(calls, 'audit:hunks').prompt, /id prefix `aud-hunks-`/);
    assert.match(
      find(calls, 'audit:dimensions').prompt,
      /id prefix `aud-dimensions-`/,
    );
  });

  it('drafts a section the pack missed when a visible entry lands in it', async () => {
    const source = await prWorkflow('curricular');
    const replies = prReplies({ visible: [] });
    const { calls, result } = await runWorkflow(
      source,
      prArgs({ backend: true, frontend: true }),
      {
        reply: (label, prompt) =>
          label === 'audit:hunks'
            ? {
                entries: [
                  {
                    id: 'aud-hunks-1',
                    behaviour: 'a new banner',
                    where: 'src/ui/banner.tsx:1',
                    reachable: 'load',
                    actors: 'teacher',
                    visible: true,
                    section: 'frontend',
                  },
                ],
              }
            : replies(label, prompt),
      },
    );

    assert.ok(!labels(calls).includes('inventory:frontend'));
    assert.deepEqual(
      promptEntries(find(calls, 'draft:frontend').prompt).map((e) => e.id),
      ['aud-hunks-1'],
    );
    assert.match(result.checklist, /Frontend 1 — See aud-hunks-1/);
    assert.doesNotMatch(result.checklist, /_Nothing a signed-in user/);
  });

  it('lists entries no section drafts as gaps when the backend section is off', async () => {
    const source = await prWorkflow('curricular');
    const replies = prReplies();
    const { result, logs } = await runWorkflow(
      source,
      prArgs({ frontend: true }),
      { reply: replies },
    );

    assert.match(
      result.checklist,
      /- a rejected caller \(src\/service\/file0\.ts:99\) — no checklist section drafts it, since the backend section is off/,
    );
    assert.ok(
      logs.includes('1 entries have no section to draft them — listed as gaps'),
    );
  });

  it('stops when the context pack fails', async () => {
    const source = await prWorkflow('curricular');
    const replies = prReplies();

    await assert.rejects(
      runWorkflow(source, prArgs({ backend: true }), {
        reply: (label, prompt) =>
          label === 'context-pack' ? null : replies(label, prompt),
      }),
      /Context-pack explorer failed/,
    );
  });

  it('leaves out a unit its checker gave no verdict for, as a gap', async () => {
    const source = await prWorkflow('curricular');
    const { result, logs } = await runWorkflow(
      source,
      prArgs({ backend: true }),
      {
        reply: prReplies({
          backend: 1,
          verify: (label) =>
            label.includes('be-1') ? null : { verdict: 'PASS', findings: '' },
        }),
      },
    );

    assert.deepEqual(result.unresolved, ['backend:Check be-1']);
    assert.equal(result.stats.unverified, 1);
    assert.doesNotMatch(result.checklist, /Backend \d — Check be-1/);
    assert.match(
      result.checklist,
      /- backend:Check be-1 — never verified — the checker gave no verdict for it/,
    );
    assert.ok(
      logs.includes(
        'Left out, never verified (the checker gave no verdict for it): backend:Check be-1',
      ),
    );
  });

  it('leaves out every unit of a checker that returned nothing', async () => {
    const source = await prWorkflow('curricular');
    const replies = prReplies();
    const { result } = await runWorkflow(source, prArgs({ frontend: true }), {
      reply: (label, prompt) =>
        label === 'verify:frontend' ? null : replies(label, prompt),
    });

    assert.deepEqual(result.unresolved, [
      'frontend:See frontend-1',
      'frontend:See frontend-2',
    ]);
    assert.doesNotMatch(result.checklist, /## Human Frontend Checks/);
    assert.match(
      result.checklist,
      /- frontend:See frontend-2 — never verified — the checker returned nothing/,
    );
  });

  it('publishes a changed file no surface could be traced to as a gap', async () => {
    const source = await prWorkflow('curricular');
    const replies = prReplies();
    const { result } = await runWorkflow(source, prArgs({ frontend: true }), {
      reply: (label, prompt) =>
        label === 'surfaces:frontend'
          ? { surfaces: [], unresolved: ['src/ui/Orphan.tsx'] }
          : replies(label, prompt),
    });

    assert.match(
      result.checklist,
      /- src\/ui\/Orphan\.tsx — a changed file no surface could be traced to/,
    );
  });

  it('points agents at the per-file patches for a large diff', async () => {
    const source = await prWorkflow('curricular');
    const { calls } = await runWorkflow(
      source,
      prArgs({ backend: true }, { largeDiff: true }),
      {
        reply: prReplies(),
      },
    );

    assert.match(
      find(calls, 'context-pack').prompt,
      /large — read the per-file patches in `\/scratch\/pr-qa-patches`/,
    );
    assert.match(
      find(calls, 'draft:summary').prompt,
      /use the per-file patches/,
    );
  });

  it('keeps a boot block its checker deletes, under a warning and not as a gap', async () => {
    const source = await prWorkflow('curricular');
    const { result } = await runWorkflow(source, prArgs({ backend: true }), {
      reply: prReplies({
        verify: (label) =>
          label === 'verify:boot'
            ? { verdict: 'FAIL', findings: 'no port', rewrite: null }
            : { verdict: 'PASS', findings: '' },
      }),
    });

    assert.ok(
      result.checklist.startsWith(
        '> [!WARNING]\n> **This boot block did not pass verification** — the checker found no accurate version: no port. Check each command against the repository before relying on it.\n\n```bash\nnpm run dev\n```',
      ),
    );
    assert.ok(!result.gaps.some((gap) => gap.gap === 'boot'));
    assert.deepEqual(result.unresolved, []);
  });

  it('warns on a boot block still failing after two rounds, keeping the last rewrite', async () => {
    const source = await prWorkflow('curricular');
    const { result, calls } = await runWorkflow(
      source,
      prArgs({ backend: true }),
      {
        reply: prReplies({
          verify: (label) =>
            label.startsWith('verify:boot')
              ? {
                  verdict: 'FAIL',
                  findings: 'still no port',
                  rewrite: '```bash\nnpm run dev -- --port 3000\n```',
                }
              : { verdict: 'PASS', findings: '' },
        }),
      },
    );

    assert.ok(find(calls, 'verify:boot:r2'));
    assert.match(
      result.checklist,
      /^> \[!WARNING\]\n> \*\*This boot block did not pass verification\*\* — it still failed after 2 rounds: still no port\./,
    );
    assert.match(result.checklist, /npm run dev -- --port 3000/);
    assert.ok(!result.gaps.some((gap) => gap.gap === 'boot'));
  });

  it('uses the verified rewrite of the boot block', async () => {
    const source = await prWorkflow('curricular');
    const { result } = await runWorkflow(source, prArgs({ backend: true }), {
      reply: prReplies({
        verify: (label) =>
          label === 'verify:boot'
            ? {
                verdict: 'FAIL',
                findings: 'reset missing',
                rewrite: '```bash\nnpm run supabase:reset\n```',
              }
            : { verdict: 'PASS', findings: '' },
      }),
    });

    assert.ok(
      result.checklist.startsWith('```bash\nnpm run supabase:reset\n```'),
    );
  });

  it('leaves out a human section that ended with no steps', async () => {
    const source = await prWorkflow('curricular');
    const { result } = await runWorkflow(source, prArgs({ frontend: true }), {
      reply: prReplies({
        verify: (label) =>
          label.startsWith('verify:frontend')
            ? {
                verdict: 'FAIL',
                findings: 'needs a screen reader',
                rewrite: null,
              }
            : { verdict: 'PASS', findings: '' },
      }),
    });

    assert.doesNotMatch(result.checklist, /## Human Frontend Checks/);
    assert.match(
      result.checklist,
      /frontend:See frontend-1 — no accurate manual version/,
    );
  });

  it('files a visible entry under its own section when several are touched', async () => {
    const source = await prWorkflow('curricular', {
      layers: [
        { key: 'api', title: 'API', paths: ['src/api/'], section: 'backend' },
        { key: 'web', title: 'Web', paths: ['src/web/'], section: 'web' },
        { key: 'cli', title: 'CLI', paths: ['src/cli/'], section: 'cli' },
      ],
      sections: {
        web: { title: 'Human Web Checks' },
        cli: { title: 'Human CLI Checks' },
      },
    });
    const replies = prReplies({ human: 1 });
    const { calls, result } = await runWorkflow(
      source,
      prArgs({ web: true, cli: true }),
      {
        reply: (label, prompt) =>
          label === 'audit:hunks'
            ? {
                entries: [
                  {
                    id: 'aud-1',
                    behaviour: 'x',
                    where: 'src/cli/a.ts:1',
                    reachable: 'r',
                    actors: 'a',
                    visible: true,
                    section: 'cli',
                  },
                  {
                    id: 'aud-2',
                    behaviour: 'y',
                    where: 'src/cli/b.ts:1',
                    reachable: 'r',
                    actors: 'a',
                    visible: true,
                    section: 'nowhere',
                  },
                ],
              }
            : replies(label, prompt),
      },
    );

    const cli = promptEntries(find(calls, 'draft:cli').prompt).map((e) => e.id);
    const web = promptEntries(find(calls, 'draft:web').prompt).map((e) => e.id);
    assert.ok(cli.includes('aud-1'));
    assert.ok(
      web.includes('aud-2'),
      'an unknown section falls back to the first touched',
    );
    assert.match(
      result.checklist,
      /## Human Web Checks[\s\S]*## Human CLI Checks/,
    );
    assert.match(result.checklist, /Cli 1 — See cli-1/);
  });

  it('writes no stop line or note when the config has none', async () => {
    const source = await prWorkflow('curricular', {
      boot: {},
      localCiNote: '',
    });
    const { result } = await runWorkflow(source, prArgs({ backend: true }), {
      reply: prReplies(),
    });

    assert.doesNotMatch(result.checklist, /When you're finished/);
    assert.match(
      result.checklist,
      /### Local CI\n\n- \[ \] Review agents \(run locally before merge\)\n- \[ \] Full test suite passes \(unit, integration, API, e2e — run locally\)$/,
    );
  });

  it('says when steps carry no time estimate', async () => {
    const source = await prWorkflow('curricular');
    const replies = prReplies({ backend: 1 });
    const { result } = await runWorkflow(
      source,
      prArgs({ backend: true }, {}),
      {
        reply: (label, prompt) => {
          const reply = replies(label, prompt);
          if (label.startsWith('draft:backend')) {
            reply.steps = reply.steps.map((step) => ({ ...step, minutes: 0 }));
          }
          return reply;
        },
      },
    );

    assert.match(
      result.checklist,
      /_Time not estimated; 2 of 2 steps are blocking\./,
    );
  });
});

describe('pr workflow — format check and grouping rules', () => {
  it('names every format problem a script can see', async () => {
    const source = await prWorkflow('curricular');
    const replies = prReplies({ backend: 1 });
    const { calls } = await runWorkflow(source, prArgs({ backend: true }), {
      reply: (label, prompt) => {
        const reply = replies(label, prompt);
        if (label === 'draft:backend') {
          reply.steps = [
            {
              title: 'Messy',
              priority: 'blocking',
              body: 'curl x\n\n**Teardown:** none\n\n**Expect:** `200`',
              coversEntryIds: ['be-1'],
              minutes: 1,
            },
          ];
        }
        return reply;
      },
    });

    const fix = find(calls, 'format:backend:Messy');
    assert.match(fix.prompt, /says "Teardown: none"/);
    assert.match(fix.prompt, /a terminal step with no fenced command block/);
    assert.match(fix.prompt, /labels out of order/);
    assert.doesNotMatch(fix.prompt, /no \*\*Expect:\*\* line/);
  });

  it('splits one file’s entries when there are more than a drafter takes', async () => {
    const source = await prWorkflow('curricular');
    const { calls } = await runWorkflow(source, prArgs({ backend: true }), {
      reply: prReplies({ backend: 10, files: 1 }),
    });

    const sizes = calls
      .filter((c) => c.label.startsWith('draft:backend'))
      .map((c) => promptEntries(c.prompt).length);
    assert.deepEqual(sizes, [8, 3]);
  });
});
