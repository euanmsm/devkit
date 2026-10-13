// ============================================================================
// Manual QA Gate Tests
// ============================================================================
//
// The decisions that block a merge, plus checklists split across comments and
// the GitHub API half, run against a fake API.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { qaGate } from '../src/pr/cli.mjs';
import { buildComments } from '../src/pr/publish.mjs';
import { balancedToggles } from './pr-helpers.mjs';
import {
  CHECKLIST_MARKER,
  canPush,
  computeStatus,
  countBoxes,
  findChecklistComments,
  githubClient,
  isCollapsed,
  listedSteps,
  partMarker,
  readGateEnv,
  readStampedSha,
  resetBody,
  runGate,
  listedStaleSteps,
  staleSteps,
} from '../src/pr/gate.mjs';

const HEAD_SHA = 'def5678def5678def5678def5678def5678def56';
const OLD_SHA = 'abc1234abc1234abc1234abc1234abc1234abc12';
const NOW = new Date(Date.UTC(2026, 7, 18, 14, 2, 0));

/**
 * A checklist body in the shape `/pr` posts.
 *
 * @param options - The stamped `sha`, an existing `banner`, and `extra` markdown after the boxes
 * @returns The body
 */
function checklist({ sha = OLD_SHA, banner = '', extra = '' } = {}) {
  return [
    '<!-- pr-qa:manual-checklist -->',
    `<!-- pr-qa:sha=${sha} -->`,
    '<!-- pr-qa:banner:start -->',
    banner,
    '<!-- pr-qa:banner:end -->',
    '',
    `## Manual QA — \`${sha.slice(0, 7)}\``,
    '',
    '- [x] **[blocking]** Sign in as an admin',
    '    - [X] Nested step, ticked',
    '- [ ] **[if time]** Keyboard pass',
    '',
    '---',
    '',
    '### Local CI',
    '',
    '- [x] Unit tests',
    '- [ ] E2E tests',
    extra,
  ].join('\n');
}

/**
 * A continuation comment of a split checklist.
 *
 * @param part - Its part number
 * @param sha - The stamped SHA
 * @param boxes - Its box lines
 * @returns The body
 */
function part(part, sha, boxes = ['- [x] More', '- [ ] Even more']) {
  return [
    partMarker(part),
    `<!-- pr-qa:sha=${sha} -->`,
    '',
    `## Manual QA — \`${sha.slice(0, 7)}\` (part ${part} of 2)`,
    '',
    ...boxes,
  ].join('\n');
}

/** Each fake user's answer from the permission API; a missing login fails the lookup. */
const ROLES = {
  dev: { permission: 'write', role_name: 'write' },
  lead: { permission: 'admin', role_name: 'maintain' },
  reader: { permission: 'read', role_name: 'triage' },
};

/** The logins the gate would trust, from `ROLES`. */
const TRUSTED = new Set(
  Object.keys(ROLES).filter((login) => canPush(ROLES[login])),
);

/**
 * Marks a comment as written by someone who can push, unless it names another author.
 *
 * @param comment - A comment without a `user`
 * @returns The comment, from `dev` unless it names another user
 */
const member = (comment) => ({ user: { login: 'dev' }, ...comment });

const main = (comments) =>
  findChecklistComments(comments.map(member), TRUSTED).main;

describe('findChecklistComments', () => {
  it('returns nothing when no comment carries the marker', () => {
    assert.deepEqual(
      findChecklistComments([{ id: 1, body: 'LGTM' }], TRUSTED),
      { main: null, parts: [] },
    );
  });

  it('picks the marked comment among unmarked ones, and the newest of two', () => {
    assert.equal(
      main([
        { id: 1, body: 'LGTM' },
        { id: 2, body: checklist() },
        { id: 3, body: 'x' },
      ]).id,
      2,
    );
    assert.equal(
      main([
        { id: 1, body: checklist() },
        { id: 3, body: checklist() },
      ]).id,
      3,
    );
  });

  it('survives an empty list and comments with no body', () => {
    assert.equal(main([]), null);
    assert.equal(main([{ id: 1 }]), null);
    assert.deepEqual(findChecklistComments(undefined, TRUSTED), {
      main: null,
      parts: [],
    });
  });

  it('ignores a quote-reply that copied the checklist', () => {
    const real = checklist({ sha: HEAD_SHA });
    const quoted = `${real
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n')}\n\nGood point, will do.`;
    const picked = main([
      { id: 1, body: real },
      { id: 2, body: quoted },
    ]);

    assert.equal(picked.id, 1);
    assert.equal(
      computeStatus({ main: picked, headSha: HEAD_SHA }).state,
      'failure',
    );
  });

  it('ignores a comment that merely mentions the marker', () => {
    assert.equal(
      main([{ id: 1, body: 'why did `pr-qa:manual-checklist` not reset?' }]),
      null,
    );
  });

  it('ignores a checklist or part posted by someone who cannot push', () => {
    const forged = `${CHECKLIST_MARKER}\n<!-- pr-qa:sha=${HEAD_SHA} -->\n\n- [x] done`;
    const found = findChecklistComments(
      [
        { id: 1, user: { login: 'dev' }, body: checklist() },
        { id: 2, user: { login: 'lead' }, body: part(2, OLD_SHA) },
        { id: 3, user: { login: 'reader' }, body: forged },
        { id: 4, user: { login: 'stranger' }, body: part(2, HEAD_SHA) },
        { id: 5, body: forged },
      ],
      TRUSTED,
    );

    assert.equal(found.main.id, 1);
    assert.deepEqual(
      found.parts.map((p) => p.comment.id),
      [2],
    );
    assert.equal(
      computeStatus({ ...found, headSha: HEAD_SHA }).state,
      'failure',
    );
    assert.equal(
      main([{ id: 6, user: { login: 'lead' }, body: forged }]).id,
      6,
    );
  });

  it('trusts write access and above, whatever the association says', () => {
    assert.ok(canPush({ permission: 'write', role_name: 'write' }));
    assert.ok(canPush({ permission: 'admin', role_name: 'admin' }));
    assert.ok(canPush({ permission: 'write', role_name: 'maintain' }));
    assert.ok(!canPush({ permission: 'read', role_name: 'triage' }));
    assert.ok(!canPush({ permission: 'none', role_name: 'none' }));
    assert.ok(!canPush(null));
  });

  it('collects continuation parts in order, keeping the newest of each', () => {
    const found = findChecklistComments(
      [
        { id: 1, body: checklist() },
        { id: 2, body: part(3, OLD_SHA) },
        { id: 3, body: part(2, OLD_SHA) },
        { id: 4, body: part(2, OLD_SHA) },
        { id: 5, body: `> ${part(2, OLD_SHA)}` },
      ].map(member),
      TRUSTED,
    );

    assert.equal(found.main.id, 1);
    assert.deepEqual(
      found.parts.map((p) => [p.part, p.comment.id]),
      [
        [2, 4],
        [3, 2],
      ],
    );
  });
});

describe('readStampedSha', () => {
  it('reads the marker, or null when there is none', () => {
    assert.equal(readStampedSha(checklist({ sha: OLD_SHA })), OLD_SHA);
    assert.equal(readStampedSha('## Manual QA\n\n- [ ] Something'), null);
    assert.equal(readStampedSha(''), null);
    assert.equal(readStampedSha(undefined), null);
  });
});

