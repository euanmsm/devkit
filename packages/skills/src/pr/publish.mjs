// ============================================================================
// PR Publish
// ============================================================================
//
// `skills pr publish`: turns the workflow's result into the pull request —
// fills the template, creates the PR as a draft or edits the open one, and
// writes the Manual QA checklist into one comment, or several when it is
// longer than GitHub allows.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { SUMMARY_MARKER } from './defaults.mjs';
import {
  BANNER_END,
  BANNER_START,
  CHECKLIST_MARKER,
  canPush,
  partMarker,
} from './gate.mjs';

/** Characters per comment, safely under GitHub's 65,536 limit. */
export const COMMENT_LIMIT = 60000;

/**
 * Publishes the workflow result as the branch's pull request and checklist.
 *
 * @param root - The repository root
 * @param config - The resolved PR config
 * @param options - `result` path, `base` branch, the `head` commit the prepass checked, `setBase` to move an open PR onto `base`, and a `gh` stand-in for tests
 * @returns The PR `url` and `number`, whether it was `created`, the comment `parts`, the result's `unresolved` units, `trapCandidates`, tester gap count and `reportNotes`, and `baseMismatch` naming an open PR's base when it is not `base`
 * @throws When the result file is unreadable or has a blank summary, when the PR's head on GitHub is not `head`, or when a `gh` call fails
 */
