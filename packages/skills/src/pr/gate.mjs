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

/**
 * The repository roles whose checklist comments count: anyone who can push.
 *
 * Anyone who can comment could otherwise post a marked, pre-ticked checklist
 * and turn the gate green.
 */
export const TRUSTED_ROLES = ['admin', 'maintain', 'write'];

/** The skill's name when the workflow does not pass one. */
const DEFAULT_SKILL = 'pr';

/** Page cap when reading a PR's comments, as a backstop against a runaway loop. */
const MAX_COMMENT_PAGES = 50;

/**
 * A markdown task-list item, ticked or not.
 *
 * GitHub accepts `-`, `*`, `+`, `1.` and `1)` as the marker, followed by up to
 * four spaces or a tab, so all of them match: a `* [x]` that reset skipped
 * would be a ticked box surviving a push.
 */
const BOX_PATTERN =
  /^[ \t]*(?:[-*+]|\d{1,9}[.)])(?: {1,4}|\t)\[[ xX]\](?=\s|$)/;

/** The same item, split so the state character can be replaced on its own. */
const TICKED_BOX_PATTERN =
  /^([ \t]*(?:[-*+]|\d{1,9}[.)])(?: {1,4}|\t)\[)[xX](\](?=\s|$))/;

/** The checklist's visible heading, which carries a short SHA of its own. */
const HEADING_PATTERN =
  /^(##[ \t]+Manual QA[ \t]+—[ \t]+`)[0-9a-fA-F]{7,40}(`)/m;

/** The line a tester or agent pastes under a step: `> **Observed** …` or `> **Failed** …`. */
const OBSERVATION_PATTERN = /^[ \t]*>[ \t]*\*\*(?:Observed|Failed)\*\*/;

/** A quoted line, which continues the observation above it. */
const QUOTE_PATTERN = /^[ \t]*>/;

/**
 * A repo path cited in backticks, with an optional `:line` or `:from-to`.
 * Segments may hold the `[id]`, `(group)`, `+page` and `$id` of route files.
 */
const CITED_PATH_PATTERN =
  /`([\w.@$+~()[\]-]+(?:\/[\w.@$+~()[\]-]+)*)(?::\d+(?:[-:]\d+)?)?`/g;

/**
 * A line that ends the step above it: a heading, a rule, or the section's
 * teardown, Covered by line or gaps, none of which belong to that step.
 */
const STEP_END_PATTERN =
  /^(?:#{1,6}[ \t]|[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t\r]*$|[ \t]*\*\*(?:Teardown|Covered by|Not covered here):\*\*)/;

/** The banner's lead-in to the steps a push may have made stale. */
const STALE_LEAD = 'so they may be stale';

/** The part count a split checklist's first heading carries. */
const PART_COUNT_PATTERN =
  /^##[ \t]+Manual QA[ \t]+—[ \t]+`[0-9a-fA-F]{7,40}`[ \t]+\(part 1 of (\d+)\)/m;

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
 * Tells whether a comment body opens with a checklist marker, main or part.
 *
 * A marker must open the comment: a "Quote reply" prefixes every line with
 * `> `, and a quoted checklist must never count as the checklist.
 *
 * @param body - A comment body
 * @returns Whether it is marked as a checklist comment
 */
export function isChecklistBody(body) {
  if (typeof body !== 'string') return false;
  const start = body.trimStart();
  return start.startsWith(CHECKLIST_MARKER) || PART_MARKER_PATTERN.test(start);
}

/**
 * Tells whether a permission API answer lets its user push.
 *
 * @param answer - The body of `GET /repos/{repo}/collaborators/{user}/permission`
 * @returns Whether the user's role is write or above
 */
export function canPush(answer) {
  return (
    TRUSTED_ROLES.includes(answer?.role_name) ||
    ['admin', 'write'].includes(answer?.permission)
  );
}

/**
 * Picks the checklist comment and its continuation parts from a PR's comments.
 *
 * Only comments whose author is in `trusted` count.
 *
 * @param comments - Comments in API order, oldest first, each with its `user.login`
 * @param trusted - The logins allowed to post a checklist
 * @returns The last marked `main` comment or null, and the last comment for each part number, in order
 */
export function findChecklistComments(comments, trusted) {
  let main = null;
  const parts = new Map();

  for (const comment of comments ?? []) {
    if (!isChecklistBody(comment?.body)) continue;
    if (!trusted.has(comment.user?.login)) continue;

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
function buildBanner({
  headSha,
  previousSha,
  counts,
  now,
  staleSteps = [],
  skill = DEFAULT_SKILL,
}) {
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

  if (staleSteps.length > 0) {
    lines.push(
      '>',
      `> Pushes since this checklist was drafted changed files these steps cite, ${STALE_LEAD} — re-run \`/${skill}\` to redraft them:`,
      ...staleSteps.map((title) => `> - ${title}`),
    );
  }

  return lines.join('\n');
}

/**
 * Reads the steps an earlier reset's banner already named as possibly stale.
 *
 * They stay named until the skill redrafts the checklist, which writes an
 * empty banner, so a later push touching other files does not hide them.
 *
 * @param body - A checklist comment body
 * @returns The step titles the banner lists, or none
 */
export function listedStaleSteps(body) {
  const start = body.indexOf(BANNER_START);
  const end = body.indexOf(BANNER_END);
  if (start === -1 || end <= start) return [];

  const lines = body.slice(start, end).split('\n');
  const lead = lines.findIndex((line) => line.includes(STALE_LEAD));
  if (lead === -1) return [];

  return lines
    .slice(lead + 1)
    .map((line) => /^>[ \t]*-[ \t]+(.+?)[ \t\r]*$/.exec(line)?.[1])
    .filter(Boolean);
}

/**
 * Clears a checklist comment back to untested.
 *
 * Un-ticks every box outside a fenced block, and restamps the hidden SHA
 * marker, the visible heading and, when the body has one, the banner block.
 * Each step also keeps only its latest **Observed** or **Failed** note, so
 * notes from earlier passes do not pile up under it.
 *
 * @param body - The current comment body
 * @param context - The `headSha` to stamp, the reset time `now`, `counts` to report in the banner when the checklist spans several comments, the `staleSteps` the push may have made stale, and the `skill` name to re-run
 * @returns The cleared body
 */
export function resetBody(
  body,
  {
    headSha,
    now,
    counts = countBoxes(body),
    staleSteps = [],
    skill = DEFAULT_SKILL,
  },
) {
  const previousSha = readStampedSha(body);
  const lines = body.split('\n');
  const fenced = fenceMask(lines);
  const dropped = olderObservations(lines, fenced);

  let next = lines
    .map((line, index) =>
      fenced[index] ? line : line.replace(TICKED_BOX_PATTERN, '$1 $2'),
    )
    .filter((_, index) => !dropped.has(index))
    .join('\n');

  next = next.replace(SHA_MARKER_PATTERN, `<!-- pr-qa:sha=${headSha} -->`);
  next = next.replace(HEADING_PATTERN, `$1${shortSha(headSha)}$2`);

  const bannerStart = next.indexOf(BANNER_START);
  const bannerEnd = next.indexOf(BANNER_END);

  if (bannerStart !== -1 && bannerEnd > bannerStart) {
    const banner = buildBanner({
      headSha,
      previousSha,
      counts,
      now,
      staleSteps,
      skill,
    });
    next = `${next.slice(0, bannerStart + BANNER_START.length)}\n\n${banner}\n\n${next.slice(bannerEnd)}`;
  }

  return next;
}

/**
 * Finds the observation notes a reset removes: every one under a step but
 * the last.
 *
 * An observation is its `> **Observed**` or `> **Failed**` line plus the
 * quoted lines continuing it, the fenced output pasted right under it, and
 * the blank line after it. A step's notes end at the next box, or at a line
 * that is no part of the step, so a note under a section's teardown or setup
 * never replaces the step's own.
 *
 * @param lines - The body split on newlines
 * @param fenced - Which lines sit inside a fenced block
 * @returns The indices of the lines to remove
 */
function olderObservations(lines, fenced) {
  const dropped = new Set();
  let notes = [];

  const settle = () => {
    for (const note of notes.slice(0, -1)) {
      for (const index of note) dropped.add(index);
    }
    notes = [];
  };
  const blank = (index) => index < lines.length && lines[index].trim() === '';

  for (let i = 0; i < lines.length; i += 1) {
    if (fenced[i]) continue;
    if (BOX_PATTERN.test(lines[i]) || STEP_END_PATTERN.test(lines[i])) {
      settle();
      continue;
    }
    if (!OBSERVATION_PATTERN.test(lines[i])) continue;

    const note = [i];
    while (
      i + 1 < lines.length &&
      !fenced[i + 1] &&
      QUOTE_PATTERN.test(lines[i + 1]) &&
      !OBSERVATION_PATTERN.test(lines[i + 1])
    ) {
      note.push((i += 1));
    }

    // Output pasted in a fence under the note, at most one blank line below it, is the note's.
    const fence = fenced[i + 1]
      ? i + 1
      : blank(i + 1) && fenced[i + 2]
        ? i + 2
        : -1;
    if (fence !== -1) {
      while (i + 1 < fence) note.push((i += 1));
      while (i + 1 < lines.length && fenced[i + 1]) note.push((i += 1));
    }

    if (blank(i + 1)) note.push(i + 1);
    notes.push(note);
  }
  settle();

  return dropped;
}

/**
 * Names the steps that cite a file a push changed.
 *
 * A step runs from its box to the next box or the next line that is no part
 * of it, such as a heading or the section's teardown, so a citation there is
 * never charged to the step above it.
 *
 * @param body - A checklist comment body
 * @param changed - The repo paths the push changed
 * @returns Each such step's title, as its checkbox line shows it
 */
export function staleSteps(body, changed) {
  if (changed.length === 0) return [];

  const lines = body.split('\n');
  const fenced = fenceMask(lines);
  const titles = [];
  let title = null;
  let cited = false;

  const close = () => {
    if (title && cited) titles.push(title);
    title = null;
  };
  // A bare file name only matches a file at the root; a path also matches a longer path's tail.
  const changes = (path) =>
    changed.some(
      (file) =>
        file === path || (path.includes('/') && file.endsWith(`/${path}`)),
    );

  lines.forEach((line, index) => {
    if (fenced[index]) return;
    if (BOX_PATTERN.test(line)) {
      close();
      // The same grammar as the box itself, so a CRLF line cannot slip between two patterns.
      title = line.replace(BOX_PATTERN, '').replace(/\*\*/g, '').trim();
      cited = false;
    } else if (STEP_END_PATTERN.test(line)) {
      close();
      return;
    }
    if (!title || cited) return;

    for (const [, path] of line.matchAll(CITED_PATH_PATTERN)) {
      if (changes(path)) cited = true;
    }
  });
  close();

  return titles;
}

/**
 * Lists the files that differ between two commits.
 *
 * GitHub's compare diffs from the merge base. After a plain push that is the
 * old commit, so its files are exactly what changed. After a force-push it is
 * not: both commits are compared with the merge base, and a path counts when
 * its version differs between them.
 *
 * @param api - The GitHub client
 * @param repo - `owner/repo`
 * @param from - The commit the checklist was stamped against
 * @param to - The new head
 * @returns The changed paths, old names included, or none when GitHub cannot say
 */
async function changedFiles(api, repo, from, to) {
  try {
    const forward = await api(`/repos/${repo}/compare/${from}...${to}`);
    if (!['behind', 'diverged'].includes(forward?.status)) {
      return (forward?.files ?? []).flatMap((file) =>
        [file.filename, file.previous_filename].filter(Boolean),
      );
    }

    const back = await api(`/repos/${repo}/compare/${to}...${from}`);
    const before = fileVersions(back);
    const after = fileVersions(forward);
    return [...new Set([...before.keys(), ...after.keys()])].filter(
      (file) => before.get(file) !== after.get(file),
    );
  } catch {
    // A force-push can drop the old commit; the reset goes ahead without the list.
    return [];
  }
}

/**
 * Maps each path a compare touched to its version on the compare's head side.
 *
 * @param answer - A compare response
 * @returns Each path's blob SHA, or `removed` for a path gone on that side
 */
function fileVersions(answer) {
  const versions = new Map();

  for (const file of answer?.files ?? []) {
    versions.set(
      file.filename,
      file.status === 'removed' ? 'removed' : file.sha,
    );
    if (file.previous_filename) versions.set(file.previous_filename, 'removed');
  }

  return versions;
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
 * Checks for a missing checklist or part first, then a stale stamp on any
 * comment, then outstanding boxes across every comment.
 *
 * @param context - The checklist `main` comment or null, its continuation `parts`, the `headSha` the status attaches to, and the `skill` a fix re-runs
 * @returns The status `state` and `description`
 */
export function computeStatus({
  main,
  parts = [],
  headSha,
  skill = DEFAULT_SKILL,
}) {
  if (!main) {
    return { state: 'failure', description: `no QA checklist — run /${skill}` };
  }

  // A part that was never posted, or was deleted, would drop its boxes unseen.
  const expected = Number(PART_COUNT_PATTERN.exec(main.body ?? '')?.[1] ?? 1);
  for (let n = 2; n <= expected; n += 1) {
    if (!parts.some(({ part }) => part === n)) {
      return {
        state: 'failure',
        description: `checklist part ${n} of ${expected} is missing — re-run /${skill}`,
      };
    }
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
 * Finds which authors of checklist comments can push to the repository.
 *
 * @param api - The GitHub client
 * @param repo - `owner/repo`
 * @param comments - The PR's comments
 * @returns The logins allowed to post a checklist; a failed lookup leaves its login out
 */
async function pushers(api, repo, comments) {
  const logins = new Set(
    comments
      .filter((comment) => isChecklistBody(comment?.body))
      .map((comment) => comment.user?.login)
      .filter(Boolean),
  );
  const trusted = new Set();

  for (const login of logins) {
    try {
      const answer = await api(
        `/repos/${repo}/collaborators/${encodeURIComponent(login)}/permission`,
      );
      if (canPush(answer)) trusted.add(login);
    } catch {
      // Not a collaborator, or the lookup failed: the comment does not count.
    }
  }

  return trusted;
}

/**
 * Runs `reset` or `status` for one pull request, ending with the commit status.
 *
 * `reset` clears every checklist comment not already stamped against the head,
 * so a `ready_for_review` event or a re-run with an unchanged head leaves the
 * ticks alone. A checklist with no boxes at all is left on its old commit and
 * the status asks for a re-run, since the push may have added code worth
 * checking.
 *
 * @param command - `reset` or `status`
 * @param context - The GitHub `api` client, `repo`, `prNumber`, the `headSha` when the event carries one, the `skill` name for status text, and the time `now`
 * @returns The status that was posted
 */
export async function runGate(
  command,
  { api, repo, prNumber, headSha, skill = DEFAULT_SKILL, now = new Date() },
) {
  const head =
    headSha ?? (await api(`/repos/${repo}/pulls/${prNumber}`)).head.sha;
  const comments = await listComments(api, repo, prNumber);
  let { main, parts } = findChecklistComments(
    comments,
    await pushers(api, repo, comments),
  );

  let status = null;

  if (command === 'reset' && main) {
    const checklist = [main, ...parts.map(({ comment }) => comment)];
    const counts = sumCounts(checklist.map((comment) => comment.body ?? ''));
    const stale = checklist.filter(
      (comment) => !sameCommit(readStampedSha(comment.body ?? ''), head),
    );

    if (stale.length > 0 && counts.total === 0) {
      // With no boxes to clear, a restamp would pass new code nobody looked at.
      status = {
        state: 'failure',
        description: `checklist predates ${shortSha(head)}, re-run /${skill}`,
      };
    } else {
      const updated = [];
      const previous = readStampedSha(main.body ?? '');
      const changed =
        stale.length > 0 && previous
          ? await changedFiles(api, repo, previous, head)
          : [];
      // Steps an earlier push flagged stay flagged until the skill redrafts them.
      const possiblyStale = [
        ...new Set([
          ...listedStaleSteps(main.body ?? ''),
          ...checklist.flatMap((comment) =>
            staleSteps(comment.body ?? '', changed),
          ),
        ]),
      ];

      for (const comment of checklist) {
        if (!stale.includes(comment)) {
          updated.push(comment);
          continue;
        }

        // Re-read first: a publish since the listing may have stamped it already.
        const fresh = await api(`/repos/${repo}/issues/comments/${comment.id}`);
        if (sameCommit(readStampedSha(fresh.body ?? ''), head)) {
          updated.push(fresh);
          continue;
        }

        const body = resetBody(fresh.body ?? '', {
          headSha: head,
          now,
          counts,
          staleSteps: possiblyStale,
          skill,
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
  }

  status ??= computeStatus({ main, parts, headSha: head, skill });

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
 * @returns The `token`, `repo`, `prNumber`, `headSha` (null when unset) and the `skill` name from `QA_SKILL`
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

  return {
    token,
    repo,
    prNumber,
    headSha: env.HEAD_SHA || null,
    skill: env.QA_SKILL?.trim() || DEFAULT_SKILL,
  };
}
