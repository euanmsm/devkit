// ============================================================================
// Manual QA Gate
// ============================================================================
//
// `skills qa-gate reset|status`, run by the generated GitHub workflow. Keeps
// the `Manual QA` commit status honest about which commit the checklist was
// ticked against: a push un-ticks every box, and the status stays red until
// they are ticked again.

/** Hidden marker opening the checklist's first comment. */
export const CHECKLIST_MARKER = '<!-- pr-qa:manual-checklist -->';

/** Hidden marker recording which commit the checklist was ticked against. */
const SHA_MARKER_PATTERN = /<!--\s*pr-qa:sha=([0-9a-fA-F]{7,40})\s*-->/;

/** Hidden marker opening each continuation comment of a long checklist. */
const PART_MARKER_PATTERN = /^<!-- pr-qa:manual-checklist:part=(\d+) -->/;

/** Opens the block the reset banner is written into. */
export const BANNER_START = '<!-- pr-qa:banner:start -->';

/** Closes the block the reset banner is written into. */
export const BANNER_END = '<!-- pr-qa:banner:end -->';

/** The commit-status context a branch ruleset requires. */
const STATUS_CONTEXT = 'Manual QA';

/** Page cap when reading a PR's comments, as a backstop against a runaway loop. */
const MAX_COMMENT_PAGES = 50;

/**
 * A markdown task-list item, ticked or not.
 *
 * GitHub accepts `-`, `*` and `+` as the bullet, so all three match: a `* [x]`
 * that reset skipped would be a ticked box surviving a push.
 */
const BOX_PATTERN = /^[ \t]*[-*+] \[[ xX]\](?=\s|$)/;

/** The same item, split so the state character can be replaced on its own. */
const TICKED_BOX_PATTERN = /^([ \t]*[-*+] \[)[xX](\](?=\s|$))/;

/** The checklist's visible heading, which carries a short SHA of its own. */
const HEADING_PATTERN =
  /^(##[ \t]+Manual QA[ \t]+—[ \t]+`)[0-9a-fA-F]{7,40}(`)/m;

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Builds the marker opening one continuation comment.
 *
 * @param part - The part number, 2 or more
 * @returns The marker line
 */
export function partMarker(part) {
  return `<!-- pr-qa:manual-checklist:part=${part} -->`;
}

/**
 * Marks which lines of a markdown body sit inside a fenced code block.
 *
 * A fence opens on three or more backticks or tildes and closes on the same
 * character at the same length or longer.
 *
 * @param lines - The body split on newlines
 * @returns One flag per line, true when the line is fenced
 */
function fenceMask(lines) {
  const mask = [];
  let fence = null;

  for (const line of lines) {
    const delimiter = /^[ \t]*(`{3,}|~{3,})/.exec(line);

    // Inside a fence every line is protected, including the closer itself.
    if (fence) {
      mask.push(true);

      // The trailing `\r` class matches CRLF bodies from GitHub's web editor.
      const closer = /^[ \t]*(`{3,}|~{3,})[ \t\r]*$/.exec(line);
      if (
        closer &&
        closer[1][0] === fence.char &&
        closer[1].length >= fence.length
      ) {
        fence = null;
      }
      continue;
    }

    if (delimiter) {
      fence = { char: delimiter[1][0], length: delimiter[1].length };
      mask.push(true);
      continue;
    }

    mask.push(false);
  }

  return mask;
}

/**
 * Renders a UTC timestamp as `18 Aug 2026, 14:02 UTC`, without `Intl`.
 *
 * @param date - The moment to render
 * @returns The formatted stamp
 */
function formatStamp(date) {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  const minute = String(date.getUTCMinutes()).padStart(2, '0');

  return `${day} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}, ${hour}:${minute} UTC`;
}

/**
 * Shortens a commit SHA for display.
 *
 * @param sha - A full or short SHA
 * @returns Its first seven characters
 */
function shortSha(sha) {
  return sha.slice(0, 7);
}

/**
 * Compares two commit SHAs, ignoring case.
 *
 * @param a - A SHA, or nothing
 * @param b - A SHA, or nothing
 * @returns Whether both are set and equal
 */
function sameCommit(a, b) {
  return Boolean(a) && Boolean(b) && a.toLowerCase() === b.toLowerCase();
}

/**
 * Picks the checklist comment and its continuation parts from a PR's comments.
 *
 * A marker must open the comment: a "Quote reply" prefixes every line with
 * `> `, and a quoted checklist must never count as the checklist.
 *
 * @param comments - Comments in API order, oldest first
 * @returns The last marked `main` comment or null, and the last comment for each part number, in order
 */
export function findChecklistComments(comments) {
  let main = null;
  const parts = new Map();

  for (const comment of comments ?? []) {
    if (typeof comment?.body !== 'string') continue;

    const body = comment.body.trimStart();
    if (body.startsWith(CHECKLIST_MARKER)) {
      main = comment;
      continue;
    }

    const part = PART_MARKER_PATTERN.exec(body);
    if (part) parts.set(Number(part[1]), comment);
  }

  return {
    main,
    parts: [...parts.entries()]
      .sort(([a], [b]) => a - b)
      .map(([part, comment]) => ({ part, comment })),
  };
}

