// ============================================================================
// PR Publish Tests
// ============================================================================
//
// Turning the workflow's result into the PR body and checklist comments, with
// `gh` replaced by a fake that records every call.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { prCommand } from '../src/pr/cli.mjs';
import {
  countBoxes,
  findChecklistComments,
  readStampedSha,
} from '../src/pr/gate.mjs';
import {
  COMMENT_LIMIT,
  buildComments,
  fillTemplate,
  publish,
  readResult,
  splitChecklist,
} from '../src/pr/publish.mjs';
import { TEMPLATE, prRepo } from './pr-helpers.mjs';
import { write } from './repo.mjs';

const SHA = 'def5678def5678def5678def5678def5678def56';
const CHECKLIST = '<!-- pr-qa:manual-checklist';
const CONFIG = { name: 'pr', template: '.github/pull_request_template.md' };

/** Each fake user's answer from the permission API; a missing login fails the lookup. */
const ROLES = {
  dev: { permission: 'write', role_name: 'write' },
  reader: { permission: 'read', role_name: 'read' },
};

/** The logins the gate would trust. */
const TRUSTED = new Set(['dev']);

const RESULT = {
  summary: 'Adds the thing.\n',
  checklist:
    'boot\n\n---\n\n## Agent-Runnable Backend Checks\n\n- [ ] **Backend 1**\n\n---\n\n### Local CI\n\n- [ ] Tests',
  gaps: [{ gap: 'a', why: 'b' }],
  reportNotes: [{ kind: 'test gap', item: 'c', why: 'd' }],
  unresolved: ['backend:x'],
  stats: {},
};

/**
 * A fake `gh` for one branch, recording every call and the files it was handed.
 *
 * @param options - The `open` PR, if any, the checklist comment `heads` already on it by id (a first line, or `{ head, login }`), the PR's `remoteHead` on GitHub, and whether the checked commit `contains` that head
 * @returns The `gh` function and its recorded `calls`
 */
function fakeGh({
  open = null,
  heads = {},
  remoteHead = SHA,
  contains = false,
} = {}) {
  const calls = [];

  const gh = (args) => {
    const call = { args };
    const bodyFile = args.find((arg) => arg.startsWith('body=@'));
    if (bodyFile) call.body = readFileSync(bodyFile.slice(6), 'utf8');
    const flagFile = args[args.indexOf('--body-file') + 1];
    if (args.includes('--body-file'))
      call.body = readFileSync(flagFile, 'utf8');
    calls.push(call);

    if (args[0] === 'branch-name') return 'feature/thing';
    if (args[0] === 'is-ancestor') {
      if (!contains) throw new Error('not an ancestor');
      return '';
    }
    if (
      args[0] === 'pr' &&
      args[1] === 'view' &&
      args.some((arg) => arg.startsWith('number,state,'))
    ) {
      if (!open) throw new Error('no pull requests found');
      return JSON.stringify({ headRefOid: remoteHead, ...open });
    }
    if (args[0] === 'pr' && args[1] === 'view') {
      return JSON.stringify({
        number: open?.number ?? 12,
        url: 'https://github.com/o/r/pull/12',
        headRefOid: remoteHead,
      });
    }
    if (args[0] === 'api' && args.includes('--paginate')) {
      return Object.entries(heads)
        .map(([id, entry]) => {
          const { head, login } =
            typeof entry === 'string' ? { head: entry, login: 'dev' } : entry;
          return JSON.stringify(
            JSON.stringify({ id: Number(id), login, head }),
          );
        })
        .join('\n');
    }
    const who = /collaborators\/([^/]+)\/permission$/.exec(args[1] ?? '');
    if (args[0] === 'api' && who) {
      const answer = ROLES[decodeURIComponent(who[1])];
      if (!answer) throw new Error('gh api failed: 404');
      return JSON.stringify(answer);
    }
    return '';
  };

  return { gh, calls };
}

