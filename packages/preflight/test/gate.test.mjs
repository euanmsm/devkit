// ============================================================================
// Skill Gate Tests
// ============================================================================

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  findAgentTranscript,
  loadedSkills,
  requiredFor,
  requiredForTool,
} from '../src/gate.mjs';

const BIN = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'bin',
  'preflight.mjs',
);

const LINEAR_SAVE = 'mcp__linear__save_issue';

const SKILL_LINE = (skill) =>
  `{"content":[{"name":"Skill","input":{"skill":"${skill}"}}]}\n`;

const MAP = {
  exclude: ['^tmp/', '\\.d\\.ts$'],
  primary: [
    { pattern: '^src/api/', skills: ['api-routes'] },
    { pattern: '^src/', skills: ['readability'] },
  ],
  universal: [{ pattern: '\\.(tsx?|mjs)$', skills: ['comments'] }],
};

describe('requiredFor', () => {
  test('takes the first matching primary rule, not the broadest', () => {
    assert.deepEqual(requiredFor('src/api/x.ts', MAP), [
      'api-routes',
      'comments',
    ]);
  });

  test('adds universal skills on top of the primary one', () => {
    assert.deepEqual(requiredFor('src/x.ts', MAP), ['readability', 'comments']);
  });

  test('requires nothing of an excluded path, however well it matches', () => {
    assert.deepEqual(requiredFor('tmp/x.ts', MAP), []);
    assert.deepEqual(requiredFor('src/x.d.ts', MAP), []);
  });

  test('requires nothing of a path no rule names', () => {
    assert.deepEqual(requiredFor('README.md', MAP), []);
  });

  test('ignores an unusable pattern rather than blocking every edit', () => {
    const broken = {
      exclude: [],
      primary: [{ pattern: '(((', skills: ['x'] }],
      universal: [],
    };

    assert.deepEqual(requiredFor('src/x.ts', broken), []);
  });
});

describe('requiredForTool', () => {
  const TOOLS = {
    tools: [
      { pattern: '^mcp__linear__save_', skills: ['linear'] },
      { pattern: '^mcp__', skills: ['mcp'] },
    ],
  };

  test('takes the first matching tool rule', () => {
    assert.deepEqual(requiredForTool(LINEAR_SAVE, TOOLS), ['linear']);
  });

  test('requires nothing of a tool no rule names', () => {
    assert.deepEqual(requiredForTool('Edit', TOOLS), []);
  });

  test('requires nothing when the map has no tools block', () => {
    assert.deepEqual(requiredForTool(LINEAR_SAVE, MAP), []);
  });

  test('ignores an unusable pattern rather than blocking every call', () => {
    const broken = { tools: [{ pattern: '(((', skills: ['x'] }] };

    assert.deepEqual(requiredForTool(LINEAR_SAVE, broken), []);
  });
});

describe('loadedSkills', () => {
  test('reads every Skill call out of a transcript', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'devkit-')), 't.jsonl');
    writeFileSync(
      path,
      '{"type":"assistant"}\n' +
        '{"content":[{"name":"Skill","input":{"skill":"comments"}}]}\n' +
        '{"content":[{"name":"Skill","input":{"skill":"readability"}}]}\n',
    );

    assert.deepEqual([...loadedSkills(path)].sort(), [
      'comments',
      'readability',
    ]);
  });
});

/**
 * Writes a subagent transcript beside a session transcript.
 *
 * @param sessionTranscript - Path to the session's transcript
 * @param agentId - The subagent's id
 * @param content - The transcript's contents
 * @param run - Workflow run folder, for a workflow agent
 * @returns Path to the subagent's transcript
 */
function writeAgentTranscript(sessionTranscript, agentId, content, run) {
  const dir = join(
    sessionTranscript.replace(/\.jsonl$/, ''),
    'subagents',
    ...(run ? ['workflows', run] : []),
  );
  mkdirSync(dir, { recursive: true });

  const path = join(dir, `agent-${agentId}.jsonl`);
  writeFileSync(path, content);
  return path;
}

describe('findAgentTranscript', () => {
  const session = join(mkdtempSync(join(tmpdir(), 'devkit-')), 's.jsonl');

  test('finds a subagent transcript', () => {
    const path = writeAgentTranscript(session, 'a1', '');
    assert.equal(findAgentTranscript(session, 'a1'), path);
  });

  test('finds a workflow agent transcript under its run folder', () => {
    const path = writeAgentTranscript(session, 'a2', '', 'wf_x');
    assert.equal(findAgentTranscript(session, 'a2'), path);
  });

  test('returns null when no transcript has that id', () => {
    assert.equal(findAgentTranscript(session, 'missing'), null);
  });
});