describe('countBoxes', () => {
  it('counts ticked and unticked boxes at any indent depth', () => {
    assert.deepEqual(countBoxes(checklist()), {
      total: 5,
      ticked: 3,
      unticked: 2,
    });
  });

  it('returns zeroes with no boxes, and for the no-manual-checks case', () => {
    const none = { total: 0, ticked: 0, unticked: 0 };
    assert.deepEqual(
      countBoxes(checklist().replace(/^[ \t]*[-*+] \[.\].*$/gm, '')),
      none,
    );
    assert.deepEqual(
      countBoxes(
        '<!-- pr-qa:manual-checklist -->\n\n_No manual checks needed — no runtime surface touched._',
      ),
      none,
    );
    assert.deepEqual(countBoxes(undefined), none);
  });

  it('does not count boxes inside a fenced code block', () => {
    const body = checklist({
      extra: '\n```markdown\n- [x] A sample, not a box\n- [ ] Nor this\n```',
    });
    assert.deepEqual(countBoxes(body), { total: 5, ticked: 3, unticked: 2 });
  });

  it('counts `*` and `+` bullets, which GitHub also renders as tasks', () => {
    assert.deepEqual(countBoxes('* [x] Star\n+ [ ] Plus'), {
      total: 2,
      ticked: 1,
      unticked: 1,
    });
  });

  it('counts ordered items and wider gaps, which GitHub also renders as tasks', () => {
    assert.deepEqual(
      countBoxes('1. [ ] Safari\n2) [x] Firefox\n-  [x] Wide\n-\t[ ] Tab'),
      { total: 4, ticked: 2, unticked: 2 },
    );
  });

  it('ignores a bracket pair that is not a task item', () => {
    assert.deepEqual(
      countBoxes(
        '- [link](https://example.com)\n- [TODO] not a box\n-[ ] no space',
      ),
      { total: 0, ticked: 0, unticked: 0 },
    );
  });

  it('closes a fence in a CRLF body so later boxes still count', () => {
    const body = [
      '- [x] Before',
      '',
      '```bash',
      'npm run dev',
      '```',
      '',
      '- [x] After',
    ].join('\r\n');
    assert.deepEqual(countBoxes(body), { total: 2, ticked: 2, unticked: 0 });
  });
});

