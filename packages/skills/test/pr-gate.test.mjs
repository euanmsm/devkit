// ============================================================================
// Manual QA Gate Tests
// ============================================================================
//
// The decisions that block a merge — ported from Curricular's gate tests — plus
// checklists split across comments and the GitHub API half, run against a
// fake API.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { qaGate } from '../src/pr/cli.mjs';
import {
  CHECKLIST_MARKER,
  computeStatus,
  countBoxes,
  findChecklistComments,
  githubClient,
  partMarker,
  readGateEnv,
  readStampedSha,
  resetBody,
  runGate,
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
    '- [x] **[blocking]** Sign in as a teacher',
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

/**
 * Marks a comment as written by a repository member, as the REST API does.
 *
 * @param comment - A comment without an `author_association`
 * @returns The comment, from a member unless it names another association
 */
const member = (comment) => ({ author_association: 'MEMBER', ...comment });

const main = (comments) => findChecklistComments(comments.map(member)).main;

describe('findChecklistComments', () => {
  it('returns nothing when no comment carries the marker', () => {
    assert.deepEqual(findChecklistComments([{ id: 1, body: 'LGTM' }]), {
      main: null,
      parts: [],
    });
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
    assert.deepEqual(findChecklistComments(undefined), {
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

  it('ignores a checklist or part posted by someone outside the repository', () => {
    const forged = `${CHECKLIST_MARKER}\n<!-- pr-qa:sha=${HEAD_SHA} -->\n\n- [x] done`;
    const found = findChecklistComments([
      { id: 1, author_association: 'MEMBER', body: checklist() },
      { id: 2, author_association: 'OWNER', body: part(2, OLD_SHA) },
      { id: 3, author_association: 'CONTRIBUTOR', body: forged },
      { id: 4, author_association: 'NONE', body: part(2, HEAD_SHA) },
      { id: 5, body: forged },
    ]);

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
      main([{ id: 6, author_association: 'COLLABORATOR', body: forged }]).id,
      6,
    );
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
    assert.ok(result.includes('- [ ] **[blocking]** Sign in as a teacher'));
    assert.ok(result.includes('    - [ ] Nested step, ticked'));
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
    assert.ok(!result.includes('[!WARNING]'));
  });

  it('writes a banner naming the push, the time and the cleared ticks', () => {
    const result = resetBody(checklist(), { headSha: HEAD_SHA, now: NOW });

    assert.ok(result.includes('> [!WARNING]'));
    assert.ok(
      result.includes('**Reset by push `def5678` — 18 Aug 2026, 14:02 UTC.**'),
    );
    assert.ok(result.includes('ticked 3 of 5 boxes against `abc1234`'));
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
    assert.ok(result.includes('> The previous pass ticked 3 of 5 boxes.'));
  });

  it('produces one banner when run twice, not two stacked ones', () => {
    const twice = resetBody(
      resetBody(checklist(), { headSha: OLD_SHA, now: NOW }),
      { headSha: HEAD_SHA, now: NOW },
    );

    assert.equal((twice.match(/> \[!WARNING\]/g) ?? []).length, 1);
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
    assert.ok(!result.includes('[!WARNING]'));
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
function fakeApi(comments, head = HEAD_SHA) {
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
    if (path.includes('/comments?')) {
      const page = Number(/[?&]page=(\d+)/.exec(path)[1]);
      return store.slice((page - 1) * 100, page * 100);
    }
    if (init.method === 'PATCH') {
      const id = Number(path.split('/').pop());
      const comment = store.find((c) => c.id === id);
      comment.body = JSON.parse(init.body).body;
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

  it('keeps a box-less checklist on its old commit and asks for a new /pr', async () => {
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
      now: NOW,
    });

    assert.deepEqual(status, {
      headSha: HEAD_SHA,
      state: 'failure',
      description: 'checklist predates def5678, re-run /pr',
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
      { token: 't', repo: 'o/r', prNumber: '5', headSha: HEAD_SHA },
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
        `POST https://api.github.com/repos/o/r/statuses/${HEAD_SHA}`,
      ],
    );
    assert.equal(
      logged[0],
      'Manual QA on def5678: failure — 2 of 5 checks outstanding',
    );
  });
});