/**
 * Creates a throwaway repository with a preflight map and an empty transcript.
 *
 * @returns The repository root and the transcript path
 */
function makeRepo() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'preflight-')));
  mkdirSync(join(root, '.git'));
  mkdirSync(join(root, '.devkit'));
  writeFileSync(
    join(root, '.devkit', 'preflight.json'),
    JSON.stringify({
      ...MAP,
      tools: [{ pattern: '^mcp__linear__save_', skills: ['linear'] }],
    }),
  );

  const transcript = join(root, 't.jsonl');
  writeFileSync(transcript, '{"type":"assistant"}\n');

  return { root, transcript };
}

/**
 * Runs the hook binary from the repository root.
 *
 * @param root - Repository root, used as the working directory
 * @param payload - The hook payload
 * @returns The hook's stdout, empty when it allowed the call
 */
function runHook(root, payload) {
  const { PREFLIGHT, ...env } = process.env;
  const result = spawnSync(process.execPath, [BIN], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    cwd: root,
    env,
  });
  assert.equal(result.status, 0);
  return result.stdout;
}

/** Reads the deny reason out of the hook's stdout. */
function reason(stdout) {
  return JSON.parse(stdout).hookSpecificOutput.permissionDecisionReason;
}

describe('the hook end to end', () => {
  test('denies a matching tool until its skill is loaded', () => {
    const { root, transcript } = makeRepo();
    const out = runHook(root, {
      tool_name: LINEAR_SAVE,
      tool_input: { title: 'x' },
      transcript_path: transcript,
    });

    assert.match(reason(out), new RegExp(`BLOCKED — ${LINEAR_SAVE} `));
    assert.match(reason(out), /Skill\(skill: "linear"\)/);
  });

  test('allows a matching tool once its skill is loaded', () => {
    const { root, transcript } = makeRepo();
    writeFileSync(transcript, SKILL_LINE('linear'));

    const out = runHook(root, {
      tool_name: LINEAR_SAVE,
      tool_input: {},
      transcript_path: transcript,
    });

    assert.equal(out, '');
  });

  test('allows a tool no rule names when it writes no file', () => {
    const { root, transcript } = makeRepo();
    const out = runHook(root, {
      tool_name: 'mcp__linear__get_issue',
      tool_input: { id: 'CUR-1' },
      transcript_path: transcript,
    });

    assert.equal(out, '');
  });

  test('still gates a path when the map has a tools block', () => {
    const { root, transcript } = makeRepo();
    const out = runHook(root, {
      tool_name: 'Edit',
      tool_input: { file_path: join(root, 'src', 'x.ts') },
      transcript_path: transcript,
    });

    assert.match(reason(out), /BLOCKED — src\/x\.ts /);
  });
});

describe('the hook inside a subagent', () => {
  test('denies when only the parent session loaded the skill', () => {
    const { root, transcript } = makeRepo();
    writeFileSync(transcript, SKILL_LINE('linear'));
    writeAgentTranscript(transcript, 'a1', '{"type":"assistant"}\n');

    const out = runHook(root, {
      tool_name: LINEAR_SAVE,
      tool_input: {},
      transcript_path: transcript,
      agent_id: 'a1',
    });

    assert.match(reason(out), /parent session do not count/);
  });

  test('allows once the subagent loaded the skill itself', () => {
    const { root, transcript } = makeRepo();
    writeAgentTranscript(transcript, 'a1', SKILL_LINE('linear'));

    const out = runHook(root, {
      tool_name: LINEAR_SAVE,
      tool_input: {},
      transcript_path: transcript,
      agent_id: 'a1',
    });

    assert.equal(out, '');
  });

  test('allows a workflow agent that loaded the skill itself', () => {
    const { root, transcript } = makeRepo();
    writeAgentTranscript(transcript, 'a1', SKILL_LINE('linear'), 'wf_x');

    const out = runHook(root, {
      tool_name: LINEAR_SAVE,
      tool_input: {},
      transcript_path: transcript,
      agent_id: 'a1',
    });

    assert.equal(out, '');
  });

  test('allows the call when the subagent transcript cannot be found', () => {
    const { root, transcript } = makeRepo();
    const out = runHook(root, {
      tool_name: LINEAR_SAVE,
      tool_input: {},
      transcript_path: transcript,
      agent_id: 'missing',
    });

    assert.equal(out, '');
  });
});