/**
 * Writes a result file into a repository.
 *
 * @param root - The repository root
 * @param content - The file's JSON value
 * @returns The file's path relative to the root
 */
function resultFile(root, content) {
  write(root, 'tmp/result.json', JSON.stringify(content));
  return 'tmp/result.json';
}

describe('pr publish — pieces', () => {
  it('fills the template’s summary marker, keeping everything else', () => {
    assert.equal(
      fillTemplate(TEMPLATE, 'Costs $1 and $& more.\n\n'),
      '## Summary\n\nCosts $1 and $& more.\n\n## Screenshots\n',
    );
  });

  it('reads a bare result or one wrapped in the task output', () => {
    const root = prRepo(null);
    assert.equal(
      readResult(join(root, resultFile(root, RESULT))).summary,
      RESULT.summary,
    );

    write(
      root,
      'tmp/out.json',
      JSON.stringify({ agentCount: 3, logs: [], result: RESULT }),
    );
    assert.equal(
      readResult(join(root, 'tmp/out.json')).checklist,
      RESULT.checklist,
    );
  });

  it('refuses a result file that is not JSON or holds no result', () => {
    const root = prRepo(null);
    write(root, 'tmp/bad.json', 'not json');
    assert.throws(
      () => readResult(join(root, 'tmp/bad.json')),
      /Could not read the workflow result/,
    );

    write(root, 'tmp/empty.json', '{"result":{"summary":"x"}}');
    assert.throws(
      () => readResult(join(root, 'tmp/empty.json')),
      /holds no workflow result/,
    );
    assert.throws(
      () => readResult(join(root, 'tmp/missing.json')),
      /Could not read/,
    );
  });

  it('refuses a blank summary', () => {
    const root = prRepo(null);
    write(
      root,
      'tmp/blank.json',
      JSON.stringify({ ...RESULT, summary: ' \n' }),
    );
    assert.throws(
      () => readResult(join(root, 'tmp/blank.json')),
      /empty PR summary/,
    );
  });

  it('builds one comment carrying every marker the gate reads', () => {
    const [body, ...rest] = buildComments(RESULT.checklist, SHA);

    assert.equal(rest.length, 0);
    assert.ok(body.startsWith('<!-- pr-qa:manual-checklist -->\n'));
    assert.equal(readStampedSha(body), SHA);
    assert.match(
      body,
      /<!-- pr-qa:banner:start -->\n<!-- pr-qa:banner:end -->/,
    );
    assert.match(body, /## Manual QA — `def5678`\n\nboot/);
    assert.equal(
      findChecklistComments([{ user: { login: 'dev' }, body }], TRUSTED).main
        .body,
      body,
    );
  });

  it('splits a long checklist between sections, each part under the limit', () => {
    const section = (n) =>
      `---\n\n## Section ${n}\n\n${'- [ ] step\n'.repeat(40)}`;
    const checklist = ['boot', section(1), section(2), section(3)].join('\n\n');
    const bodies = buildComments(checklist, SHA, 1200);

    assert.ok(bodies.length > 1);
    assert.ok(bodies.every((body) => body.length <= 1200));
    assert.match(bodies[0], /## Manual QA — `def5678` \(part 1 of \d\)/);
    assert.match(
      bodies[1],
      /^<!-- pr-qa:manual-checklist:part=2 -->\n<!-- pr-qa:sha=/,
    );
    assert.ok(!bodies[1].includes('banner'));

    const found = findChecklistComments(
      bodies.map((body, id) => ({ id, user: { login: 'dev' }, body })),
      TRUSTED,
    );
    assert.equal(found.parts.length, bodies.length - 1);
    const total = bodies.reduce((sum, body) => sum + countBoxes(body).total, 0);
    assert.equal(total, 120);
  });

  it('never splits inside a step unless one step alone is too long', () => {
    const step = (n) =>
      `- [ ] **Step ${n}**\n\n\`\`\`bash\n${'echo hi\n'.repeat(10)}\`\`\``;
    const text = Array.from({ length: 10 }, (_, i) => step(i)).join('\n\n');
    const pieces = splitChecklist(text, 300);

    assert.ok(pieces.length > 1);
    for (const piece of pieces) {
      assert.ok(piece.length <= 300);
      assert.match(piece, /^- \[ \] \*\*Step \d\*\*/);
    }
  });

  it('cuts a single oversized line rather than exceed the limit', () => {
    const pieces = splitChecklist(`- [ ] ${'x'.repeat(250)}`, 100);
    assert.ok(pieces.length >= 3);
    assert.ok(pieces.every((piece) => piece.length <= 100));
    assert.equal(pieces.join(''), `- [ ] ${'x'.repeat(250)}`);
  });

  it('leaves room under GitHub’s limit', () => {
    assert.ok(COMMENT_LIMIT < 65536);
    const bodies = buildComments('- [ ] x\n'.repeat(20000), SHA);
    assert.ok(bodies.every((body) => body.length <= COMMENT_LIMIT));
  });
});

describe('pr publish — against a fake gh', () => {
  it('creates a draft PR with the filled body, then posts the checklist', () => {
    const root = prRepo(null);
    const { gh, calls } = fakeGh();
    const outcome = publish(root, CONFIG, {
      result: resultFile(root, RESULT),
      base: 'main',
      head: SHA,
      gh,
    });

    assert.deepEqual(outcome, {
      url: 'https://github.com/o/r/pull/12',
      number: 12,
      created: true,
      parts: 1,
      unresolved: ['backend:x'],
      trapCandidates: [],
      gaps: 1,
      reportNotes: [{ kind: 'test gap', item: 'c', why: 'd' }],
      baseMismatch: null,
    });

    const create = calls.find(
      (c) => c.args[0] === 'pr' && c.args[1] === 'create',
    );
    assert.deepEqual(create.args.slice(0, 7), [
      'pr',
      'create',
      '--draft',
      '--title',
      'feature/thing',
      '--base',
      'main',
    ]);
    assert.equal(
      create.body,
      '## Summary\n\nAdds the thing.\n\n## Screenshots\n',
    );

    const post = calls.find((c) => c.args.includes('POST'));
    assert.equal(post.args[1], 'repos/{owner}/{repo}/issues/12/comments');
    assert.ok(post.body.startsWith('<!-- pr-qa:manual-checklist -->'));
    assert.equal(readStampedSha(post.body), SHA);
  });

  it('edits an open PR and its existing checklist comment', () => {
    const root = prRepo(null);
    const { gh, calls } = fakeGh({
      open: { number: 12, state: 'OPEN' },
      heads: { 99: '<!-- pr-qa:manual-checklist -->' },
    });
    const outcome = publish(root, CONFIG, {
      result: resultFile(root, RESULT),
      base: 'main',
      head: SHA,
      gh,
    });

    assert.equal(outcome.created, false);
    assert.ok(!calls.some((c) => c.args[1] === 'create'));
    const edit = calls.find((c) => c.args[1] === 'edit');
    assert.deepEqual(edit.args.slice(0, 6), [
      'pr',
      'edit',
      '12',
      '--title',
      'feature/thing',
      '--body-file',
    ]);

    const patch = calls.find((c) => c.args.includes('PATCH'));
    assert.equal(patch.args[1], 'repos/{owner}/{repo}/issues/comments/99');
    assert.ok(!calls.some((c) => c.args.includes('POST')));
  });

  it('leaves an open PR’s base alone and reports the mismatch, unless told to move it', () => {
    const root = prRepo(null);
    const open = { number: 12, state: 'OPEN', baseRefName: 'feature/below' };

    const kept = fakeGh({ open });
    const outcome = publish(root, CONFIG, {
      result: resultFile(root, RESULT),
      base: 'main',
      head: SHA,
      gh: kept.gh,
    });
    assert.equal(outcome.baseMismatch, 'feature/below');
    assert.ok(
      !kept.calls.find((c) => c.args[1] === 'edit').args.includes('--base'),
    );

    const moved = fakeGh({ open });
    const again = publish(root, CONFIG, {
      result: resultFile(root, RESULT),
      base: 'main',
      head: SHA,
      setBase: true,
      gh: moved.gh,
    });
    assert.equal(again.baseMismatch, null);
    const edit = moved.calls.find((c) => c.args[1] === 'edit').args;
    assert.equal(edit[edit.indexOf('--base') + 1], 'main');

    const same = fakeGh({ open: { ...open, baseRefName: 'main' } });
    assert.equal(
      publish(root, CONFIG, {
        result: resultFile(root, RESULT),
        base: 'main',
        head: SHA,
        gh: same.gh,
      }).baseMismatch,
      null,
    );
  });

  it('opens a new PR when the branch’s only PR is closed', () => {
    const root = prRepo(null);
    const { gh, calls } = fakeGh({ open: { number: 3, state: 'CLOSED' } });
    publish(root, CONFIG, {
      result: resultFile(root, RESULT),
      base: 'main',
      head: SHA,
      gh,
    });

    assert.ok(calls.some((c) => c.args[1] === 'create'));
  });

  it('adds continuation comments as the checklist grows and deletes them as it shrinks', () => {
    const root = prRepo(null);
    const big = {
      ...RESULT,
      checklist: Array.from(
        { length: 3 },
        (_, i) => `---\n\n## S${i}\n\n${'- [ ] step\n'.repeat(2000)}`,
      ).join('\n\n'),
    };

    const grow = fakeGh({
      open: { number: 12, state: 'OPEN' },
      heads: { 1: '<!-- pr-qa:manual-checklist -->' },
    });
    const grown = publish(root, CONFIG, {
      result: resultFile(root, big),
      base: 'main',
      head: SHA,
      gh: grow.gh,
    });
    assert.equal(grown.parts, 2);
    assert.equal(grow.calls.filter((c) => c.args.includes('PATCH')).length, 1);
    const added = grow.calls.find((c) => c.args.includes('POST'));
    assert.ok(added.body.startsWith('<!-- pr-qa:manual-checklist:part=2 -->'));

    const shrink = fakeGh({
      open: { number: 12, state: 'OPEN' },
      heads: {
        1: '<!-- pr-qa:manual-checklist -->',
        2: '<!-- pr-qa:manual-checklist:part=2 -->',
        3: '<!-- pr-qa:manual-checklist:part=3 -->',
      },
    });
    publish(root, CONFIG, {
      result: resultFile(root, RESULT),
      base: 'main',
      head: SHA,
      gh: shrink.gh,
    });
    const deletes = shrink.calls
      .filter((c) => c.args.includes('DELETE'))
      .map((c) => c.args[1]);
    assert.deepEqual(deletes, [
      'repos/{owner}/{repo}/issues/comments/2',
      'repos/{owner}/{repo}/issues/comments/3',
    ]);
  });

  it('lists comments with a streaming, start-anchored filter', () => {
    const root = prRepo(null);
    const { gh, calls } = fakeGh();
    publish(root, CONFIG, {
      result: resultFile(root, RESULT),
      base: 'main',
      head: SHA,
      gh,
    });

    const list = calls.find((c) => c.args.includes('--paginate'));
    const jq = list.args[list.args.indexOf('--jq') + 1];
    assert.match(
      jq,
      /^\.\[\] \| select\(\.body \| startswith\("<!-- pr-qa:manual-checklist"\)\)/,
    );
  });

  it('only edits checklist comments whose author can push', () => {
    const root = prRepo(null);
    const { gh, calls } = fakeGh({
      open: { number: 12, state: 'OPEN' },
      heads: {
        1: { head: '<!-- pr-qa:manual-checklist -->', login: 'reader' },
        2: { head: '<!-- pr-qa:manual-checklist -->', login: 'ghost' },
        3: { head: '<!-- pr-qa:manual-checklist -->', login: 'dev' },
      },
    });
    publish(root, CONFIG, {
      result: resultFile(root, RESULT),
      base: 'main',
      head: SHA,
      gh,
    });

    const patches = calls
      .filter((c) => c.args.includes('PATCH'))
      .map((c) => c.args[1]);
    assert.deepEqual(patches, ['repos/{owner}/{repo}/issues/comments/3']);

    const list = calls.find((c) => c.args.includes('--paginate'));
    const jq = list.args[list.args.indexOf('--jq') + 1];
    const kept = execFileSync('jq', ['-r', jq], {
      input: JSON.stringify([
        { id: 1, user: { login: 'dev' }, body: CHECKLIST },
        { id: 2, user: { login: 'x' }, body: 'LGTM' },
      ]),
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    assert.deepEqual(kept, [
      { id: 1, login: 'dev', head: '<!-- pr-qa:manual-checklist' },
    ]);
  });

  it('names the configured skill when it refuses', () => {
    const root = prRepo(null);
    const NEW = '1234567123456712345671234567123456712345';
    const { gh } = fakeGh({ remoteHead: NEW });

    assert.throws(
      () =>
        publish(
          root,
          { ...CONFIG, name: 'pull-requests' },
          {
            result: resultFile(root, RESULT),
            base: 'main',
            head: SHA,
            gh,
          },
        ),
      /but \/pull-requests checked def5678.*re-run \/pull-requests\./,
    );
  });

  it('refuses when the PR on GitHub is behind the commit /pr checked', () => {
    const root = prRepo(null);
    const OLD = 'abc1234abc1234abc1234abc1234abc1234abc12';
    const { gh, calls } = fakeGh({
      open: { number: 12, state: 'OPEN' },
      remoteHead: OLD,
      contains: true,
    });

    assert.throws(
      () =>
        publish(root, CONFIG, {
          result: resultFile(root, RESULT),
          base: 'main',
          head: SHA,
          gh,
        }),
      /PR #12 is at abc1234 but \/pr checked def5678.*push first/,
    );
    assert.ok(!calls.some((c) => c.args[1] === 'edit'));
    assert.ok(!calls.some((c) => c.args[0] === 'api'));
  });

  it('refuses when commits landed on GitHub after /pr checked the branch', () => {
    const root = prRepo(null);
    const NEW = '1234567123456712345671234567123456712345';
    const { gh, calls } = fakeGh({ remoteHead: NEW });

    assert.throws(
      () =>
        publish(root, CONFIG, {
          result: resultFile(root, RESULT),
          base: 'main',
          head: SHA,
          gh,
        }),
      /is at 1234567 but \/pr checked def5678: commits landed on GitHub.*re-run \/pr/,
    );
    assert.ok(!calls.some((c) => c.args.includes('POST')));
  });

  it('passes a gh failure through, naming the command', () => {
    const root = prRepo(null);
    const gh = (args) => {
      if (args[0] === 'branch-name') return 'feature/thing';
      if (args[1] === 'view') throw new Error('none');
      throw new Error(
        'gh pr create failed: you must first push the current branch',
      );
    };

    assert.throws(
      () =>
        publish(root, CONFIG, {
          result: resultFile(root, RESULT),
          base: 'main',
          head: SHA,
          gh,
        }),
      /must first push/,
    );
  });
});

describe('the skills pr command', () => {
  it('prints usage and exits 2 for an unknown subcommand', async () => {
    const root = prRepo('sales');
    const errors = [];
    const original = console.error;
    console.error = (line) => errors.push(line);
    try {
      assert.equal(await prCommand(['ship'], root), 2);
    } finally {
      console.error = original;
    }
    assert.match(errors[0], /skills pr prepass --scratch <dir>/);
  });

  it('names a missing flag', async () => {
    const root = prRepo('sales');
    await assert.rejects(
      prCommand(['publish', '--base', 'main'], root),
      /skills pr publish: missing --result/,
    );
    await assert.rejects(
      prCommand(['publish', '--result', 'r.json', '--base', 'main'], root),
      /skills pr publish: missing --head/,
    );
    await assert.rejects(
      prCommand(['prepass'], root),
      /skills pr prepass: missing --scratch/,
    );
  });

  it('loads the config even when skills.json does not enable the skill', async () => {
    const root = prRepo('sales');
    writeFileSync(
      join(root, '.devkit/skills.json'),
      JSON.stringify({ skills: {} }),
    );
    await assert.rejects(
      prCommand(['publish', '--base', 'main'], root),
      /missing --result/,
    );
  });
});

describe('the skills pr command, end to end', () => {
  it('runs prepass then publish with the real git and a gh on the PATH', async () => {
    const root = prRepo(null);
    rmSync(join(root, '.git'), { recursive: true });
    write(
      root,
      '.devkit/pr.mjs',
      "export default { layers: [{ key: 'api', title: 'API', paths: ['src/'], section: 'backend' }] };\n",
    );
    const git = (...args) =>
      execFileSync('git', args, { cwd: root, stdio: 'pipe' });
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 't@t');
    git('config', 'user.name', 't');
    write(root, 'src/a.ts', 'export const a = 1;\n');
    git('add', '.');
    git('commit', '-qm', 'base');
    git('checkout', '-q', '-b', 'feature/a');
    write(root, 'src/a.ts', 'export const a = 2;\n');
    git('commit', '-qam', 'change');

    const bin = join(root, 'tmp/bin');
    const log = join(root, 'tmp/gh.log');
    write(
      root,
      'tmp/bin/gh',
      `#!/bin/sh
echo "$*" >> "${log}"
case "$*" in
  *number,state*) exit 1 ;;
  "pr view"*) echo '{"number":7,"url":"https://x/7","headRefOid":"'"$(git rev-parse HEAD)"'"}' ;;
  *--paginate*) ;;
  *) echo ok ;;
esac
`,
    );
    chmodSync(join(bin, 'gh'), 0o755);

    const printed = [];
    const originalLog = console.log;
    const originalPath = process.env.PATH;
    console.log = (line) => printed.push(line);
    process.env.PATH = `${bin}:${originalPath}`;

    try {
      assert.equal(await prCommand(['prepass', '--scratch', 'tmp/s'], root), 0);
      const args = JSON.parse(printed[0]);
      assert.equal(args.branch, 'feature/a');
      assert.deepEqual(args.sections, { backend: true });

      write(root, 'tmp/out.json', JSON.stringify({ result: RESULT }));
      assert.equal(
        await prCommand(
          [
            'publish',
            '--result',
            'tmp/out.json',
            '--base',
            args.base,
            '--head',
            args.headSha,
          ],
          root,
        ),
        0,
      );
      assert.equal(JSON.parse(printed[1]).url, 'https://x/7');
    } finally {
      console.log = originalLog;
      process.env.PATH = originalPath;
    }

    const calls = readFileSync(log, 'utf8');
    assert.match(
      calls,
      /pr create --draft --title feature\/a --base main --body-file /,
    );
    assert.match(
      calls,
      /api repos\/\{owner\}\/\{repo\}\/issues\/7\/comments -X POST -F body=@/,
    );
  });

  it('reports a failing gh with its stderr', () => {
    const root = prRepo(null);
    rmSync(join(root, '.git'), { recursive: true });
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
    const bin = join(root, 'tmp/bin');
    write(
      root,
      'tmp/bin/gh',
      '#!/bin/sh\necho "HTTP 401: Bad credentials" >&2\nexit 1\n',
    );
    chmodSync(join(bin, 'gh'), 0o755);

    const originalPath = process.env.PATH;
    process.env.PATH = `${bin}:${originalPath}`;
    try {
      assert.throws(
        () =>
          publish(root, CONFIG, {
            result: resultFile(root, RESULT),
            base: 'main',
            head: SHA,
          }),
        /gh pr create failed: HTTP 401: Bad credentials/,
      );
    } finally {
      process.env.PATH = originalPath;
    }
  });
});