export function publish(
  root,
  config,
  { result: resultPath, base, head, setBase = false, gh = runGh },
) {
  const skill = `/${config.name}`;
  if (!head) throw new Error(`publish needs the head commit ${skill} checked.`);

  const result = readResult(path.resolve(root, resultPath), skill);
  const run = (...args) => gh(args, root);
  const branch = run('branch-name');
  const work = mkdtempSync(path.join(tmpdir(), 'pr-publish-'));

  try {
    const bodyFile = path.join(work, 'body.md');
    writeFileSync(
      bodyFile,
      fillTemplate(
        readFileSync(path.join(root, config.template), 'utf8'),
        result.summary,
      ),
    );

    const open = findOpenPr(run, branch);
    if (open) {
      // Refused before the edit, so a stale run leaves the PR untouched.
      assertSameHead(run, open, head, skill);
      run(
        'pr',
        'edit',
        String(open.number),
        '--title',
        branch,
        ...(setBase ? ['--base', base] : []),
        '--body-file',
        bodyFile,
      );
    } else {
      run(
        'pr',
        'create',
        '--draft',
        '--title',
        branch,
        '--base',
        base,
        '--body-file',
        bodyFile,
      );
    }

    const pr = JSON.parse(
      run('pr', 'view', branch, '--json', 'number,url,headRefOid'),
    );
    assertSameHead(run, pr, head, skill);
    const bodies = buildComments(result.checklist, pr.headRefOid);
    const existing = listChecklistComments(run, pr.number);

    bodies.forEach((body, i) => {
      const file = path.join(work, `comment-${i + 1}.md`);
      writeFileSync(file, body);

      const id = existing.get(i + 1);
      if (id) {
        run(
          'api',
          `repos/{owner}/{repo}/issues/comments/${id}`,
          '-X',
          'PATCH',
          '-F',
          `body=@${file}`,
        );
      } else {
        run(
          'api',
          `repos/{owner}/{repo}/issues/${pr.number}/comments`,
          '-X',
          'POST',
          '-F',
          `body=@${file}`,
        );
      }
    });

    // A checklist that shrank leaves continuation comments with nothing in them.
    for (const [part, id] of existing) {
      if (part > bodies.length) {
        run(
          'api',
          `repos/{owner}/{repo}/issues/comments/${id}`,
          '-X',
          'DELETE',
        );
      }
    }

    return {
      url: pr.url,
      number: pr.number,
      created: !open,
      parts: bodies.length,
      unresolved: result.unresolved ?? [],
      trapCandidates: result.trapCandidates ?? [],
      gaps: (result.gaps ?? []).length,
      reportNotes: result.reportNotes ?? [],
      baseMismatch:
        open && !setBase && open.baseRefName && open.baseRefName !== base
          ? open.baseRefName
          : null,
    };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/**
 * Reads the workflow's result from a file.
 *
 * Accepts the result on its own, or the Workflow tool's task output file,
 * which wraps it under `result`.
 *
 * @param file - Absolute path to the JSON file
 * @param skill - The slash command that produced it, for the message when the summary is empty
 * @returns The result, with `summary` and `checklist`
 * @throws When the file is not JSON or holds no summary and checklist
 */
export function readResult(file, skill = '/pr') {
  let parsed;

  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(
      `Could not read the workflow result from ${file}: ${error.message}`,
    );
  }

  const result =
    typeof parsed?.result === 'object' && parsed.result
      ? parsed.result
      : parsed;

  if (
    typeof result?.summary !== 'string' ||
    typeof result?.checklist !== 'string'
  ) {
    throw new Error(
      `${file} holds no workflow result with a summary and a checklist.`,
    );
  }

  if (!result.summary.trim()) {
    throw new Error(
      `${file} has an empty PR summary: the summary agent returned nothing. Write one into the result or re-run ${skill}.`,
    );
  }

  return result;
}

/**
 * Puts the summary into the PR template in place of its marker.
 *
 * @param template - The PR template's text
 * @param summary - The summary markdown
 * @returns The PR body
 */
export function fillTemplate(template, summary) {
  return template.replace(SUMMARY_MARKER, () => summary.trimEnd());
}

/**
 * Refuses to go on when the PR's head on GitHub is not the commit the skill checked.
 *
 * The checklist is stamped with GitHub's head, so it must describe that code.
 *
 * @param run - Runs `gh` and returns its stdout
 * @param pr - The PR's `number` and `headRefOid`
 * @param head - The commit the prepass diffed
 * @param skill - The slash command, as the message names it
 * @throws When they differ, saying whether to push or to re-run the skill
 */
function assertSameHead(run, pr, head, skill) {
  const remote = pr.headRefOid;
  if (remote && remote.toLowerCase() === head.toLowerCase()) return;

  let unpushed = false;
  try {
    run('is-ancestor', remote, head);
    unpushed = true;
  } catch {
    // Not an ancestor, or git has never seen the commit: it landed elsewhere.
  }

  const where = `PR #${pr.number} is at ${String(remote).slice(0, 7)} but ${skill} checked ${head.slice(0, 7)}`;
  throw new Error(
    unpushed
      ? `${where}: the branch has commits GitHub does not, so push first, then run publish again.`
      : `${where}: commits landed on GitHub since then, so re-run ${skill}.`,
  );
}

/**
 * Finds the branch's open pull request.
 *
 * @param run - Runs `gh` and returns its stdout
 * @param branch - The branch name
 * @returns The open PR's `number`, `headRefOid` and `baseRefName`, or null when there is none
 */
function findOpenPr(run, branch) {
  try {
    const pr = JSON.parse(
      run(
        'pr',
        'view',
        branch,
        '--json',
        'number,state,headRefOid,baseRefName',
      ),
    );
    return pr.state === 'OPEN' ? pr : null;
  } catch {
    return null;
  }
}

/**
 * Lists the checklist comments already on a pull request, skipping any the
 * gate would not trust: those whose author cannot push.
 *
 * @param run - Runs `gh` and returns its stdout
 * @param number - The PR number
 * @returns Each comment's id by part number, the first comment being part 1
 */
function listChecklistComments(run, number) {
  const stdout = run(
    'api',
    `repos/{owner}/{repo}/issues/${number}/comments`,
    '--paginate',
    '--jq',
    '.[] | select(.body | startswith("<!-- pr-qa:manual-checklist")) | {id, login: .user.login, head: (.body | split("\\n") | .[0])} | @json',
  );
  const ids = new Map();
  const trusted = new Map();

  const canPushHere = (login) => {
    if (!trusted.has(login)) {
      try {
        trusted.set(
          login,
          canPush(
            JSON.parse(
              run(
                'api',
                `repos/{owner}/{repo}/collaborators/${encodeURIComponent(login)}/permission`,
              ),
            ),
          ),
        );
      } catch {
        trusted.set(login, false);
      }
    }
    return trusted.get(login);
  };

  for (const line of stdout.split('\n').filter(Boolean)) {
    let entry = JSON.parse(line);
    if (typeof entry === 'string') entry = JSON.parse(entry);
    if (!canPushHere(entry.login)) continue;

    const head = entry.head.trim();
    if (head === CHECKLIST_MARKER) {
      ids.set(1, entry.id);
      continue;
    }
    const part = /part=(\d+)/.exec(head);
    if (part) ids.set(Number(part[1]), entry.id);
  }

  return ids;
}

/**
 * Builds the checklist comment bodies, splitting a long checklist across comments.
 *
 * @param checklist - The workflow's checklist markdown
 * @param sha - The PR's head SHA
 * @param limit - The most characters one comment may hold
 * @returns One body per comment, the first carrying the banner block
 */
export function buildComments(checklist, sha, limit = COMMENT_LIMIT) {
  const short = sha.slice(0, 7);
  // Room for the longest header, so the header never pushes a body over.
  const room = limit - 400;
  const chunks = splitChecklist(checklist.trim(), room);

  return chunks.map((chunk, i) => {
    const count =
      chunks.length > 1 ? ` (part ${i + 1} of ${chunks.length})` : '';
    const head =
      i === 0
        ? [
            CHECKLIST_MARKER,
            `<!-- pr-qa:sha=${sha} -->`,
            BANNER_START,
            BANNER_END,
          ]
        : [partMarker(i + 1), `<!-- pr-qa:sha=${sha} -->`];

    return `${head.join('\n')}\n\n## Manual QA — \`${short}\`${count}\n\n${chunk}\n`;
  });
}

/**
 * Splits checklist markdown into pieces that each fit within a limit.
 *
 * Sections are kept whole where they fit, steps where a section does not, and
 * a step is cut between lines only when it alone is over the limit.
 *
 * @param text - The checklist markdown
 * @param limit - The most characters one piece may hold
 * @returns The pieces, in order
 */
export function splitChecklist(text, limit) {
  if (text.length <= limit) return [text];

  const units = text
    .split(/\n(?=---\n)/)
    .flatMap((section) =>
      section.length <= limit
        ? [section]
        : section
            .split(/\n(?=- \[[ xX]\] )/)
            .flatMap((step) =>
              step.length <= limit ? [step] : byLines(step, limit),
            ),
    );

  const pieces = [];
  let current = '';

  for (const unit of units) {
    const joined = current ? `${current}\n${unit}` : unit;
    if (joined.length <= limit) {
      current = joined;
    } else {
      pieces.push(current);
      current = unit;
    }
  }

  if (current) pieces.push(current);
  return pieces;
}

/**
 * Splits text at line breaks into pieces that each fit within a limit.
 *
 * @param text - The text
 * @param limit - The most characters one piece may hold
 * @returns The pieces; a single line longer than the limit is cut mid-line
 */
function byLines(text, limit) {
  const pieces = [];
  let current = '';

  for (const line of text.split('\n')) {
    for (let start = 0; start < Math.max(line.length, 1); start += limit) {
      const part = line.slice(start, start + limit);
      const joined = current ? `${current}\n${part}` : part;
      if (joined.length <= limit) {
        current = joined;
      } else {
        pieces.push(current);
        current = part;
      }
    }
  }

  if (current) pieces.push(current);
  return pieces;
}

/**
 * Runs `gh`, or answers `branch-name` and `is-ancestor <a> <b>` from git.
 *
 * @param args - The arguments, `['branch-name']`, or `['is-ancestor', a, b]`
 * @param cwd - The repository root
 * @returns The trimmed stdout
 * @throws When the command fails, with its stderr in the message; `is-ancestor` fails when `a` is not an ancestor of `b`
 */
function runGh(args, cwd) {
  const [command, argv] =
    args[0] === 'branch-name'
      ? ['git', ['branch', '--show-current']]
      : args[0] === 'is-ancestor'
        ? ['git', ['merge-base', '--is-ancestor', args[1], args[2]]]
        : ['gh', args];

  try {
    return execFileSync(command, argv, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    const detail = String(error.stderr ?? '').trim() || error.message;
    throw new Error(
      `${command} ${argv.slice(0, 2).join(' ')} failed: ${detail}`,
    );
  }
}