describe('resetBody', () => {
  it('un-ticks `- [x]` and `- [X]` at any indent depth', () => {
    const result = resetBody(checklist(), { headSha: HEAD_SHA, now: NOW });

    assert.deepEqual(countBoxes(result), { total: 5, ticked: 0, unticked: 5 });
    assert.ok(result.includes('- [ ] **[blocking]** Sign in as an admin'));
    assert.ok(result.includes('    - [ ] Nested step, ticked'));
  });

  it('un-ticks ordered items and wider gaps', () => {
    assert.equal(
      resetBody('1. [x] Safari\n-  [X] Wide', { headSha: HEAD_SHA, now: NOW }),
      '1. [ ] Safari\n-  [ ] Wide',
    );
  });

  it('leaves already-unticked boxes alone', () => {
    assert.equal(
      resetBody('- [ ] Keyboard pass', { headSha: HEAD_SHA, now: NOW }),
      '- [ ] Keyboard pass',
    );
  });

  it('leaves everything that is not a box byte-for-byte identical', () => {
    const result = resetBody(checklist(), { headSha: HEAD_SHA, now: NOW });
    const strip = (body) =>
      body
        .split('\n')
        .filter(
          (line) =>
            !/^[ \t]*[-*+] \[/.test(line) &&
            !line.includes('pr-qa:sha=') &&
            !line.startsWith('## Manual QA'),
        )
        .join('\n');

    assert.equal(
      strip(result).replace(
        /<!-- pr-qa:banner:start -->[\s\S]*<!-- pr-qa:banner:end -->/,
        'X',
      ),
      strip(checklist()).replace(
        '<!-- pr-qa:banner:start -->\n\n<!-- pr-qa:banner:end -->',
        'X',
      ),
    );
  });

  it('does not rewrite anything inside a fenced code block', () => {
    const fence =
      "```markdown\n- [x] Sample ticked box\n```\n\n```sql\nupdate orgs set status = 'active';\n```";
    const result = resetBody(checklist({ extra: `\n${fence}` }), {
      headSha: HEAD_SHA,
      now: NOW,
    });

    assert.ok(result.includes('- [x] Sample ticked box'));
    assert.ok(result.includes("update orgs set status = 'active';"));
  });

  it('does not rewrite inside a tilde fence wrapping backtick fences', () => {
    const body = [
      '- [x] Real box',
      '',
      '~~~markdown',
      '```bash',
      'npm run dev',
      '```',
      '- [x] Inside',
      '~~~',
    ].join('\n');
    const result = resetBody(body, { headSha: HEAD_SHA, now: NOW });

    assert.ok(result.includes('- [ ] Real box'));
    assert.ok(result.includes('- [x] Inside'));
  });

  it('un-ticks past a fence in a CRLF body, keeping the line endings', () => {
    const body = [
      `<!-- pr-qa:sha=${OLD_SHA} -->`,
      '- [x] Before',
      '',
      '```bash',
      'npm run dev',
      '```',
      '',
      '- [x] After',
    ].join('\r\n');
    const result = resetBody(body, { headSha: HEAD_SHA, now: NOW });

    assert.ok(result.includes('- [ ] Before'));
    assert.ok(result.includes('- [ ] After'));
    assert.ok(result.includes('\r\n'));
  });

  it('restamps the marker once and the visible heading', () => {
    const result = resetBody(checklist(), { headSha: HEAD_SHA, now: NOW });

    assert.equal((result.match(/<!--\s*pr-qa:sha=/g) ?? []).length, 1);
    assert.equal(readStampedSha(result), HEAD_SHA);
    assert.ok(result.includes('## Manual QA — `def5678`'));
    assert.ok(!result.includes('## Manual QA — `abc1234`'));
  });

  it('keeps a part suffix on the heading when restamping', () => {
    const result = resetBody(part(2, OLD_SHA), { headSha: HEAD_SHA, now: NOW });
    assert.ok(result.includes('## Manual QA — `def5678` (part 2 of 2)'));
    assert.ok(!result.includes('Reset by push'));
  });

  it('writes a banner naming the push, the time and the cleared ticks', () => {
    const result = resetBody(checklist(), { headSha: HEAD_SHA, now: NOW });

    // One visible line, the rest folded under a toggle.
    assert.match(
      result,
      /<!-- pr-qa:banner:start -->\n\n\*\*⚠️ Reset by push `def5678` — 18 Aug 2026, 14:02 UTC\.\*\* Every box is clear again\.\n\n<details><summary>What the reset changed<\/summary>\n\n/,
    );
    assert.ok(result.includes('ticked 3 of 5 boxes against `abc1234`'));
    assert.match(
      result,
      /ticked again\.\n\n<\/details>\n\n<!-- pr-qa:banner:end -->/,
    );
  });

  it('reports the counts it is given for a checklist spanning comments', () => {
    const result = resetBody(checklist(), {
      headSha: HEAD_SHA,
      now: NOW,
      counts: { total: 9, ticked: 4, unticked: 5 },
    });
    assert.ok(result.includes('ticked 4 of 9 boxes'));
  });

  it('says so when there was no stamp to report', () => {
    const body = checklist().replace(/<!-- pr-qa:sha=\w+ -->\n/, '');
    const result = resetBody(body, { headSha: HEAD_SHA, now: NOW });
    assert.ok(result.includes('\nThe previous pass ticked 3 of 5 boxes.\n'));
  });

  it('produces one banner when run twice, not two stacked ones', () => {
    const twice = resetBody(
      resetBody(checklist(), { headSha: OLD_SHA, now: NOW }),
      { headSha: HEAD_SHA, now: NOW },
    );

    assert.equal((twice.match(/Reset by push/g) ?? []).length, 1);
    assert.equal((twice.match(/<details>/g) ?? []).length, 1);
    assert.ok(twice.includes('Reset by push `def5678`'));
    assert.ok(!twice.includes('Reset by push `abc1234`'));
  });

  it('reports a zero-box checklist honestly', () => {
    const body = [
      '<!-- pr-qa:manual-checklist -->',
      `<!-- pr-qa:sha=${OLD_SHA} -->`,
      '<!-- pr-qa:banner:start -->',
      '<!-- pr-qa:banner:end -->',
      '',
      '_No manual checks needed — no runtime surface touched._',
    ].join('\n');

    assert.ok(
      resetBody(body, { headSha: HEAD_SHA, now: NOW }).includes(
        'The previous checklist carried no boxes.',
      ),
    );
  });

  it('still clears boxes and restamps when the banner markers are missing', () => {
    const body = [
      '<!-- pr-qa:manual-checklist -->',
      `<!-- pr-qa:sha=${OLD_SHA} -->`,
      '',
      '- [x] A box',
    ].join('\n');
    const result = resetBody(body, { headSha: HEAD_SHA, now: NOW });

    assert.ok(result.includes('- [ ] A box'));
    assert.equal(readStampedSha(result), HEAD_SHA);
    assert.ok(!result.includes('Reset by push'));
  });
});

describe('resetBody — observations', () => {
  const steps = [
    '- [x] **Backend 1 — Seat cap**',
    '',
    '  > **Observed** (agent, `abc1234`): 403 first time.',
    '',
    '  > **Failed** (agent, `bcd2345`): 500.',
    '  > Stack trace in the server log.',
    '',
    '  > **Observed** (agent, `cde3456`): 403 with `{"error":"cap"}`.',
    '',
    '- [ ] **Backend 2 — Invite**',
    '',
    '  > **Observed** (person, `abc1234`): sent.',
    '',
    '```markdown',
    '> **Observed** (agent, `abc1234`): a sample in a fence.',
    '> **Observed** (agent, `abc1234`): another sample.',
    '```',
  ].join('\n');

  it('keeps only the latest note under each step, continuation lines and all', () => {
    const result = resetBody(steps, { headSha: HEAD_SHA, now: NOW });

    assert.equal(
      result,
      [
        '- [ ] **Backend 1 — Seat cap**',
        '',
        '  > **Observed** (agent, `cde3456`): 403 with `{"error":"cap"}`.',
        '',
        '- [ ] **Backend 2 — Invite**',
        '',
        '  > **Observed** (person, `abc1234`): sent.',
        '',
        '```markdown',
        '> **Observed** (agent, `abc1234`): a sample in a fence.',
        '> **Observed** (agent, `abc1234`): another sample.',
        '```',
      ].join('\n'),
    );
  });

  it('names a step citing a changed file as possibly stale in the banner', () => {
    const result = resetBody(checklist(), {
      headSha: HEAD_SHA,
      now: NOW,
      staleSteps: ['[blocking] Sign in as an admin'],
      skill: 'ship',
    });

    assert.match(
      result,
      /they are ticked again\.\n\nPushes since this checklist was drafted changed files these steps cite, so they may be stale — re-run `\/ship` to redraft them:\n\n- \[blocking\] Sign in as an admin\n\n<\/details>/,
    );
    assert.deepEqual(listedStaleSteps(result), [
      '[blocking] Sign in as an admin',
    ]);
  });

  it('keeps a step’s own note when a later one sits under the section’s teardown or the next setup', () => {
    const body = [
      '- [x] **Backend 2 — Invite**',
      '',
      '  > **Observed** (agent, `abc1234`): 201, one row.',
      '',
      '**Teardown:**',
      '',
      '> **Observed** (agent, `abc1234`): DELETE 1',
      '',
      '---',
      '',
      '## Frontend',
      '',
      '**Setup:**',
      '',
      '> **Observed** (person, `abc1234`): seeded.',
      '',
      '- [x] **Frontend 1 — Toast**',
    ].join('\n');

    assert.equal(
      resetBody(body, { headSha: HEAD_SHA, now: NOW }),
      body.replace(/- \[x\]/g, '- [ ]'),
    );
  });

  it('drops the fenced output pasted under an older note along with it', () => {
    const body = [
      '- [x] **Backend 3 — Errors**',
      '',
      '> **Observed** (agent, `abc1234`): response body:',
      '',
      '```json',
      '{"error":"internal"}',
      '```',
      '',
      '> **Observed** (agent, `bcd2345`): 403.',
    ].join('\n');

    assert.equal(
      resetBody(body, { headSha: HEAD_SHA, now: NOW }),
      [
        '- [ ] **Backend 3 — Errors**',
        '',
        '> **Observed** (agent, `bcd2345`): 403.',
      ].join('\n'),
    );
  });
});

describe('staleSteps', () => {
  const body = [
    '- [ ] **[blocking] Backend 1 — Seat cap**',
    '',
    '```bash',
    'curl `src/not/a/citation.ts`',
    '```',
    'Reads `apps/main/src/api/seats/route.ts:42`.',
    '- [ ] **[if-time] Backend 2 — Invite**',
    '',
    'See `lib/invite.ts`.',
    '- [ ] **[blocking] Frontend 3 — Toast**',
  ].join('\n');

  it('names the steps citing a file the push changed, matching a path tail too', () => {
    assert.deepEqual(
      staleSteps(body, [
        'apps/main/src/api/seats/route.ts',
        'apps/main/src/lib/invite.ts',
      ]),
      ['[blocking] Backend 1 — Seat cap', '[if-time] Backend 2 — Invite'],
    );
  });

  it('ignores citations inside a fence, and returns nothing for no changes', () => {
    assert.deepEqual(staleSteps(body, ['src/not/a/citation.ts']), []);
    assert.deepEqual(staleSteps(body, []), []);
  });

  it('reads a CRLF body, as GitHub’s web editor saves it', () => {
    assert.deepEqual(
      staleSteps(body.replace(/\n/g, '\r\n'), ['apps/main/src/lib/invite.ts']),
      ['[if-time] Backend 2 — Invite'],
    );
  });

  it('charges no step for a citation in a teardown, a Covered by line, a heading’s setup or the gaps', () => {
    const section = [
      '- [ ] **[blocking] Backend 1 — Seat cap**',
      '',
      '**Teardown:**',
      '',
      'Delete what `db/seed/seats.sql` added.',
      '',
      '**Covered by:** `src/api/seats.test.ts`',
      '',
      '---',
      '',
      '## Frontend',
      '',
      '**Setup:** seed from `db/seed/users.sql`.',
      '',
      '**Not covered here:**',
      '',
      '- `src/lib/mail.ts` retries — needs production',
    ].join('\n');

    assert.deepEqual(
      staleSteps(section, [
        'db/seed/seats.sql',
        'src/api/seats.test.ts',
        'db/seed/users.sql',
        'src/lib/mail.ts',
      ]),
      [],
    );
  });

  it('matches route files, line ranges and root files', () => {
    const routes = [
      '- [ ] **Frontend 1 — Booking**',
      'Open `app/(app)/bookings/[id]/page.tsx:10-20`.',
      '- [ ] **Frontend 2 — Home**',
      'Open `src/routes/+page.svelte`.',
      '- [ ] **Deploy 1 — Host**',
      'Check `vercel.json`.',
    ].join('\n');

    assert.deepEqual(
      staleSteps(routes, [
        'apps/web/app/(app)/bookings/[id]/page.tsx',
        'src/routes/+page.svelte',
        'vercel.json',
      ]),
      ['Frontend 1 — Booking', 'Frontend 2 — Home', 'Deploy 1 — Host'],
    );
    // A bare name matches only the file at the root.
    assert.deepEqual(staleSteps(routes, ['apps/web/vercel.json']), []);
  });
});

describe('computeStatus', () => {
  it('fails when no comment carries the marker', () => {
    assert.deepEqual(computeStatus({ main: null, headSha: HEAD_SHA }), {
      state: 'failure',
      description: 'no QA checklist — run /pr',
    });
  });

  it('fails on a stale stamp, and on no stamp', () => {
    assert.deepEqual(
      computeStatus({
        main: { body: checklist({ sha: OLD_SHA }) },
        headSha: HEAD_SHA,
      }),
      {
        state: 'failure',
        description: 'checklist is for abc1234, head is def5678',
      },
    );
    assert.deepEqual(
      computeStatus({
        main: { body: '<!-- pr-qa:manual-checklist -->\n\n- [x] Box' },
        headSha: HEAD_SHA,
      }),
      {
        state: 'failure',
        description: 'checklist is for no commit, head is def5678',
      },
    );
  });

  it('fails when a part its heading counts is missing', () => {
    const body = checklist({ sha: HEAD_SHA })
      .replace(/- \[ \]/g, '- [x]')
      .replace(/(## Manual QA — `\w+`)/, '$1 (part 1 of 3)');
    const parts = [
      { part: 2, comment: { body: part(2, HEAD_SHA, ['- [x] Done']) } },
    ];

    assert.deepEqual(
      computeStatus({ main: { body }, parts, headSha: HEAD_SHA }),
      {
        state: 'failure',
        description: 'checklist part 3 of 3 is missing — re-run /pr',
      },
    );
  });

  it('fails with boxes outstanding, and succeeds with every box ticked', () => {
    assert.deepEqual(
      computeStatus({
        main: { body: checklist({ sha: HEAD_SHA }) },
        headSha: HEAD_SHA,
      }),
      {
        state: 'failure',
        description: '2 of 5 checks outstanding',
      },
    );

    const ticked = checklist({ sha: HEAD_SHA }).replace(/- \[ \]/g, '- [x]');
    assert.deepEqual(
      computeStatus({ main: { body: ticked }, headSha: HEAD_SHA }),
      {
        state: 'success',
        description: '5 checks ticked against def5678',
      },
    );
  });

  it('succeeds on a zero-box checklist stamped against the head', () => {
    const body = `<!-- pr-qa:manual-checklist -->\n<!-- pr-qa:sha=${HEAD_SHA} -->\n\n_No manual checks needed._`;
    assert.deepEqual(computeStatus({ main: { body }, headSha: HEAD_SHA }), {
      state: 'success',
      description: '0 checks ticked against def5678',
    });
  });

  it('treats a case-different stamp as the same commit', () => {
    const body = checklist({ sha: HEAD_SHA.toUpperCase() }).replace(
      /- \[ \]/g,
      '- [x]',
    );
    assert.equal(
      computeStatus({ main: { body }, headSha: HEAD_SHA }).state,
      'success',
    );
  });

  it('does not contradict itself when the short SHAs collide', () => {
    const { state, description } = computeStatus({
      main: { body: checklist({ sha: HEAD_SHA.slice(0, 8) }) },
      headSha: HEAD_SHA,
    });

    assert.equal(state, 'failure');
    assert.equal(
      description,
      `checklist is for ${HEAD_SHA.slice(0, 8)}, head is ${HEAD_SHA}`,
    );
    assert.ok(description.length <= 140);
  });

  it('counts boxes across every part of a split checklist', () => {
    const body = checklist({ sha: HEAD_SHA }).replace(/- \[ \]/g, '- [x]');
    const parts = [{ part: 2, comment: { body: part(2, HEAD_SHA) } }];

    assert.deepEqual(
      computeStatus({ main: { body }, parts, headSha: HEAD_SHA }),
      {
        state: 'failure',
        description: '1 of 7 checks outstanding',
      },
    );
  });

  it('fails when any part is stamped against another commit', () => {
    const body = checklist({ sha: HEAD_SHA }).replace(/- \[ \]/g, '- [x]');
    const parts = [
      { part: 2, comment: { body: part(2, OLD_SHA, ['- [x] Done']) } },
    ];

    assert.equal(
      computeStatus({ main: { body }, parts, headSha: HEAD_SHA }).description,
      'checklist is for abc1234, head is def5678',
    );
  });

  it('keeps every description inside GitHub’s 140-character limit', () => {
    for (const input of [
      { main: null, headSha: HEAD_SHA },
      { main: { body: checklist({ sha: OLD_SHA }) }, headSha: HEAD_SHA },
      { main: { body: checklist({ sha: HEAD_SHA }) }, headSha: HEAD_SHA },
    ]) {
      assert.ok(computeStatus(input).description.length <= 140);
    }
  });
});

/**
 * A fake GitHub API holding one PR's comments and recording every call.
 *
 * @param comments - The PR's comments
 * @param head - The PR's head SHA
 * @returns The `api` function, its `calls`, and the live `comments`
 */
function fakeApi(comments, head = HEAD_SHA, compare = null) {
  const calls = [];
  const store = comments.map((comment) => ({
    html_url: `https://x/${comment.id}`,
    ...member(comment),
  }));

  const api = async (path, init = {}) => {
    calls.push({
      path,
      method: init.method ?? 'GET',
      body: init.body && JSON.parse(init.body),
    });

    if (path.startsWith('/repos/o/r/pulls/')) return { head: { sha: head } };
    if (path.includes('/compare/')) {
      if (compare instanceof Error) throw compare;
      return typeof compare === 'function' ? compare(path) : compare;
    }
    const who = /\/collaborators\/([^/]+)\/permission$/.exec(path);
    if (who) {
      const answer = ROLES[decodeURIComponent(who[1])];
      if (!answer) throw new Error('GitHub API GET failed: 404');
      return answer;
    }
    if (path.includes('/comments?')) {
      const page = Number(/[?&]page=(\d+)/.exec(path)[1]);
      return store.slice((page - 1) * 100, page * 100);
    }
    if (path.includes('/issues/comments/')) {
      const id = Number(path.split('/').pop());
      const comment = store.find((c) => c.id === id);
      if (init.method === 'PATCH') comment.body = JSON.parse(init.body).body;
      return comment;
    }
    return null;
  };

  return { api, calls, comments: store };
}

describe('runGate', () => {
  it('resets a stale checklist and posts a red status against the head', async () => {
    const { api, calls, comments } = fakeApi([{ id: 7, body: checklist() }]);
    const status = await runGate('reset', {
      api,
      repo: 'o/r',
      prNumber: '5',
      headSha: HEAD_SHA,
      now: NOW,
    });

    assert.deepEqual(status, {
      headSha: HEAD_SHA,
      state: 'failure',
      description: '5 of 5 checks outstanding',
    });
    assert.equal(readStampedSha(comments[0].body), HEAD_SHA);
    const post = calls.at(-1);
    assert.equal(post.path, `/repos/o/r/statuses/${HEAD_SHA}`);
    assert.deepEqual(post.body, {
      state: 'failure',
      description: '5 of 5 checks outstanding',
      context: 'Manual QA',
      target_url: 'https://x/7',
    });
  });

  it('names the steps a push may have made stale, from the files GitHub says changed', async () => {
    const body = checklist({
      extra: '\n- [ ] **Backend 9 — Seats**\n\nReads `src/api/seats.ts:3`.',
    });
    const { api, calls, comments } = fakeApi([{ id: 7, body }], HEAD_SHA, {
      files: [
        { filename: 'src/api/seats.ts' },
        { filename: 'README.md', previous_filename: 'docs/old.md' },
      ],
    });

    await runGate('reset', {
      api,
      repo: 'o/r',
      prNumber: '5',
      headSha: HEAD_SHA,
      now: NOW,
      skill: 'pr',
    });

    assert.ok(
      calls.some(
        (c) => c.path === `/repos/o/r/compare/${OLD_SHA}...${HEAD_SHA}`,
      ),
    );
    assert.match(
      comments[0].body,
      /may be stale — re-run `\/pr` to redraft them:\n\n- Backend 9 — Seats\n/,
    );
  });

  it('after a force-push, names only the files that differ between the two commits', async () => {
    const body = checklist({
      extra: [
        '',
        '- [ ] **Backend 8 — Same**',
        '',
        'Reads `src/same.ts`.',
        '',
        '- [ ] **Backend 9 — Seats**',
        '',
        'Reads `src/api/seats.ts:3`.',
        '',
        '- [ ] **Backend 10 — Gone**',
        '',
        'Reads `src/gone.ts`.',
      ].join('\n'),
    });
    // Each side as compared with the merge base: src/same.ts is identical in both.
    const { api, comments } = fakeApi([{ id: 7, body }], HEAD_SHA, (path) =>
      path.endsWith(`${OLD_SHA}...${HEAD_SHA}`)
        ? {
            status: 'diverged',
            files: [
              { filename: 'src/same.ts', sha: 's1' },
              { filename: 'src/api/seats.ts', sha: 'new' },
            ],
          }
        : {
            status: 'diverged',
            files: [
              { filename: 'src/same.ts', sha: 's1' },
              { filename: 'src/api/seats.ts', sha: 'old' },
              { filename: 'src/gone.ts', sha: 'g1' },
            ],
          },
    );

    await runGate('reset', {
      api,
      repo: 'o/r',
      prNumber: '5',
      headSha: HEAD_SHA,
      now: NOW,
    });

    assert.match(
      comments[0].body,
      /redraft them:\n\n- Backend 9 — Seats\n- Backend 10 — Gone\n/,
    );
    assert.doesNotMatch(comments[0].body, /- Backend 8/);
  });

  it('keeps naming a step a push flagged until the checklist is redrafted', async () => {
    const body = checklist({
      extra: '\n- [ ] **Backend 9 — Seats**\n\nReads `src/api/seats.ts:3`.',
    });
    const first = fakeApi([{ id: 7, body }], HEAD_SHA, {
      files: [{ filename: 'src/api/seats.ts' }],
    });
    await runGate('reset', {
      api: first.api,
      repo: 'o/r',
      prNumber: '5',
      headSha: HEAD_SHA,
      now: NOW,
    });

    const NEXT_SHA = '9876543987654398765439876543987654398765';
    const second = fakeApi(
      [{ id: 7, body: first.comments[0].body }],
      NEXT_SHA,
      {
        files: [{ filename: 'README.md' }],
      },
    );
    await runGate('reset', {
      api: second.api,
      repo: 'o/r',
      prNumber: '5',
      headSha: NEXT_SHA,
      now: NOW,
    });

    assert.equal(readStampedSha(second.comments[0].body), NEXT_SHA);
    assert.match(second.comments[0].body, /\n- Backend 9 — Seats\n/);
  });

  it('still resets when GitHub cannot compare the commits', async () => {
    const { api, comments } = fakeApi(
      [{ id: 7, body: checklist() }],
      HEAD_SHA,
      new Error('404'),
    );

    await runGate('reset', {
      api,
      repo: 'o/r',
      prNumber: '5',
      headSha: HEAD_SHA,
      now: NOW,
    });

    assert.equal(readStampedSha(comments[0].body), HEAD_SHA);
    assert.doesNotMatch(comments[0].body, /may be stale/);
  });

  it('leaves a checklist already stamped against the head alone', async () => {
    const ticked = checklist({ sha: HEAD_SHA }).replace(/- \[ \]/g, '- [x]');
    const { api, calls } = fakeApi([{ id: 7, body: ticked }]);
    const status = await runGate('reset', {
      api,
      repo: 'o/r',
      prNumber: '5',
      headSha: HEAD_SHA,
    });

    assert.equal(status.state, 'success');
    assert.ok(!calls.some((call) => call.method === 'PATCH'));
  });

  it('resets every part of a split checklist, with the combined counts in the banner', async () => {
    const { api, calls, comments } = fakeApi([
      { id: 1, body: checklist() },
      { id: 2, body: part(2, OLD_SHA) },
    ]);
    await runGate('reset', {
      api,
      repo: 'o/r',
      prNumber: '5',
      headSha: HEAD_SHA,
      now: NOW,
    });

    assert.equal(calls.filter((call) => call.method === 'PATCH').length, 2);
    assert.ok(comments[0].body.includes('ticked 4 of 7 boxes'));
    assert.equal(countBoxes(comments[1].body).ticked, 0);
    assert.equal(readStampedSha(comments[1].body), HEAD_SHA);
  });

  it('does not overwrite a checklist a publish restamped after the listing', async () => {
    const {
      api: inner,
      calls,
      comments,
    } = fakeApi([{ id: 7, body: checklist() }]);
    const republished = checklist({ sha: HEAD_SHA, extra: '- [ ] New step' });
    const api = async (path, init = {}) => {
      const result = await inner(path, init);
      if (!path.includes('/comments?')) return result;

      // The publish lands between reset's listing and its write.
      const listed = result.map((comment) => ({ ...comment }));
      comments[0].body = republished;
      return listed;
    };

    await runGate('reset', {
      api,
      repo: 'o/r',
      prNumber: '5',
      headSha: HEAD_SHA,
      now: NOW,
    });

    assert.equal(comments[0].body, republished);
    assert.ok(!calls.some((call) => call.method === 'PATCH'));
  });

  it('only reads and reports on status, fetching the head when the event has none', async () => {
    const { api, calls } = fakeApi([
      { id: 1, body: checklist({ sha: HEAD_SHA }) },
    ]);
    const status = await runGate('status', {
      api,
      repo: 'o/r',
      prNumber: '5',
      headSha: null,
    });

    assert.equal(status.description, '2 of 5 checks outstanding');
    assert.equal(calls[0].path, '/repos/o/r/pulls/5');
    assert.ok(!calls.some((call) => call.method === 'PATCH'));
  });

  it('keeps a box-less checklist on its old commit and asks for a new run of the skill', async () => {
    const body = [
      CHECKLIST_MARKER,
      `<!-- pr-qa:sha=${OLD_SHA} -->`,
      '<!-- pr-qa:banner:start -->',
      '<!-- pr-qa:banner:end -->',
      '',
      '_No manual checks needed — no runtime surface touched._',
    ].join('\n');
    const { api, calls, comments } = fakeApi([{ id: 7, body }]);
    const status = await runGate('reset', {
      api,
      repo: 'o/r',
      prNumber: '5',
      headSha: HEAD_SHA,
      skill: 'pull-requests',
      now: NOW,
    });

    assert.deepEqual(status, {
      headSha: HEAD_SHA,
      state: 'failure',
      description: 'checklist predates def5678, re-run /pull-requests',
    });
    assert.ok(!calls.some((call) => call.method === 'PATCH'));
    assert.equal(readStampedSha(comments[0].body), OLD_SHA);
    assert.equal(calls.at(-1).body.description, status.description);

    // A box-less checklist already on the head still passes.
    const current = fakeApi([{ id: 7, body: body.replace(OLD_SHA, HEAD_SHA) }]);
    const again = await runGate('reset', {
      api: current.api,
      repo: 'o/r',
      prNumber: '5',
      headSha: HEAD_SHA,
    });
    assert.equal(again.state, 'success');
  });

  it('posts a red status with no link when there is no checklist', async () => {
    const { api, calls } = fakeApi([{ id: 1, body: 'LGTM' }]);
    const status = await runGate('reset', {
      api,
      repo: 'o/r',
      prNumber: '5',
      headSha: HEAD_SHA,
    });

    assert.equal(status.description, 'no QA checklist — run /pr');
    assert.ok(!('target_url' in calls.at(-1).body));
  });

  it('counts a checklist from a private organisation member who can push, and not one from a reader', async () => {
    const { api } = fakeApi([
      {
        id: 1,
        author_association: 'CONTRIBUTOR',
        body: checklist({ sha: HEAD_SHA }),
      },
      {
        id: 2,
        user: { login: 'reader' },
        body: checklist({ sha: HEAD_SHA }).replace(/- \[ \]/g, '- [x]'),
      },
      {
        id: 3,
        user: { login: 'ghost' },
        body: checklist({ sha: HEAD_SHA }).replace(/- \[ \]/g, '- [x]'),
      },
    ]);
    const status = await runGate('status', {
      api,
      repo: 'o/r',
      prNumber: '5',
      headSha: HEAD_SHA,
    });

    assert.equal(status.description, '2 of 5 checks outstanding');
  });

  it('reads every page of comments', async () => {
    const filler = Array.from({ length: 150 }, (_, i) => ({
      id: 100 + i,
      body: 'chat',
    }));
    const { api, calls } = fakeApi([
      ...filler,
      { id: 1, body: checklist({ sha: HEAD_SHA }) },
    ]);
    const status = await runGate('status', {
      api,
      repo: 'o/r',
      prNumber: '5',
      headSha: HEAD_SHA,
    });

    assert.equal(status.description, '2 of 5 checks outstanding');
    assert.equal(
      calls.filter((call) => call.path.includes('/comments?')).length,
      2,
    );
  });
});

describe('githubClient', () => {
  it('sends the token and headers, and parses JSON', async () => {
    let seen;
    const client = githubClient('tkn', async (url, init) => {
      seen = { url, init };
      return { ok: true, text: async () => '{"a":1}' };
    });

    assert.deepEqual(await client('/x', { method: 'POST', body: '{}' }), {
      a: 1,
    });
    assert.equal(seen.url, 'https://api.github.com/x');
    assert.equal(seen.init.headers.Authorization, 'Bearer tkn');
    assert.equal(seen.init.method, 'POST');
  });

  it('returns null for an empty body, and throws with the status on failure', async () => {
    const empty = githubClient('t', async () => ({
      ok: true,
      text: async () => '',
    }));
    assert.equal(await empty('/x'), null);

    const failing = githubClient('t', async () => ({
      ok: false,
      status: 403,
      text: async () => 'nope',
    }));
    await assert.rejects(failing('/x'), /GitHub API GET \/x failed: 403 nope/);
  });
});

describe('readGateEnv and the qa-gate command', () => {
  it('reads the environment and names what is missing', () => {
    assert.deepEqual(
      readGateEnv({
        GITHUB_TOKEN: 't',
        GITHUB_REPOSITORY: 'o/r',
        PR_NUMBER: ' 5 ',
        HEAD_SHA: HEAD_SHA,
      }),
      {
        token: 't',
        repo: 'o/r',
        prNumber: '5',
        headSha: HEAD_SHA,
        skill: 'pr',
      },
    );
    assert.equal(
      readGateEnv({
        GITHUB_TOKEN: 't',
        GITHUB_REPOSITORY: 'o/r',
        PR_NUMBER: '5',
        QA_SKILL: 'pull-requests',
      }).skill,
      'pull-requests',
    );
    assert.equal(
      readGateEnv({
        GITHUB_TOKEN: 't',
        GITHUB_REPOSITORY: 'o/r',
        PR_NUMBER: '5',
      }).headSha,
      null,
    );
    assert.throws(
      () => readGateEnv({ GITHUB_TOKEN: 't' }),
      /Missing required environment: GITHUB_REPOSITORY, PR_NUMBER/,
    );
  });

  it('prints usage and exits 2 for an unknown subcommand', async () => {
    const errors = [];
    const original = console.error;
    console.error = (line) => errors.push(line);
    try {
      assert.equal(await qaGate(['tick'], {}), 2);
    } finally {
      console.error = original;
    }
    assert.match(errors[0], /skills qa-gate <reset\|status>/);
  });

  it('refuses to run without its environment', async () => {
    await assert.rejects(
      qaGate(['status'], {}),
      /Missing required environment/,
    );
  });
});

describe('the gate against the real client', () => {
  it('stops reading comments at the page cap, with a warning', async () => {
    const full = Array.from({ length: 100 }, (_, i) => ({
      id: i,
      body: 'chat',
    }));
    const warnings = [];
    const original = console.warn;
    console.warn = (line) => warnings.push(line);
    let pages = 0;
    try {
      await runGate('status', {
        api: async (path) => {
          if (path.includes('/comments?')) {
            pages += 1;
            return full;
          }
          return null;
        },
        repo: 'o/r',
        prNumber: '5',
        headSha: HEAD_SHA,
      });
    } finally {
      console.warn = original;
    }

    assert.equal(pages, 50);
    assert.match(warnings[0], /Stopped reading comments at 50 pages/);
  });

  it('runs qa-gate end to end through fetch', async () => {
    const requests = [];
    const originalFetch = globalThis.fetch;
    const originalLog = console.log;
    const logged = [];
    globalThis.fetch = async (url, init) => {
      requests.push({ url, method: init.method ?? 'GET' });
      const body = url.includes('/comments?')
        ? JSON.stringify([
            member({
              id: 1,
              body: checklist({ sha: HEAD_SHA }),
              html_url: 'u',
            }),
          ])
        : url.includes('/permission')
          ? JSON.stringify(ROLES.dev)
          : '';
      return { ok: true, text: async () => body };
    };
    console.log = (line) => logged.push(line);

    try {
      const code = await qaGate(['status'], {
        GITHUB_TOKEN: 't',
        GITHUB_REPOSITORY: 'o/r',
        PR_NUMBER: '5',
        HEAD_SHA,
      });
      assert.equal(code, 0);
    } finally {
      globalThis.fetch = originalFetch;
      console.log = originalLog;
    }

    assert.deepEqual(
      requests.map((r) => `${r.method} ${r.url}`),
      [
        'GET https://api.github.com/repos/o/r/issues/5/comments?per_page=100&page=1',
        'GET https://api.github.com/repos/o/r/collaborators/dev/permission',
        `POST https://api.github.com/repos/o/r/statuses/${HEAD_SHA}`,
      ],
    );
    assert.equal(
      logged[0],
      'Manual QA on def5678: failure — 2 of 5 checks outstanding',
    );
  });
});

/** A cut-down real checklist in the collapsed layout, ticked, with notes from two passes. */
const COLLAPSED = readFileSync(
  new URL('./fixtures/pr/checklist-collapsed.md', import.meta.url),
  'utf8',
);

/** The same checklist in the layout before it, as open PRs still carry it. */
const FLAT = readFileSync(
  new URL('./fixtures/pr/checklist-flat.md', import.meta.url),
  'utf8',
);

describe('the collapsed layout', () => {
  it('is told apart from the layout before it', () => {
    assert.equal(isCollapsed(COLLAPSED), true);
    assert.equal(isCollapsed(FLAT), false);
    assert.equal(isCollapsed(checklist()), false);
  });

  it('counts the list lines as boxes, the same boxes the old layout had', () => {
    // Three backend, two frontend, one Storybook and two Local CI boxes. The
    // `- [x]` pasted inside a fenced block in Backend 2's toggle is output, not a box.
    assert.deepEqual(countBoxes(COLLAPSED), {
      total: 8,
      ticked: 3,
      unticked: 5,
    });
    assert.equal(countBoxes(FLAT).total, 8);
    assert.equal(countBoxes(FLAT).ticked, 3);
  });

  it('computes the status from the list lines', () => {
    const body = COLLAPSED.replaceAll(OLD_SHA, HEAD_SHA);
    assert.deepEqual(computeStatus({ main: { body }, headSha: HEAD_SHA }), {
      state: 'failure',
      description: '5 of 8 checks outstanding',
    });

    const ticked = body.replace(/^(- )\[ \]/gm, '$1[x]');
    assert.deepEqual(
      computeStatus({ main: { body: ticked }, headSha: HEAD_SHA }),
      {
        state: 'success',
        description: '8 checks ticked against def5678',
      },
    );
  });

  it('names each step by its list line, without markdown or the failed suffix', () => {
    const names = listedSteps(COLLAPSED);

    assert.equal(
      names.get('Backend 2'),
      'Backend 2 — The lockfile keeps msw nested under apps/web',
    );
    assert.equal(
      names.get('Backend 3'),
      'Backend 3 · if-time — The monitoring tunnel is not redirected to login',
    );
    assert.equal(
      names.get('Teacher/Recall/New'),
      'Teacher/Recall/New — DeadlineOpen',
    );
    // Lines inside a toggle are a step's instructions, never its name.
    assert.ok(![...names.keys()].some((label) => label.startsWith('Setup')));
  });
});

describe('the collapsed layout — reset', () => {
  const reset = resetBody(COLLAPSED, { headSha: HEAD_SHA, now: NOW });

  it('un-ticks every box and strips the failed suffix, leaving fenced output alone', () => {
    assert.equal(countBoxes(reset).ticked, 0);
    assert.equal(countBoxes(reset).total, 8);
    assert.doesNotMatch(reset, /❌/);
    assert.match(
      reset,
      /^- \[ \] \*\*Backend 2\*\* — The lockfile keeps msw nested under apps\/web$/m,
    );
    assert.match(reset, /^- \[x\] not a box, it is output$/m);
  });

  it('keeps only the latest note in each step’s toggle and in the Local CI notes', () => {
    assert.doesNotMatch(reset, /an earlier pass/);
    assert.doesNotMatch(reset, /```\nnode_modules\/msw\n```/);
    assert.match(
      reset,
      /> \*\*Failed\*\* \(agent, `abc1234`\): a root `node_modules\/msw` entry is still there\.\n> The alias would point at a missing file\.\n\n<\/details>/,
    );
    assert.doesNotMatch(reset, /an earlier run/);
    assert.match(reset, /`npm run test:suite` exit 0\.\n\n<\/details>/);
    // A step with one note keeps it, and a note in a setup toggle belongs to no step.
    assert.match(reset, /> \*\*Observed\*\* \(agent, `abc1234`\): `400`\./);
    assert.match(reset, /the DSN had the usual shape/);
  });

  it('leaves every toggle balanced and every step where it was', () => {
    assert.ok(balancedToggles(COLLAPSED));
    assert.ok(balancedToggles(reset));
    assert.equal(
      (reset.match(/<details>/g) ?? []).length,
      (COLLAPSED.match(/<details>/g) ?? []).length + 1,
      'one more for the banner',
    );
  });

  it('keeps one note per step when run twice', () => {
    const twice = resetBody(reset, { headSha: OLD_SHA, now: NOW });
    assert.equal(twice.match(/\*\*Failed\*\*/g).length, 1);
    // Backend 1's, the setup toggle's and the Local CI notes' latest.
    assert.equal(twice.match(/\*\*Observed\*\*/g).length, 3);
  });

  it('reads a CRLF body, as GitHub’s web editor saves it', () => {
    const crlf = resetBody(COLLAPSED.replace(/\n/g, '\r\n'), {
      headSha: HEAD_SHA,
      now: NOW,
    });
    assert.equal(countBoxes(crlf).ticked, 0);
    assert.doesNotMatch(crlf, /❌|an earlier pass|an earlier run/);
  });
});

describe('the collapsed layout — edges', () => {
  it('treats a missing body as no checklist', () => {
    assert.equal(isCollapsed(undefined), false);
    assert.deepEqual([...listedSteps(undefined)], []);
  });

  it('drops an older note with no blank line before the next or before the close', () => {
    const body = [
      '- [x] **Backend 1** — A',
      '',
      '<details><summary>How to run the Backend steps</summary>',
      '',
      '<details><summary><b>Backend 1</b> — A</summary>',
      '',
      '**Expect:** `200`',
      '> **Observed** (agent): old',
      '> **Observed** (agent): new',
      '</details>',
      '',
      '</details>',
    ].join('\n');
    const reset = resetBody(body, { headSha: HEAD_SHA, now: NOW });

    assert.doesNotMatch(reset, /old/);
    assert.match(
      reset,
      /`200`\n> \*\*Observed\*\* \(agent\): new\n<\/details>/,
    );
  });

  it('leaves notes alone in a toggle that is no step’s, such as one with no summary', () => {
    const body = [
      '- [x] **Backend 1** — A',
      '',
      '<details><summary>How to run the Backend steps</summary>',
      '',
      '<details>',
      '',
      '> **Observed** (agent): one',
      '',
      '> **Observed** (agent): two',
      '',
      '</details>',
      '',
      '</details>',
    ].join('\n');
    const reset = resetBody(body, { headSha: HEAD_SHA, now: NOW });

    assert.match(reset, /one/);
    assert.match(reset, /two/);
    assert.deepEqual(
      staleSteps(body.replace('one', '`src/a.ts`'), ['src/a.ts']),
      [],
    );
  });
});

describe('the collapsed layout — stale steps', () => {
  it('names only the step whose toggle cites the changed file', () => {
    assert.deepEqual(staleSteps(COLLAPSED, ['apps/web/next.config.ts']), [
      'Backend 2 — The lockfile keeps msw nested under apps/web',
    ]);
    // A path matches by its tail, and one only inside a fenced command is no citation.
    assert.deepEqual(staleSteps(COLLAPSED, ['repo/apps/web/next.config.ts']), [
      'Backend 2 — The lockfile keeps msw nested under apps/web',
    ]);
    assert.deepEqual(staleSteps(COLLAPSED, ['package-lock.json']), []);
  });

  it('charges no step for a path in a setup toggle, the boot block or the gaps', () => {
    assert.deepEqual(staleSteps(COLLAPSED, ['apps/web/.env.local']), []);
    assert.deepEqual(
      staleSteps(COLLAPSED, ['apps/web/src/app/api/agents/route.test.ts']),
      [],
    );
    assert.deepEqual(
      staleSteps(COLLAPSED, ['apps/web/e2e/deadline.spec.ts']),
      [],
    );
  });

  it('names a human step, a step cited in its list line, and each step once', () => {
    assert.deepEqual(
      staleSteps(COLLAPSED, [
        'components/primitives/calendar.tsx',
        'apps/web/src/app/api/agents/route.ts',
      ]),
      [
        'Backend 1 — The assistant refuses a request with only a system message',
        'Frontend 2 — Deadline calendar looks right and works from the keyboard',
      ],
    );

    const cited = COLLAPSED.replace(
      '**Backend 3** · if-time — The monitoring tunnel',
      '**Backend 3** · if-time — The `src/tunnel.ts` monitoring tunnel',
    );
    assert.deepEqual(staleSteps(cited, ['src/tunnel.ts']), [
      'Backend 3 · if-time — The `src/tunnel.ts` monitoring tunnel is not redirected to login',
    ]);
  });

  it('ignores a path in a fenced block inside a toggle', () => {
    const fenced = COLLAPSED.replace(
      "jq -r '.packages | keys[]' package-lock.json | grep msw",
      'cat `src/only/in/a/fence.ts`',
    );
    assert.deepEqual(staleSteps(fenced, ['src/only/in/a/fence.ts']), []);
  });

  it('falls back to the toggle’s label when the list line is in another part', () => {
    const toggles = COLLAPSED.slice(
      COLLAPSED.indexOf('<details><summary>How to run the Backend steps'),
    );
    assert.deepEqual(
      staleSteps(toggles, ['apps/web/next.config.ts'], new Map()),
      ['Backend 2'],
    );
    assert.deepEqual(
      staleSteps(toggles, ['apps/web/next.config.ts'], listedSteps(COLLAPSED)),
      ['Backend 2 — The lockfile keeps msw nested under apps/web'],
    );
  });
});

describe('the collapsed layout — banner', () => {
  it('writes one visible line, with the counts and stale steps in a toggle', () => {
    const body = resetBody(COLLAPSED, {
      headSha: HEAD_SHA,
      now: NOW,
      staleSteps: ['Backend 2 — The lockfile keeps msw nested under apps/web'],
    });
    const banner = body.slice(
      body.indexOf('<!-- pr-qa:banner:start -->'),
      body.indexOf('<!-- pr-qa:banner:end -->'),
    );

    assert.equal(
      banner,
      [
        '<!-- pr-qa:banner:start -->',
        '',
        '**⚠️ Reset by push `def5678` — 18 Aug 2026, 14:02 UTC.** Every box is clear again, and 1 step may be stale.',
        '',
        '<details><summary>What the reset changed</summary>',
        '',
        'The previous pass ticked 3 of 8 boxes against `abc1234`.',
        '',
        'Every box below is now clear, and the `Manual QA` check stays red until they are ticked again.',
        '',
        'Pushes since this checklist was drafted changed files these steps cite, so they may be stale — re-run `/pr` to redraft them:',
        '',
        '- Backend 2 — The lockfile keeps msw nested under apps/web',
        '',
        '</details>',
        '',
        '',
      ].join('\n'),
    );
    assert.deepEqual(listedStaleSteps(body), [
      'Backend 2 — The lockfile keeps msw nested under apps/web',
    ]);
  });

  it('counts several stale steps in its visible line', () => {
    const body = resetBody(COLLAPSED, {
      headSha: HEAD_SHA,
      now: NOW,
      staleSteps: ['Backend 1 — a', 'Backend 2 — b'],
    });
    assert.match(body, /Every box is clear again, and 2 steps may be stale\./);
    assert.deepEqual(listedStaleSteps(body), [
      'Backend 1 — a',
      'Backend 2 — b',
    ]);
  });

  it('still reads the stale steps an older, quoted banner listed', () => {
    const old = checklist({
      banner: [
        '',
        '> [!WARNING]',
        '> **Reset by push `abc1234` — 13 Oct 2026, 10:06 UTC.**',
        '> The previous pass ticked 0 of 12 boxes against `0ld0ld0`.',
        '>',
        '> Pushes since this checklist was drafted changed files these steps cite, so they may be stale — re-run `/pr` to redraft them:',
        '> - [blocking] Frontend 3 — Recall deadline calendar',
        '',
      ].join('\n'),
    });

    assert.deepEqual(listedStaleSteps(old), [
      '[blocking] Frontend 3 — Recall deadline calendar',
    ]);
    const reset = resetBody(old, {
      headSha: HEAD_SHA,
      now: NOW,
      staleSteps: listedStaleSteps(old),
    });
    assert.doesNotMatch(reset, /\[!WARNING\]/);
    assert.match(
      reset,
      /\n- \[blocking\] Frontend 3 — Recall deadline calendar\n\n<\/details>/,
    );
  });
});

describe('the collapsed layout — runGate', () => {
  it('names a stale step by its list line when its toggle landed in a later part', async () => {
    const checklistOnly = COLLAPSED.slice(
      COLLAPSED.indexOf('<details><summary><b>Boot'),
    );
    const bodies = buildComments(checklistOnly, OLD_SHA, 1500);
    assert.ok(bodies.length > 2);
    // The Backend list and Backend 2's toggle sit in different comments.
    const listIn = bodies.findIndex((b) => b.includes('- [x] **Backend 2**'));
    const toggleIn = bodies.findIndex((b) =>
      b.includes('<summary><b>Backend 2</b>'),
    );
    assert.notEqual(listIn, toggleIn);

    const { api, comments } = fakeApi(
      bodies.map((body, i) => ({ id: i + 1, body })),
      HEAD_SHA,
      { files: [{ filename: 'apps/web/next.config.ts' }] },
    );
    const status = await runGate('reset', {
      api,
      repo: 'o/r',
      prNumber: '5',
      headSha: HEAD_SHA,
      now: NOW,
    });

    assert.match(
      comments[0].body,
      /redraft them:\n\n- Backend 2 — The lockfile keeps msw nested under apps\/web\n\n<\/details>/,
    );
    assert.ok(comments.every((comment) => balancedToggles(comment.body)));
    assert.ok(comments.every((comment) => !comment.body.includes('❌')));
    assert.deepEqual(status, {
      headSha: HEAD_SHA,
      state: 'failure',
      description: '8 of 8 checks outstanding',
    });
  });

  it('still resets an old-layout checklist and computes its status', async () => {
    const { api, comments } = fakeApi([{ id: 1, body: FLAT }], HEAD_SHA, {
      files: [{ filename: 'apps/web/next.config.ts' }],
    });
    const status = await runGate('reset', {
      api,
      repo: 'o/r',
      prNumber: '5',
      headSha: HEAD_SHA,
      now: NOW,
    });
    const body = comments[0].body;

    assert.equal(countBoxes(body).ticked, 0);
    assert.doesNotMatch(body, /an earlier pass|an earlier run/);
    assert.match(
      body,
      /> \*\*Failed\*\* \(agent, `abc1234`\): a root entry is still there\./,
    );
    assert.match(
      body,
      /redraft them:\n\n- \[blocking\] Backend 2 — The lockfile keeps msw nested under apps\/web\n/,
    );
    assert.deepEqual(status, {
      headSha: HEAD_SHA,
      state: 'failure',
      description: '8 of 8 checks outstanding',
    });
  });
});