/**
 * Reads the commit SHA a checklist body was stamped against.
 *
 * @param body - A checklist comment body
 * @returns The stamped SHA, or null when the marker is absent
 */
export function readStampedSha(body) {
  const match = SHA_MARKER_PATTERN.exec(body ?? '');
  return match ? match[1] : null;
}

/**
 * Counts the task-list boxes in a checklist body, ignoring fenced code blocks.
 *
 * @param body - A checklist comment body
 * @returns The `total`, `ticked` and `unticked` counts
 */
export function countBoxes(body) {
  const lines = (body ?? '').split('\n');
  const fenced = fenceMask(lines);
  let total = 0;
  let ticked = 0;

  lines.forEach((line, index) => {
    if (fenced[index] || !BOX_PATTERN.test(line)) return;

    total += 1;
    if (TICKED_BOX_PATTERN.test(line)) ticked += 1;
  });

  return { total, ticked, unticked: total - ticked };
}

/**
 * Composes the warning banner a reset leaves behind.
 *
 * @param context - The `headSha` that triggered the reset, the `previousSha` the ticks were made against, the box `counts` before clearing, and the reset time `now`
 * @returns A markdown alert block, without a trailing newline
 */
function buildBanner({ headSha, previousSha, counts, now }) {
  const lines = [
    '> [!WARNING]',
    `> **Reset by push \`${shortSha(headSha)}\` — ${formatStamp(now)}.**`,
  ];

  if (counts.total === 0) {
    lines.push('> The previous checklist carried no boxes.');
  } else if (previousSha) {
    lines.push(
      `> The previous pass ticked ${counts.ticked} of ${counts.total} boxes against \`${shortSha(previousSha)}\`.`,
    );
  } else {
    lines.push(
      `> The previous pass ticked ${counts.ticked} of ${counts.total} boxes.`,
    );
  }

  lines.push(
    '> Every box below is now clear, and the `Manual QA` check stays red until',
    '> they are ticked again.',
  );

  return lines.join('\n');
}

/**
 * Clears a checklist comment back to untested.
 *
 * Un-ticks every box outside a fenced block, and restamps the hidden SHA
 * marker, the visible heading and, when the body has one, the banner block.
 *
 * @param body - The current comment body
 * @param context - The `headSha` to stamp, the reset time `now`, and `counts` to report in the banner when the checklist spans several comments
 * @returns The cleared body
 */
export function resetBody(body, { headSha, now, counts = countBoxes(body) }) {
  const previousSha = readStampedSha(body);
  const lines = body.split('\n');
  const fenced = fenceMask(lines);

  let next = lines
    .map((line, index) =>
      fenced[index] ? line : line.replace(TICKED_BOX_PATTERN, '$1 $2'),
    )
    .join('\n');

  next = next.replace(SHA_MARKER_PATTERN, `<!-- pr-qa:sha=${headSha} -->`);
  next = next.replace(HEADING_PATTERN, `$1${shortSha(headSha)}$2`);

  const bannerStart = next.indexOf(BANNER_START);
  const bannerEnd = next.indexOf(BANNER_END);

  if (bannerStart !== -1 && bannerEnd > bannerStart) {
    const banner = buildBanner({ headSha, previousSha, counts, now });
    next = `${next.slice(0, bannerStart + BANNER_START.length)}\n\n${banner}\n\n${next.slice(bannerEnd)}`;
  }

  return next;
}

/**
 * Phrases the "this checklist is for a different commit" failure.
 *
 * @param stamped - The stamped SHA, or null
 * @param headSha - The PR's head SHA
 * @returns The status description, with SHAs shortened unless that makes them collide
 */
function describeStaleStamp(stamped, headSha) {
  if (!stamped)
    return `checklist is for no commit, head is ${shortSha(headSha)}`;

  const collides = shortSha(stamped) === shortSha(headSha);
  const left = collides ? stamped : shortSha(stamped);
  const right = collides ? headSha : shortSha(headSha);

  return `checklist is for ${left}, head is ${right}`;
}

/**
 * Decides what the `Manual QA` commit status should say.
 *
 * Checks for a missing checklist first, then a stale stamp on any comment,
 * then outstanding boxes across every comment.
 *
 * @param context - The checklist `main` comment or null, its continuation `parts`, and the `headSha` the status attaches to
 * @returns The status `state` and `description`
 */
