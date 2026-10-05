// ============================================================================
// PR Workflow Engine Tests
// ============================================================================
//
// Runs the generated pr-qa workflow for both fixtures with canned agents, and
// checks what runs, in what order, on which model, and what it assembles.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import webapp from './fixtures/pr/webapp.mjs';
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
const afterTriage = (checklist) =>
  checklist.replace(/^_Triage: [^\n]*_\n\n/, '');
const gapText = (result) =>
  result.gaps.map((g) => `- ${g.gap} — ${g.why}`).join('\n');

describe('pr workflow — what runs', () => {
  it('writes only a summary when no section is touched', async () => {
    const source = await prWorkflow('webapp');
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
    const source = await prWorkflow('webapp');
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
    const source = await prWorkflow('webapp');
    const { result } = await runWorkflow(
      source,
      JSON.stringify(prArgs({ backend: true })),
      { reply: prReplies() },
    );

    assert.match(result.checklist, /## Agent-Runnable Backend Checks/);
  });

  it('uses Opus for judgement and Sonnet for the narrow checks', async () => {
    const source = await prWorkflow('webapp');
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
      'verify:backend',
    ]) {
      assert.equal(find(calls, label).model, 'opus', label);
    }
    for (const label of ['draft:summary', 'draft:storybook', 'verify:sb']) {
      assert.equal(find(calls, label).model, 'sonnet', label);
    }
  });

  it('skips the human inventory and draft when the pack finds nothing a person could notice', async () => {
    const source = await prWorkflow('webapp');
    const { result, calls } = await runWorkflow(
      source,
      prArgs({ backend: true, frontend: true }),
      { reply: prReplies({ visible: [] }) },
    );

    assert.ok(!labels(calls).includes('inventory:frontend'));
    assert.ok(!labels(calls).includes('draft:frontend'));
    assert.match(
      result.checklist,
      /## Human Browser Checks\n\n_Nothing a signed-in member could notice changed on this branch._/,
    );
  });

  it('drops the cross-cutting inventory under its experiment', async () => {
    const source = await prWorkflow('webapp', {
      experiments: { dropCrossCutting: true },
    });
    const { calls } = await runWorkflow(source, prArgs({ backend: true }), {
      reply: prReplies(),
    });

    assert.ok(!labels(calls).includes('inventory:cross-cutting'));
    assert.ok(labels(calls).includes('audit:dimensions'));
  });

  it('runs Storybook only when the config has it and the branch has stories', async () => {
    const webapp = await prWorkflow('webapp');
    const withStories = await runWorkflow(
      webapp,
      prArgs({ frontend: true }, { storyCount: 2 }),
      { reply: prReplies({ stories: 2 }) },
    );
    assert.match(
      withStories.result.checklist,
      /## Storybook Review Checks\n\n- \[ \] \*\*Features\/Thing0\*\* — Default/,
    );
    assert.equal(withStories.result.stats.storybookItems, 2);

    const noStories = await runWorkflow(webapp, prArgs({ frontend: true }), {
      reply: prReplies(),
    });
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

describe('pr workflow — triage', () => {
  it('triages on Sonnet first, alongside the summary, and opens the checklist with its line', async () => {
    const source = await prWorkflow('webapp');
    const { result, calls } = await runWorkflow(
      source,
      prArgs({ backend: true, frontend: true }),
      { reply: prReplies({ triage: { size: 'small', touches: ['page'] } }) },
    );

    assert.deepEqual(labels(calls).slice(0, 2), ['draft:summary', 'triage']);
    assert.equal(find(calls, 'triage').model, 'sonnet');
    assert.ok(
      find(calls, 'triage').ended < find(calls, 'context-pack').started,
    );
    // No prepass hints, so anything could need running.
    assert.match(
      result.checklist,
      /^_Triage: behaviour change \(small\) · needs database, api, page · about \d+ minutes_\n\n/,
    );
  });

  it('adds to what the prepass found, never takes from it', async () => {
    const source = await prWorkflow('webapp', {
      outsideRepo: [
        { ask: 'Hosting config?', paths: ['vercel.json'] },
        { ask: 'New service?' },
        { ask: 'New env var?' },
      ],
    });
    const { result, calls } = await runWorkflow(
      source,
      prArgs(
        { frontend: true },
        {
          triage: {
            touches: ['page'],
            pureMoveCandidate: false,
            outsideRepo: [{ ask: 'Hosting config?', files: ['vercel.json'] }],
          },
        },
      ),
      {
        reply: prReplies({
          triage: {
            touches: ['api'],
            outsideRepo: [
              { ask: 'Hosting config?', yes: false, why: 'no' },
              {
                ask: 'New service?',
                yes: true,
                why: 'calls Stripe',
                files: ['src/pay.ts'],
              },
              { ask: 'New env var?', yes: false, why: 'none' },
            ],
          },
        }),
      },
    );

    assert.match(result.checklist, /needs api, page/);
    assert.match(
      find(calls, 'triage').prompt,
      /- Hosting config\?\n- New service\?\n- New env var\?/,
    );
  });

  it('falls back to a large behaviour change when the triage returns nothing', async () => {
    const source = await prWorkflow('webapp');
    const { result, calls } = await runWorkflow(
      source,
      prArgs({ backend: true }),
      {
        reply: prReplies({ triage: null }),
      },
    );

    assert.ok(labels(calls).includes('context-pack'));
    assert.match(result.checklist, /^_Triage: behaviour change \(large\)/);
  });

  it('writes only a summary for a tooling-only diff', async () => {
    const source = await prWorkflow('webapp');
    const { result, calls } = await runWorkflow(
      source,
      prArgs({ backend: true }),
      {
        reply: prReplies({ triage: { kind: 'tooling' } }),
      },
    );

    assert.deepEqual(labels(calls), ['draft:summary', 'triage']);
    assert.match(
      result.checklist,
      /^_Triage: tooling only · needs database, api, page · time not estimated_\n\n_No manual checks needed — nothing this branch changes runs in the product\._\n\n---\n\n### Local CI/,
    );
  });

  it('gives a pure move a smoke check within its budget, skipping the inventory', async () => {
    const source = await prWorkflow('webapp');
    const { result, calls } = await runWorkflow(
      source,
      prArgs({ backend: true, frontend: true }),
      { reply: prReplies({ triage: { kind: 'move', touches: ['page'] } }) },
    );
    const names = labels(calls);

    for (const label of [
      'context-pack',
      'inventory:backend',
      'audit:hunks',
      'surfaces:frontend',
    ]) {
      assert.ok(!names.includes(label), `${label} skipped`);
    }
    assert.ok(names.indexOf('verify:boot') < names.indexOf('draft:smoke'));
    assert.equal(unitNames(find(calls, 'verify:smoke')).length, 2);
    assert.doesNotMatch(find(calls, 'draft:boot').prompt, /Context pack:/);
    assert.match(
      result.checklist,
      /^_Triage: pure move · needs database, api, page · about 5 minutes_/,
    );
    assert.match(
      result.checklist,
      /## Smoke Check\n\n.*\n\n- \[ \] \*\*\[blocking\] Smoke 1 — Load the moved page\*\*/,
    );
    assert.match(
      result.checklist,
      /- \[ \] The type check and the production build pass/,
    );
    assert.equal(result.stats.steps, 2);
  });
});

describe('pr workflow — prune', () => {
  it('prunes on Opus after both audits, before any drafter', async () => {
    const source = await prWorkflow('webapp');
    const { calls } = await runWorkflow(source, prArgs({ backend: true }), {
      reply: prReplies(),
    });
    const prune = find(calls, 'prune');

    assert.equal(prune.model, 'opus');
    assert.ok(find(calls, 'audit:hunks').ended < prune.started);
    assert.ok(find(calls, 'audit:dimensions').ended < prune.started);
    assert.ok(prune.ended < find(calls, 'draft:backend').started);
    assert.match(prune.prompt, /"id": "be-1"/);
  });

  it('merges and drops what it names, ignoring made-up ids and covered drops with no test', async () => {
    const source = await prWorkflow('webapp');
    const { result, calls } = await runWorkflow(
      source,
      prArgs({ backend: true }),
      {
        reply: prReplies({
          backend: 5,
          prune: {
            merge: [
              {
                keep: 'be-1',
                ids: ['be-1', 'be-2', 'be-99'],
                inputs: 'every status code',
              },
              { keep: 'be-404', ids: ['be-3'], inputs: 'nothing' },
            ],
            drop: [
              {
                id: 'be-4',
                reason: 'passes-on-main',
                why: 'only a comment moved',
              },
              {
                id: 'be-5',
                reason: 'covered',
                why: 'asserted',
                testFile: 'src/a.test.ts',
                assertion: 'it 5',
              },
              {
                id: 'xc-1',
                reason: 'covered',
                why: 'probably',
                testFile: null,
              },
              { id: 'nope', reason: 'passes-on-main', why: 'made up' },
            ],
          },
        }),
      },
    );
    const drafted = promptEntries(find(calls, 'draft:backend').prompt);

    assert.deepEqual(drafted.map((e) => e.id).sort(), ['be-1', 'be-3', 'xc-1']);
    assert.match(
      drafted.find((e) => e.id === 'be-1').behaviour,
      /backend behaviour 1 — stands for every status code/,
    );
    assert.deepEqual(unitNames(find(calls, 'verify:pruned')), ['claim:be-5']);
    assert.match(result.checklist, /\*\*Covered by:\*\* `src\/a\.test\.ts`/);
    assert.equal(result.stats.pruned, 3);
  });

  it('keeps the whole inventory when the pruner returns nothing', async () => {
    const source = await prWorkflow('webapp');
    const { calls } = await runWorkflow(source, prArgs({ backend: true }), {
      reply: prReplies({ prune: null }),
    });

    assert.equal(promptEntries(find(calls, 'draft:backend').prompt).length, 4);
  });
});

describe('pr workflow — the backend drafters', () => {
  it('splits backend entries across drafters, each entry exactly once', async () => {
    const source = await prWorkflow('webapp');
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
    const source = await prWorkflow('webapp');
    const { calls } = await runWorkflow(source, prArgs({ backend: true }), {
      reply: prReplies({ backend: 3 }),
    });
    const drafter = find(calls, 'draft:backend');

    assert.ok(drafter);
    assert.doesNotMatch(drafter.prompt, /split across/);
  });

  it('keeps a file’s entries with the same drafter where it can', async () => {
    const source = await prWorkflow('webapp');
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
  it('cites an upheld claim under Covered by, and reports a failed one as a test gap', async () => {
    const source = await prWorkflow('webapp');
    const { result, calls } = await runWorkflow(
      source,
      prArgs({ backend: true }),
      {
        reply: prReplies({ claims: ['be-1', 'be-2'], failClaims: ['be-2'] }),
      },
    );

    // The step checker confirms both claims; no agent checks a claim alone.
    assert.ok(!labels(calls).some((label) => label.startsWith('claim:')));
    assert.deepEqual(unitNames(find(calls, 'verify:backend')).slice(-2), [
      'claim:be-1',
      'claim:be-2',
    ]);
    assert.match(
      find(calls, 'verify:backend').prompt,
      /For a claim the checks reduce to/,
    );
    assert.ok(!labels(calls).some((label) => label.startsWith('convert:')));
    assert.doesNotMatch(result.checklist, /Check be-2/);
    assert.match(result.checklist, /\*\*Covered by:\*\* `src\/a\.test\.ts`/);
    assert.match(
      gapText(result),
      /backend behaviour 2 \(src\/service\/file1\.ts:11\) — no test proves it after all, so it is a test gap for code review — no such assertion/,
    );
    assert.equal(result.stats.claimsChecked, 2);
    assert.equal(result.stats.claimsFailed, 1);
    assert.ok(!result.gaps.some((gap) => gap.gap.startsWith('claim:')));
  });

  it('lets a human section cite tests too, and tells drafters to cite rather than repeat', async () => {
    const source = await prWorkflow('webapp');
    const { result, calls } = await runWorkflow(
      source,
      prArgs({ frontend: true }),
      { reply: prReplies({ human: 2, humanClaims: ['frontend-2'] }) },
    );
    const draft = find(calls, 'draft:frontend').prompt;

    assert.match(draft, /A manual step exists only for what no test proves/);
    assert.match(draft, /never a judgement|is never covered by a test/);
    assert.doesNotMatch(draft, /NO automated-test filter/);
    assert.doesNotMatch(find(calls, 'draft:frontend').prompt, /When in doubt/);
    assert.deepEqual(unitNames(find(calls, 'verify:frontend')), [
      'frontend:See frontend-1',
      'claim:frontend-2',
    ]);
    assert.match(result.checklist, /See frontend-1/);
    assert.doesNotMatch(result.checklist, /See frontend-2/);
    assert.match(result.checklist, /\*\*Covered by:\*\* `src\/a\.test\.ts`/);
  });

  it('renders a section whose every entry a test proves as just its Covered by line', async () => {
    const source = await prWorkflow('webapp');
    const { result } = await runWorkflow(source, prArgs({ backend: true }), {
      reply: prReplies({ backend: 2, claims: ['be-1', 'be-2', 'xc-1'] }),
    });

    assert.match(
      result.checklist,
      /## Agent-Runnable Backend Checks\n\n_Every change here is proven by a test\._\n\n\*\*Covered by:\*\* `src\/a\.test\.ts`/,
    );
  });

  it('verifies the human section without waiting for the backend draft', async () => {
    const source = await prWorkflow('webapp');
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
    const source = await prWorkflow('webapp');
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
    const source = await prWorkflow('webapp');
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
      gapText(result),
      /backend:Check be-3 — no accurate manual version — unreachable by hand/,
    );
    assert.equal(result.stats.deleted, 1);
    assert.ok(logs.some((line) => line.startsWith('Deleted')));
  });

  it('leaves out a step still failing after two rounds, as a gap', async () => {
    const source = await prWorkflow('webapp');
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
      gapText(result),
      /- backend:Check be-1 — failed verification 2 times — still wrong/,
    );
    assert.ok(
      logs.includes(
        'Left out, still failing after 2 rounds: backend:Check be-1',
      ),
    );
  });

  it('fixes a step’s format with Sonnet before an Opus round sees it', async () => {
    const source = await prWorkflow('webapp');
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
    const source = await prWorkflow('webapp');
    const { calls } = await runWorkflow(
      source,
      prArgs({ backend: true, frontend: true }),
      {
        reply: prReplies(),
      },
    );

    assert.ok(!calls.some((c) => c.label.startsWith('format:')));
  });

  it('rechecks rewrites narrowly on Sonnet', async () => {
    const source = await prWorkflow('webapp');
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
    assert.doesNotMatch(second.prompt, /## Checks — run all that apply/);
    const [unit] = promptUnits(second.prompt);
    assert.equal(unit.previousFindings, 'wrong status code');
    assert.match(unit.body, /\*\*Expect:\*\* `404`/);
  });

  it('verifies the boot block before drafting, and drafts against the verified one', async () => {
    const source = await prWorkflow('webapp');
    const { calls } = await runWorkflow(
      source,
      prArgs({ backend: true, frontend: true }),
      {
        reply: prReplies({
          verify: (label) =>
            label === 'verify:boot'
              ? {
                  verdict: 'FAIL',
                  findings: 'wrong script',
                  rewrite: '```bash\nnpm run dev:all\n```',
                }
              : { verdict: 'PASS', findings: 'holds' },
        }),
      },
    );

    const bootDone = find(calls, 'verify:boot:r2').ended;
    for (const label of ['draft:backend', 'draft:frontend']) {
      const draft = find(calls, label);
      assert.ok(draft.started > bootDone, label);
      assert.match(draft.prompt, /npm run dev:all/, label);
      assert.match(
        draft.prompt,
        /Read `\.claude\/skills\/pr\/TRAPS\.md` in full before drafting/,
        label,
      );
    }
    assert.match(find(calls, 'verify:backend').prompt, /npm run dev:all/);
  });

  it('suggests the mistakes that broke three or more steps as traps', async () => {
    const source = await prWorkflow('webapp');
    const { result, calls } = await runWorkflow(
      source,
      prArgs({ backend: true }),
      {
        reply: prReplies({
          backend: 3,
          verify: (label) =>
            label.endsWith(':r2')
              ? { verdict: 'PASS', findings: 'fixed' }
              : label.startsWith('verify:backend')
                ? {
                    verdict: 'FAIL',
                    findings: '$DB_URL is not defined',
                    rewrite: '```bash\ncurl\n```\n\n**Expect:** `200`',
                  }
                : { verdict: 'PASS', findings: 'holds' },
        }),
      },
    );

    const traps = find(calls, 'traps');
    assert.equal(traps.model, 'sonnet');
    assert.equal(
      (traps.prompt.match(/\$DB_URL is not defined/g) ?? []).length,
      4,
    );
    assert.deepEqual(
      result.trapCandidates.map((trap) => trap.trap),
      ['a repeated mistake'],
    );
  });

  it('asks for no traps when fewer than three steps failed', async () => {
    const source = await prWorkflow('webapp');
    const { result, calls } = await runWorkflow(
      source,
      prArgs({ backend: true }),
      { reply: prReplies() },
    );

    assert.ok(!find(calls, 'traps'));
    assert.deepEqual(result.trapCandidates, []);
  });
});

describe('pr workflow — batched verification', () => {
  it('verifies a group up to eight units to a checker, logging the count first', async () => {
    const source = await prWorkflow('webapp');
    const base = prReplies({
      human: 5,
      verify: (label) =>
        /See frontend-(2|4) again$/.test(label)
          ? {
              verdict: 'FAIL',
              findings: 'wrong copy',
              rewrite: 'Open the page.\n\n**Expect:** "Done"',
            }
          : { verdict: 'PASS', findings: 'holds' },
    });
    // Two steps per entry, so one drafter hands its checkers ten units.
    const reply = (label, prompt) => {
      const answer = base(label, prompt);
      if (label !== 'draft:frontend') return answer;
      return {
        ...answer,
        steps: answer.steps.flatMap((step) => [
          step,
          { ...step, title: `${step.title} again` },
        ]),
      };
    };
    const { calls, logs, result } = await runWorkflow(
      source,
      prArgs({ frontend: true }),
      { reply },
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
      /Frontend \d+ — See frontend-4 again\*\*\n\nOpen the page\.\n\n\*\*Expect:\*\* "Done"/,
    );
  });

  it('splits a human section across drafters, eight entries each, with one opening step', async () => {
    const source = await prWorkflow('webapp');
    const { calls, result } = await runWorkflow(
      source,
      prArgs({ frontend: true }),
      { reply: prReplies({ human: 10 }) },
    );

    const first = find(calls, 'draft:frontend:1');
    const second = find(calls, 'draft:frontend:2');
    assert.equal(promptEntries(first.prompt).length, 8);
    assert.equal(promptEntries(second.prompt).length, 2);
    assert.match(first.prompt, /Step 1 is signing in/);
    assert.doesNotMatch(second.prompt, /Step 1 is/);
    assert.match(
      second.prompt,
      /Another drafter writes the section's opening step/,
    );
    assert.match(second.prompt, /you are\nnumber 2/);
    assert.ok(find(calls, 'verify:frontend:2'));
    assert.equal(result.stats.humanDrafters, 2);
    assert.equal(result.stats.steps, 10);
    // Both drafters report the same gap; it is listed once.
    assert.equal(
      result.gaps.filter((gap) => gap.gap === 'screen reader output').length,
      1,
    );
  });

  it('asks each checker for a verdict per unit id, under a sound schema', async () => {
    const source = await prWorkflow('webapp');
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
    const source = await prWorkflow('webapp');
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
    const source = await prWorkflow('webapp');
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
    const source = await prWorkflow('webapp');
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
  it('lays out the web app checklist', async () => {
    const source = await prWorkflow('webapp');
    const { result } = await runWorkflow(
      source,
      prArgs({ backend: true, frontend: true }),
      { reply: prReplies() },
    );
    const text = result.checklist;

    const order = [
      '```bash\nnpm run dev\n```',
      '## Agent-Runnable Backend Checks',
      '## Human Browser Checks',
      "**When you're finished**, stop the stack: `npm run db:stop`",
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
    assert.match(
      gapText(result),
      /- screen reader output — needs a screen reader/,
    );
    // The published checklist holds only steps; gaps stay in the result.
    assert.doesNotMatch(text, /Not covered|screen reader output/);
    assert.match(
      text,
      /- \[ \] Review agents \(run locally before merge\)\n- \[ \] Full test suite passes/,
    );
    assert.match(
      text,
      /Storybook tests run on demand: `gh workflow run storybook\.yml --ref feature\/thing`\./,
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
    const source = await prWorkflow('webapp');
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
                  actors: 'member',
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

describe('pr workflow — a section split between an agent and a person', () => {
  const split = (agent) => ({
    sections: {
      ...webapp.sections,
      frontend: {
        ...webapp.sections.frontend,
        title: 'Human UI / UX Checks',
        agent: { title: 'Agent-Runnable Frontend Checks', ...agent },
      },
    },
  });

  it('writes the agent half, then the human half, numbering on from one to the next', async () => {
    const source = await prWorkflow(
      'webapp',
      split({ note: 'Console snippets run through `javascript_tool`.' }),
    );
    const { result, calls } = await runWorkflow(
      source,
      prArgs({ backend: true, frontend: true }, { storyCount: 1 }),
      {
        reply: prReplies({
          human: 3,
          runner: (entry) => (entry.id === 'frontend-2' ? 'human' : 'agent'),
        }),
      },
    );
    const text = result.checklist;

    const order = [
      '## Agent-Runnable Backend Checks',
      '## Agent-Runnable Frontend Checks',
      '## Human UI / UX Checks',
      '## Storybook Review Checks',
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
      /## Agent-Runnable Frontend Checks\n\n_Claude in Chrome runs these\. About 6 minutes; 1 of 2 steps are blocking\. Paste what you observed under each step\._\n\n> \[!NOTE\]\n> Console snippets run through `javascript_tool`\.\n\n- \[ \] \*\*\[blocking\] Frontend 1 — See frontend-1\*\*/,
    );
    assert.match(text, /\*\*\[if-time\] Frontend 2 — See frontend-3\*\*/);
    assert.match(
      text,
      /## Human UI \/ UX Checks\n\n_About 3 minutes; 0 of 1 steps are blocking\._\n\n- \[ \] \*\*\[if-time\] Frontend 3 — See frontend-2\*\*/,
    );

    assert.match(find(calls, 'draft:frontend').prompt, /## Who runs each step/);
    assert.doesNotMatch(find(calls, 'draft:backend').prompt, /Who runs/);
    assert.match(find(calls, 'verify:frontend').prompt, /11\. RUNNER/);
    assert.deepEqual(
      promptUnits(find(calls, 'verify:frontend').prompt).map((u) => u.runner),
      ['agent', 'human', 'agent'],
    );
    assert.equal(result.stats.steps, 7);
  });

  it('moves a step to the half its checker names', async () => {
    const source = await prWorkflow('webapp', split());
    const { result } = await runWorkflow(
      source,
      prArgs({ backend: true, frontend: true }),
      {
        reply: prReplies({
          runner: () => 'agent',
          verify: (label, unit) => ({
            verdict: 'PASS',
            findings: 'holds',
            ...(unit.body.includes('frontend-2') ? { runner: 'human' } : {}),
          }),
        }),
      },
    );

    assert.match(
      result.checklist,
      /## Human UI \/ UX Checks\n\n_About 3 minutes; 0 of 1 steps are blocking\._\n\n- \[ \] \*\*\[if-time\] Frontend 2 — See frontend-2\*\*/,
    );
    assert.doesNotMatch(result.checklist, /> \[!NOTE\]/);
  });

  it('says so when either half is empty, and treats a step with no runner as a person’s', async () => {
    const source = await prWorkflow(
      'webapp',
      split({ runs: 'An agent runs these' }),
    );

    const allAgent = await runWorkflow(
      source,
      prArgs({ backend: true, frontend: true }),
      { reply: prReplies({ runner: () => 'agent' }) },
    );
    assert.match(
      allAgent.result.checklist,
      /_An agent runs these\. About 6 minutes;/,
    );
    assert.match(
      allAgent.result.checklist,
      /## Human UI \/ UX Checks\n\n_Every check above can be run by an agent; nothing here needs a person's judgement\._/,
    );

    const noRunner = await runWorkflow(
      source,
      prArgs({ backend: true, frontend: true }),
      { reply: prReplies() },
    );
    assert.match(
      noRunner.result.checklist,
      /## Agent-Runnable Frontend Checks\n\n_No step here can be run by an agent\._/,
    );
    assert.match(noRunner.result.checklist, /Frontend 1 — See frontend-1/);
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

  it('leaves backend-only boot variables out when the diff needs only a page', async () => {
    const source = await prWorkflow('webapp');
    const { calls } = await runWorkflow(
      source,
      prArgs(
        { frontend: true },
        { triage: { touches: ['page'], outsideRepo: [] } },
      ),
      { reply: prReplies({ triage: { touches: [] } }) },
    );
    const boot = find(calls, 'draft:boot').prompt;

    assert.match(boot, /\\\$PORT — the dev server port/);
    assert.doesNotMatch(boot, /TOKEN/);
    assert.doesNotMatch(find(calls, 'draft:frontend').prompt, /TOKEN/);
  });

  it('boots only what the diff needs, and skips the boot block when that is nothing', async () => {
    const boot = {
      start: [
        { run: 'npm run db:start', when: ['database'] },
        { run: 'npm run dev', when: ['api', 'page'] },
      ],
      stop: { run: 'npm run db:stop', when: ['database'] },
      variables: {
        PORT: { from: 'the dev server port', when: ['api', 'page'] },
      },
    };
    const source = await prWorkflow('webapp', { boot });
    const pageOnly = await runWorkflow(
      source,
      prArgs(
        { frontend: true },
        { triage: { touches: ['page'], outsideRepo: [] } },
      ),
      { reply: prReplies({ triage: { touches: [] } }) },
    );
    const prompt = find(pageOnly.calls, 'draft:boot').prompt;

    assert.match(prompt, /```bash\nnpm run dev\n```/);
    assert.match(prompt, /needs page running/);
    assert.match(prompt, /FIVE caveat lines at most/);
    assert.doesNotMatch(pageOnly.result.checklist, /db:stop/);

    const nothing = await runWorkflow(
      source,
      prArgs({ backend: true }, { triage: { touches: [], outsideRepo: [] } }),
      { reply: prReplies({ triage: { touches: [] } }) },
    );
    assert.ok(!labels(nothing.calls).includes('draft:boot'));
    assert.match(
      find(nothing.calls, 'draft:backend').prompt,
      /\(none — this diff needs nothing started\)/,
    );
    assert.match(
      nothing.result.checklist,
      /^_Triage: [^\n]*_\n\n---\n\n## Agent-Runnable Backend Checks/,
    );
  });

  it('tells every drafter and verifier never to run anything', async () => {
    const source = await prWorkflow('webapp');
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
    assert.match(find(calls, 'verify:backend').prompt, /Never run the test/);
  });
});

describe('pr workflow — edges', () => {
  it('numbers each audit angle’s entries apart, so their ids never collide', async () => {
    const source = await prWorkflow('webapp');
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
    const source = await prWorkflow('webapp');
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
                    actors: 'member',
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
    assert.doesNotMatch(result.checklist, /_Nothing a signed-in member/);
  });

  it('lists entries no section drafts as gaps when the backend section is off', async () => {
    const source = await prWorkflow('webapp');
    const replies = prReplies();
    const { result, logs } = await runWorkflow(
      source,
      prArgs({ frontend: true }),
      { reply: replies },
    );

    assert.match(
      gapText(result),
      /- a rejected caller \(src\/service\/file0\.ts:99\) — no checklist section drafts it, since the backend section is off/,
    );
    assert.ok(
      logs.includes('1 entries have no section to draft them — listed as gaps'),
    );
  });

  it('stops when the context pack fails', async () => {
    const source = await prWorkflow('webapp');
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
    const source = await prWorkflow('webapp');
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
      gapText(result),
      /- backend:Check be-1 — never verified — the checker gave no verdict for it/,
    );
    assert.ok(
      logs.includes(
        'Left out, never verified (the checker gave no verdict for it): backend:Check be-1',
      ),
    );
  });

  it('leaves out every unit of a checker that returned nothing', async () => {
    const source = await prWorkflow('webapp');
    const replies = prReplies();
    const { result } = await runWorkflow(source, prArgs({ frontend: true }), {
      reply: (label, prompt) =>
        label === 'verify:frontend' ? null : replies(label, prompt),
    });

    assert.deepEqual(result.unresolved, [
      'frontend:See frontend-1',
      'frontend:See frontend-2',
    ]);
    assert.doesNotMatch(result.checklist, /## Human Browser Checks/);
    assert.match(
      gapText(result),
      /- frontend:See frontend-2 — never verified — the checker returned nothing/,
    );
  });

  it('publishes a changed file no surface could be traced to as a gap', async () => {
    const source = await prWorkflow('webapp');
    const replies = prReplies();
    const { result } = await runWorkflow(source, prArgs({ frontend: true }), {
      reply: (label, prompt) =>
        label === 'surfaces:frontend'
          ? { surfaces: [], unresolved: ['src/ui/Orphan.tsx'] }
          : replies(label, prompt),
    });

    assert.match(
      gapText(result),
      /- src\/ui\/Orphan\.tsx — a changed file no surface could be traced to/,
    );
  });

  it('points agents at the per-file patches for a large diff', async () => {
    const source = await prWorkflow('webapp');
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
    const source = await prWorkflow('webapp');
    const { result } = await runWorkflow(source, prArgs({ backend: true }), {
      reply: prReplies({
        verify: (label) =>
          label === 'verify:boot'
            ? { verdict: 'FAIL', findings: 'no port', rewrite: null }
            : { verdict: 'PASS', findings: '' },
      }),
    });

    assert.ok(
      afterTriage(result.checklist).startsWith(
        '> [!WARNING]\n> **This boot block did not pass verification** — the checker found no accurate version: no port. Check each command against the repository before relying on it.\n\n```bash\nnpm run dev\n```',
      ),
    );
    assert.ok(!result.gaps.some((gap) => gap.gap === 'boot'));
    assert.deepEqual(result.unresolved, []);
  });

  it('warns on a boot block still failing after two rounds, keeping the last rewrite', async () => {
    const source = await prWorkflow('webapp');
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
      afterTriage(result.checklist),
      /^> \[!WARNING\]\n> \*\*This boot block did not pass verification\*\* — it still failed after 2 rounds: still no port\./,
    );
    assert.match(result.checklist, /npm run dev -- --port 3000/);
    assert.ok(!result.gaps.some((gap) => gap.gap === 'boot'));
  });

  it('uses the verified rewrite of the boot block', async () => {
    const source = await prWorkflow('webapp');
    const { result } = await runWorkflow(source, prArgs({ backend: true }), {
      reply: prReplies({
        verify: (label) =>
          label === 'verify:boot'
            ? {
                verdict: 'FAIL',
                findings: 'reset missing',
                rewrite: '```bash\nnpm run db:reset\n```',
              }
            : { verdict: 'PASS', findings: '' },
      }),
    });

    assert.ok(
      afterTriage(result.checklist).startsWith(
        '```bash\nnpm run db:reset\n```',
      ),
    );
  });

  it('leaves out a human section that ended with no steps', async () => {
    const source = await prWorkflow('webapp');
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

    assert.doesNotMatch(result.checklist, /## Human Browser Checks/);
    assert.match(
      gapText(result),
      /frontend:See frontend-1 — no accurate manual version/,
    );
  });

  it('files a visible entry under its own section when several are touched', async () => {
    const source = await prWorkflow('webapp', {
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
    const source = await prWorkflow('webapp', {
      boot: {},
      localCiNote: '',
    });
    const { result } = await runWorkflow(source, prArgs({ backend: true }), {
      reply: prReplies(),
    });

    assert.doesNotMatch(result.checklist, /When you're finished/);
    assert.match(
      result.checklist,
      /### Local CI\n\n- \[ \] Review agents \(run locally before merge\)\n- \[ \] Full test suite passes \(unit, integration, e2e — run locally\)$/,
    );
  });

  it('says when steps carry no time estimate', async () => {
    const source = await prWorkflow('webapp');
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

describe('pr workflow — section setup and the On main line', () => {
  it('asks for an On main line and one setup per section, never a step that stands alone', async () => {
    const source = await prWorkflow('webapp');
    const { calls } = await runWorkflow(source, prArgs({ backend: true }), {
      reply: prReplies(),
    });
    const draft = find(calls, 'draft:backend').prompt;

    assert.match(draft, /\*\*On main:\*\* what the tester would see/);
    assert.match(draft, /NO per-step teardown/);
    assert.match(
      draft,
      /Return what your steps need before the first one runs as `setup`/,
    );
    assert.doesNotMatch(draft, /every\s+step runs on its own/);
    assert.deepEqual(find(calls, 'draft:backend').schema.required.slice(0, 2), [
      'setup',
      'teardown',
    ]);
    assert.match(
      find(calls, 'verify:backend').prompt,
      /no On main line is a FAIL/,
    );
  });

  it('verifies each drafter’s setup with its steps, and renders one setup and teardown per section', async () => {
    const source = await prWorkflow('webapp');
    const { result, calls } = await runWorkflow(
      source,
      prArgs({ backend: true }),
      {
        reply: prReplies({
          backend: 10,
          files: 1,
          setup: (label) => ({
            setup: `\`\`\`sql\ninsert into seats -- ${label}\n\`\`\``,
            teardown: `\`\`\`sql\ndelete from seats -- ${label}\n\`\`\``,
          }),
        }),
      },
    );
    const first = find(calls, 'verify:backend:1:b1');

    assert.deepEqual(unitNames(first).slice(0, 2), [
      'setup:backend:1',
      'backend:Check be-1',
    ]);
    assert.match(first.prompt, /For a section setup the checks reduce to/);
    assert.match(
      first.prompt,
      /## Section setup these steps may rely on[^\n]*\n\*\*Setup:\*\*\n\n```sql\ninsert into seats -- draft:backend:1/,
    );

    const section = result.checklist.split(
      '## Agent-Runnable Backend Checks',
    )[1];
    assert.match(
      section,
      /each step\._\n\n\*\*Setup:\*\*\n\n```sql\ninsert into seats -- draft:backend:1\n```\n\n```sql\ninsert into seats -- draft:backend:2\n```\n\n- \[ \] /,
    );
    assert.match(
      section,
      /\*\*Teardown:\*\*\n\n```sql\ndelete from seats -- draft:backend:1\n```\n\n```sql\ndelete from seats -- draft:backend:2\n```/,
    );
    assert.equal(
      (result.checklist.match(/\*\*Teardown:\*\*/g) ?? []).length,
      1,
    );
    assert.ok(!result.gaps.some((gap) => gap.gap.startsWith('setup:')));
  });

  it('keeps a setup that failed verification, under a warning', async () => {
    const source = await prWorkflow('webapp');
    const { result } = await runWorkflow(source, prArgs({ backend: true }), {
      reply: prReplies({
        setup: () => ({ setup: 'insert a seat', teardown: '' }),
        verify: (label) =>
          label === 'verify:setup:backend'
            ? { verdict: 'DELETE', findings: 'no seats table' }
            : { verdict: 'PASS', findings: '' },
      }),
    });

    assert.match(
      result.checklist,
      /\*\*Setup:\*\*\n\n> \[!WARNING\]\n> \*\*This setup did not pass verification\*\* — no seats table\. Check it against the repository before relying on it\.\n\ninsert a seat/,
    );
  });
});

describe('pr workflow — stronger checks', () => {
  it('tells checkers to delete vacuous and covered steps and to fix fragile proofs', async () => {
    const source = await prWorkflow('webapp');
    const { calls } = await runWorkflow(source, prArgs({ backend: true }), {
      reply: prReplies(),
    });
    const prompt = find(calls, 'verify:backend').prompt;

    assert.match(
      prompt,
      /4\. DISCRIMINATING[\s\S]*proves\s+nothing: DELETE it/,
    );
    assert.match(
      prompt,
      /9\. COVERED[\s\S]*DELETE the step and name the test file/,
    );
    assert.match(prompt, /10\. FRAGILE[\s\S]*`grep -c`/);
    assert.match(prompt, /## Tests that exist\n- `src\/a\.test\.ts` — a works/);
  });

  it('drops a step repeating another in its section, seen across checker batches', async () => {
    const source = await prWorkflow('webapp');
    const { result, calls } = await runWorkflow(
      source,
      prArgs({ backend: true }),
      {
        reply: prReplies({
          backend: 10,
          duplicates: (label, steps) => {
            const id = (title) => steps.find((step) => step.title === title).id;
            return [
              {
                id: id('Check be-10'),
                duplicateOf: id('Check be-1'),
                why: 'same status code',
              },
              // Keeping be-10 for be-1 as well would lose both; the second drop is refused.
              {
                id: id('Check be-1'),
                duplicateOf: id('Check be-10'),
                why: 'loop',
              },
              { id: 's99', duplicateOf: id('Check be-2'), why: 'made up' },
            ];
          },
        }),
      },
    );
    const pass = find(calls, 'duplicates:backend');

    assert.equal(pass.model, 'sonnet');
    assert.equal(JSON.parse(pass.prompt.split('## The steps\n')[1]).length, 11);
    assert.doesNotMatch(result.checklist, /Check be-10\b/);
    assert.match(result.checklist, /Check be-1\b/);
    assert.equal(result.stats.duplicates, 1);
    assert.equal(result.stats.steps, 10);
  });

  it('skips the duplicate pass for a section with one step', async () => {
    const source = await prWorkflow('webapp', {
      experiments: { dropCrossCutting: true },
    });
    const { calls } = await runWorkflow(source, prArgs({ backend: true }), {
      reply: prReplies({ backend: 1 }),
    });

    assert.deepEqual(unitNames(find(calls, 'verify:backend')), [
      'backend:Check be-1',
    ]);
    assert.ok(!labels(calls).includes('duplicates:backend'));
  });
});

describe('pr workflow — budget', () => {
  it('gives each drafter its share of the step cap for the triage size', async () => {
    const source = await prWorkflow('webapp', { budget: { small: 4 } });
    const { calls } = await runWorkflow(source, prArgs({ backend: true }), {
      reply: prReplies({ backend: 7, triage: { size: 'small' } }),
    });
    const drafts = calls.filter((c) => c.label.startsWith('draft:backend'));

    // Eight entries: seven backend plus the cross-cutting one, in one drafter.
    assert.equal(drafts.length, 1);
    assert.match(
      drafts[0].prompt,
      /a budget of 4 steps and 30\s+minutes, and your share is about 4 step\(s\)/,
    );
  });

  it('cuts if-time steps, longest first, until the checklist fits, and never a blocking one', async () => {
    const source = await prWorkflow('webapp', {
      budget: { large: 3, minutes: 100 },
    });
    const { result } = await runWorkflow(
      source,
      prArgs({ backend: true, frontend: true }),
      {
        reply: prReplies({ backend: 2, human: 4 }),
      },
    );

    // Three blocking backend steps and one blocking frontend step already exceed the cap of three.
    assert.equal(result.stats.cutForBudget, 3);
    assert.doesNotMatch(result.checklist, /\[if-time\]/);
    assert.match(result.checklist, /\[blocking\] Backend 3/);
    assert.match(
      gapText(result),
      /frontend:See frontend-4 — cut to keep the checklist within 3 steps and 100 minutes/,
    );
    assert.match(
      gapText(result),
      /the checklist is over budget — its blocking steps alone come to 4 steps and about 9 minutes, over the budget of 3 steps and 100 minutes/,
    );
  });

  it('cuts for the minutes target too', async () => {
    const source = await prWorkflow('webapp', { budget: { minutes: 10 } });
    const { result } = await runWorkflow(source, prArgs({ frontend: true }), {
      reply: prReplies({ human: 4 }),
    });

    // Four 3-minute steps: one if-time step goes to bring 12 minutes under 10.
    assert.equal(result.stats.cutForBudget, 1);
    assert.equal(result.stats.steps, 3);
  });
});

describe('pr workflow — format check and grouping rules', () => {
  it('names every format problem a script can see', async () => {
    const source = await prWorkflow('webapp');
    const replies = prReplies({ backend: 1 });
    const { calls } = await runWorkflow(source, prArgs({ backend: true }), {
      reply: (label, prompt) => {
        const reply = replies(label, prompt);
        if (label === 'draft:backend') {
          reply.steps = [
            {
              title: 'Messy',
              priority: 'blocking',
              body: 'curl x\n\n**If wrong:** x\n\n**Expect:** `200`\n\n**Teardown:** `delete`',
              coversEntryIds: ['be-1'],
              minutes: 1,
            },
          ];
        }
        return reply;
      },
    });

    const fix = find(calls, 'format:backend:Messy');
    assert.match(fix.prompt, /has its own \*\*Teardown:\*\*/);
    assert.match(fix.prompt, /a terminal step with no fenced command block/);
    assert.match(fix.prompt, /labels out of order/);
    assert.doesNotMatch(fix.prompt, /no \*\*Expect:\*\* line/);
  });

  it('splits one file’s entries when there are more than a drafter takes', async () => {
    const source = await prWorkflow('webapp');
    const { calls } = await runWorkflow(source, prArgs({ backend: true }), {
      reply: prReplies({ backend: 10, files: 1 }),
    });

    const sizes = calls
      .filter((c) => c.label.startsWith('draft:backend'))
      .map((c) => promptEntries(c.prompt).length);
    assert.deepEqual(sizes, [8, 3]);
  });
});