export function computeStatus({ main, parts = [], headSha }) {
  if (!main) {
    return { state: 'failure', description: 'no QA checklist — run /pr' };
  }

  const bodies = [
    main.body ?? '',
    ...parts.map(({ comment }) => comment.body ?? ''),
  ];

  for (const body of bodies) {
    const stamped = readStampedSha(body);
    if (!sameCommit(stamped, headSha)) {
      return {
        state: 'failure',
        description: describeStaleStamp(stamped, headSha),
      };
    }
  }

  const { total, unticked } = sumCounts(bodies);

  if (unticked > 0) {
    return {
      state: 'failure',
      description: `${unticked} of ${total} checks outstanding`,
    };
  }

  return {
    state: 'success',
    description: `${total} checks ticked against ${shortSha(headSha)}`,
  };
}

/**
 * Adds up the boxes across several bodies.
 *
 * @param bodies - Checklist comment bodies
 * @returns The combined `total`, `ticked` and `unticked` counts
 */
function sumCounts(bodies) {
  return bodies.map(countBoxes).reduce(
    (sum, counts) => ({
      total: sum.total + counts.total,
      ticked: sum.ticked + counts.ticked,
      unticked: sum.unticked + counts.unticked,
    }),
    { total: 0, ticked: 0, unticked: 0 },
  );
}

/**
 * Makes a GitHub REST client for one token.
 *
 * @param token - The token to call the API with
 * @param fetchImpl - `fetch`, replaceable in tests
 * @returns A function calling a path below https://api.github.com, returning parsed JSON or null
 */
export function githubClient(token, fetchImpl = fetch) {
  return async (path, init = {}) => {
    const response = await fetchImpl(`https://api.github.com${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'euanmsm-skills-qa-gate',
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });

    if (!response.ok) {
      throw new Error(
        `GitHub API ${init.method ?? 'GET'} ${path} failed: ${response.status} ${await response.text()}`,
      );
    }

    const text = await response.text();
    return text ? JSON.parse(text) : null;
  };
}

/**
 * Fetches every comment on a PR, oldest first.
 *
 * @param api - The GitHub client
 * @param repo - `owner/repo`
 * @param prNumber - The PR number
 * @returns The comments
 */
async function listComments(api, repo, prNumber) {
  const comments = [];

  for (let page = 1; page <= MAX_COMMENT_PAGES; page += 1) {
    const batch = await api(
      `/repos/${repo}/issues/${prNumber}/comments?per_page=100&page=${page}`,
    );
    comments.push(...batch);
    if (batch.length < 100) return comments;
  }

  console.warn(
    `Stopped reading comments at ${MAX_COMMENT_PAGES} pages — the checklist may have been missed.`,
  );
  return comments;
}

/**
 * Runs `reset` or `status` for one pull request, ending with the commit status.
 *
 * `reset` clears every checklist comment not already stamped against the head,
 * so a `ready_for_review` event or a re-run with an unchanged head leaves the
 * ticks alone.
 *
 * @param command - `reset` or `status`
 * @param context - The GitHub `api` client, `repo`, `prNumber`, the `headSha` when the event carries one, and the time `now`
 * @returns The status that was posted
 */
export async function runGate(
  command,
  { api, repo, prNumber, headSha, now = new Date() },
) {
  const head =
    headSha ?? (await api(`/repos/${repo}/pulls/${prNumber}`)).head.sha;
  let { main, parts } = findChecklistComments(
    await listComments(api, repo, prNumber),
  );

  if (command === 'reset' && main) {
    const comments = [main, ...parts.map(({ comment }) => comment)];
    const counts = sumCounts(comments.map((comment) => comment.body ?? ''));
    const updated = [];

    for (const comment of comments) {
      if (sameCommit(readStampedSha(comment.body ?? ''), head)) {
        updated.push(comment);
        continue;
      }

      const body = resetBody(comment.body ?? '', {
        headSha: head,
        now,
        counts,
      });
      updated.push(
        await api(`/repos/${repo}/issues/comments/${comment.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ body }),
        }),
      );
    }

    [main] = updated;
    parts = parts.map((part, i) => ({ ...part, comment: updated[i + 1] }));
  }

  const status = computeStatus({ main, parts, headSha: head });

  await api(`/repos/${repo}/statuses/${head}`, {
    method: 'POST',
    body: JSON.stringify({
      state: status.state,
      description: status.description,
      context: STATUS_CONTEXT,
      ...(main?.html_url ? { target_url: main.html_url } : {}),
    }),
  });

  return { headSha: head, ...status };
}

/**
 * Reads the environment the GitHub workflow passes in.
 *
 * @param env - The process environment
 * @returns The `token`, `repo`, `prNumber` and `headSha` (null when unset)
 * @throws When the token, repository or PR number is missing
 */
export function readGateEnv(env) {
  const token = env.GITHUB_TOKEN;
  const repo = env.GITHUB_REPOSITORY;
  // The dispatch trigger takes the PR number as free text.
  const prNumber = env.PR_NUMBER?.trim();

  const missing = [
    ['GITHUB_TOKEN', token],
    ['GITHUB_REPOSITORY', repo],
    ['PR_NUMBER', prNumber],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Missing required environment: ${missing.join(', ')}`);
  }

  return { token, repo, prNumber, headSha: env.HEAD_SHA || null };
}
