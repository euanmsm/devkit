// ============================================================================
// Review Page Preview Fixture
// ============================================================================
//
// A small made-up branch, "retry failed uploads", that touches every part of
// the review page: added, edited, deleted and moved files, a file with tests,
// a diff long enough to need "Show more", hunk notes whole and split into
// parts, a Skim group and a UI walkthrough. The notes name hunks only by
// position, so the preview fills in any the fixture's files grow past.

/** Numbered filler lines, so edits far apart land in separate hunks. */
const filler = (from, count, prefix = '  // step') =>
  Array.from({ length: count }, (_, i) => `${prefix} ${from + i}`).join('\n');

const QUEUE_BASE = `import { upload } from '../net/http';

/** One file waiting to be sent. */
export interface QueuedUpload {
  id: string;
  file: File;
  attempts: number;
}

/** Uploads files one at a time, in the order they were added. */
export class UploadQueue {
  private items: QueuedUpload[] = [];

  add(file: File) {
    this.items.push({ id: crypto.randomUUID(), file, attempts: 0 });
  }

${filler(1, 14)}

  async next() {
    const item = this.items.shift();
    if (!item) return null;
    try {
      return await upload(item.file);
    } catch (error) {
      throw new Error(\`\${item.file.name} failed to upload\`, { cause: error });
    }
  }

${filler(15, 14)}

  get size() {
    return this.items.length;
  }
}
`;

const QUEUE_HEAD = `import { upload } from '../net/http';
import { retryDelay, MAX_ATTEMPTS } from './backoff';

/** One file waiting to be sent. */
export interface QueuedUpload {
  id: string;
  file: File;
  attempts: number;
}

/** Uploads files one at a time, in the order they were added. */
export class UploadQueue {
  private items: QueuedUpload[] = [];

  add(file: File) {
    this.items.push({ id: crypto.randomUUID(), file, attempts: 0 });
  }

${filler(1, 14)}

  async next(sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))) {
    const item = this.items.shift();
    if (!item) return null;
    for (;;) {
      try {
        return await upload(item.file);
      } catch (error) {
        item.attempts += 1;
        if (item.attempts >= MAX_ATTEMPTS) {
          throw new Error(\`\${item.file.name} failed to upload\`, { cause: error });
        }
        await sleep(retryDelay(item.attempts));
      }
    }
  }

${filler(15, 14)}

  get size() {
    return this.items.length;
  }

  /** Files still waiting, including one between retries. */
  get pending() {
    return this.items.map((item) => item.file.name);
  }
}
`;

const BACKOFF = `/** Tries an upload gets before the user sees an error. */
export const MAX_ATTEMPTS = 3;

/** The first wait, doubled for each try since. */
const FIRST_WAIT_MS = 1000;

/** The longest any wait can be. */
const MAX_WAIT_MS = 10_000;

/**
 * How long to wait before the next try.
 *
 * @param attempts - Tries made so far
 * @returns The wait in milliseconds
 */
export function retryDelay(attempts: number): number {
  return Math.min(FIRST_WAIT_MS * 2 ** (attempts - 1), MAX_WAIT_MS);
}
`;

const BACKOFF_TEST = `import { describe, expect, it } from 'vitest';

import { MAX_ATTEMPTS, retryDelay } from '../backoff';

describe('retryDelay', () => {
  it('doubles from the first wait', () => {
    expect([1, 2, 3].map(retryDelay)).toEqual([1000, 2000, 4000]);
  });

  it('never waits longer than ten seconds', () => {
    expect(retryDelay(10)).toBe(10_000);
  });

  it('gives three tries', () => {
    expect(MAX_ATTEMPTS).toBe(3);
  });
});
`;

const QUEUE_TEST_BASE = `import { describe, expect, it, vi } from 'vitest';

import { UploadQueue } from '../queue';

vi.mock('../../net/http', () => ({ upload: vi.fn() }));

describe('UploadQueue', () => {
  it('uploads in the order files were added', async () => {
    const queue = new UploadQueue();
    queue.add(new File(['a'], 'a.txt'));
    expect(queue.size).toBe(1);
  });
});
`;

const QUEUE_TEST_HEAD = `import { describe, expect, it, vi } from 'vitest';

import { upload } from '../../net/http';
import { UploadQueue } from '../queue';

vi.mock('../../net/http', () => ({ upload: vi.fn() }));

describe('UploadQueue', () => {
  it('uploads in the order files were added', async () => {
    const queue = new UploadQueue();
    queue.add(new File(['a'], 'a.txt'));
    expect(queue.size).toBe(1);
  });

  it('retries a dropped connection before failing', async () => {
    vi.mocked(upload).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce('ok');
    const queue = new UploadQueue();
    queue.add(new File(['a'], 'a.txt'));
    await expect(queue.next(async () => {})).resolves.toBe('ok');
  });

  it('fails on the third try', async () => {
    vi.mocked(upload).mockRejectedValue(new Error('offline'));
    const queue = new UploadQueue();
    queue.add(new File(['a'], 'a.txt'));
    await expect(queue.next(async () => {})).rejects.toThrow('a.txt failed to upload');
  });
});
`;

const LEGACY_RETRY = `/**
 * Retries a promise once after a second.
 *
 * @deprecated The upload queue retries on its own now.
 */
export async function retryOnce<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return run();
  }
}
`;

const HTTP_BASE = `/** Sends one file to the upload endpoint. */
export async function upload(file: File): Promise<string> {
  const body = new FormData();
  body.append('file', file);
  const response = await fetch('/api/upload', { method: 'POST', body });
  if (!response.ok) throw new Error(\`upload failed: \${response.status}\`);
  return response.text();
}
`;

const HTTP_HEAD = HTTP_BASE.replace(
  "await fetch('/api/upload', { method: 'POST', body });",
  "await fetch('/api/upload', { method: 'POST', body, keepalive: true });",
);

const PROGRESS_BASE = `import { useUploads } from './useUploads';

/** The bar under the file list while an upload runs. */
export function UploadProgress() {
  const { current, percent } = useUploads();
  if (!current) return null;
  return (
    <div className="upload-progress">
      <span>Uploading {current}</span>
      <progress value={percent} max={100} />
    </div>
  );
}
`;

const PROGRESS_HEAD = `import { useUploads } from './useUploads';

/** The bar under the file list while an upload runs. */
export function UploadProgress() {
  const { current, percent, retryIn } = useUploads();
  if (!current) return null;
  return (
    <div className="upload-progress">
      <span>Uploading {current}</span>
      <progress value={percent} max={100} />
      {retryIn ? <span className="retry">retrying in {retryIn}s</span> : null}
    </div>
  );
}
`;

const page = (
  title,
  from,
) => `import { UploadProgress } from '../ui/UploadProgress';
import { upload } from '${from}';

export default function Page() {
  return (
    <main>
      <h1>${title}</h1>
      <UploadProgress />
      <button onClick={() => upload(new File([], 'empty.txt'))}>Upload</button>
    </main>
  );
}
`;

/** Long enough that its diff stops at "Show more" until asked. */
const MIME_TYPES = `/** The file types an upload may have, by extension. */
export const MIME_TYPES: Record<string, string> = {
${Array.from({ length: 300 }, (_, i) => `  ext${String(i + 1).padStart(3, '0')}: 'application/x-type-${i + 1}',`).join('\n')}
};
`;

const DOCS_BASE = `# Uploads

Files are uploaded one at a time from a queue.

## Failures

A failed upload shows an error straight away.

## Limits

Each file can be up to 20MB.
`;

const DOCS_HEAD = `# Uploads

Files are uploaded one at a time from a queue.

## Failures

A failed upload is tried three times, waiting one, two and then four seconds,
before the user sees an error. The progress bar shows the countdown.

## Limits

Each file can be up to 20MB.
`;

/** The `main` branch the preview branch forks from. */
export const baseFiles = {
  '.gitignore': 'tmp/\n',
  'README.md':
    '# Uploads demo\n\nA made-up app the review page preview is built from.\n',
  'docs/uploads.md': DOCS_BASE,
  'src/uploads/queue.ts': QUEUE_BASE,
  'src/uploads/__tests__/queue.test.ts': QUEUE_TEST_BASE,
  'src/uploads/legacyRetry.ts': LEGACY_RETRY,
  'src/lib/http.ts': HTTP_BASE,
  'src/ui/UploadProgress.tsx': PROGRESS_BASE,
  'src/app/page.tsx': page('Files', '../lib/http'),
  'src/app/settings/page.tsx': page('Settings', '../../lib/http'),
};

/** The preview branch, one commit at a time. */
export const commits = [
  {
    message: 'feat(uploads): add a retry backoff helper',
    write: {
      'src/uploads/backoff.ts': BACKOFF,
      'src/uploads/__tests__/backoff.test.ts': BACKOFF_TEST,
    },
  },
  {
    message: 'feat(uploads): retry failed uploads in the queue',
    write: {
      'src/uploads/queue.ts': QUEUE_HEAD,
      'src/uploads/__tests__/queue.test.ts': QUEUE_TEST_HEAD,
      'src/ui/UploadProgress.tsx': PROGRESS_HEAD,
    },
    remove: ['src/uploads/legacyRetry.ts'],
  },
  {
    message: 'refactor: move the http client to src/net',
    move: [['src/lib/http.ts', 'src/net/http.ts']],
    write: {
      'src/net/http.ts': HTTP_HEAD,
      'src/app/page.tsx': page('Files', '../net/http'),
      'src/app/settings/page.tsx': page('Settings', '../../net/http'),
    },
  },
  {
    message: 'feat(uploads): accept every known file type',
    write: { 'src/uploads/mimeTypes.ts': MIME_TYPES },
  },
  {
    message: 'docs(uploads): describe the retries',
    write: { 'docs/uploads.md': DOCS_HEAD },
  },
  {
    message: 'docs: reword the README',
    write: {
      'README.md':
        '# Uploads demo\n\nA made-up app, with a branch that retries failed uploads, for previewing the review page.\n',
    },
  },
];

/** A made-up PR, so the page shows its link and the comment export carries it. */
export const pr = {
  number: 123,
  title: 'Retry failed uploads before showing an error',
  url: 'https://github.com/example/uploads-demo/pull/123',
};

/**
 * The notes, as the agent would write them, full enough to show how every text
 * field reads. A file's `hunks` are matched to its diff by position; the
 * preview fills in any that are missing.
 */
export const notes = {
  overview: {
    title: pr.title,
    overview: {
      summary:
        'Uploads that fail on a dropped connection now retry three times, waiting one, two and then four seconds, before the user sees an error. Until now a single network blip lost the upload, and people on train Wi-Fi or a weak mobile signal had to start large files again from nothing. The retry lives in the upload queue, so nothing else that talks to the server changes. Along the way the http client moves from `src/lib` to `src/net`, which is why two pages change their imports, and uploads accept every known file type instead of images only.',
      userChanges: [
        'A brief connection drop no longer fails an upload. The progress bar pauses, shows **retrying in 2s**, and carries on from where it stopped.',
        'An upload only shows an error after its third failed try, about seven seconds after the first one. The error message is the same as before.',
        'Every known file type can be uploaded, not just images. A PDF, a spreadsheet or a zip now goes through.',
        'Closing the tab in the middle of an upload no longer cancels it, because the request is sent with `keepalive`.',
      ],
      holdInMind: [
        'Retries happen in `UploadQueue`, not in the http client, so other requests such as loading the file list still fail at once, as they should.',
        'The wait doubles from one second and never passes ten. With three tries the cap is never reached today; it is there so raising `MAX_ATTEMPTS` cannot make someone wait minutes.',
        'The wait is passed into `next()` as a function, so tests can retry instantly. *Nothing in the app passes it*; the default waits for real.',
        'The `src/lib` to `src/net` move is mechanical. Only `http.ts` itself has a real edit, the one-line `keepalive`.',
        'The old `retryOnce` helper is deleted rather than kept alongside, because nothing imported it after the queue change.',
      ],
    },
  },
  sections: [
    {
      title: 'Why: the retry rules',
      intro:
        'Start with the doc. It says what the user should see, in plain words, and every file after it has to match that promise.',
      files: [
        {
          path: 'docs/uploads.md',
          summary:
            'The uploads doc now promises three tries with a growing wait, and a countdown on the progress bar.',
          context: [
            'This is the page support links people to when an upload goes wrong, so it describes behaviour rather than code.',
            'It is also the one place the retry rule is written down in words. The numbers in `backoff.ts` should agree with it.',
          ],
          changed:
            'The **Failures** section used to say an error appears straight away. It now gives the three tries, the one, two and four second waits, and the countdown, so a reader knows how long to wait before giving up.',
          hunks: [
            {
              title: 'Failures',
              text: [
                'Replaces *"shows an error straight away"* with the retry rule and the waits between tries.',
                'Mentions the countdown so support can tell someone what they should be seeing while it waits.',
              ],
            },
          ],
        },
      ],
    },
    {
      title: 'The retry itself',
      intro:
        'Read the helper first: it is the whole rule in twenty lines. The queue only calls it, and the old one-off helper goes once the queue no longer needs it.',
      files: [
        {
          path: 'src/uploads/backoff.ts',
          summary:
            'New helper that says how many tries an upload gets and how long to wait before each one.',
          context: [
            'Pure functions and constants with no imports, so the queue, its tests and any future caller share one rule and cannot drift apart.',
            'Nothing outside `src/uploads` imports it today.',
          ],
          changed:
            'Adds `MAX_ATTEMPTS` and `retryDelay`. The wait starts at one second and doubles with each try, capped at ten seconds so a larger limit later can never leave someone staring at a frozen bar.',
          hunks: [
            {
              parts: [
                {
                  at: '1-8',
                  title: 'Limits',
                  text: 'Three tries, a one-second first wait and a ten-second cap, each named so the numbers in the doc can be checked against them at a glance.',
                },
                {
                  at: '10-18',
                  title: 'Wait for a try',
                  text: [
                    'Doubles the first wait once for each try already made: one, two, then four seconds.',
                    'The `Math.min` is the cap. With three tries it never bites, but it keeps the wait sane if `MAX_ATTEMPTS` is raised.',
                  ],
                },
              ],
            },
          ],
          tests: [
            {
              path: 'src/uploads/__tests__/backoff.test.ts',
              note: 'Covers the doubling, the ten-second cap and the three-try limit.',
            },
          ],
        },
        {
          path: 'src/uploads/queue.ts',
          summary:
            'The queue now retries a failed upload, with a growing wait, before it throws.',
          context: [
            '`UploadQueue` holds the files waiting to be sent and sends them one at a time, in the order they were added.',
            'The upload page calls `next()` in a loop until the queue is empty, and shows whatever `next()` throws as the error under the file.',
            'The progress bar reads the queue through the `useUploads` hook, which is why the new `pending` list matters.',
          ],
          changed: [
            'A failed upload is now tried again after a wait from `retryDelay`, and only the third failure reaches the caller. The error it throws is unchanged, so the page needs no change to show it.',
            'The wait is a function passed into `next()`, defaulting to a real timer. Tests pass one that returns at once, so they retry instantly instead of sleeping for seven seconds.',
          ],
          hunks: [
            {
              title: 'Import the backoff',
              text: 'Brings in the wait rule and the try limit from the new helper.',
            },
            {
              title: 'Retry loop',
              text: [
                'Each failure adds one to the item’s `attempts` and waits before the next try. The loop only ends by returning the upload’s result or by throwing.',
                'The third failure throws the **same** error as before, with the original failure as its `cause`, so callers and error reporting need no change.',
                'The item stays out of the queue while it waits, so a second call to `next()` moves on to the following file rather than retrying this one twice.',
              ],
            },
            {
              title: 'Pending files',
              text: 'Lists the files still waiting, by name, including one between retries, so the progress bar can say what is left.',
            },
          ],
          tests: [
            {
              path: 'src/uploads/__tests__/queue.test.ts',
              note: 'Adds a retry that succeeds on the second try and one that runs out of tries.',
            },
          ],
        },
        {
          path: 'src/uploads/legacyRetry.ts',
          summary: 'Deleted: the one-off retry helper the queue replaces.',
          context:
            'It retried a promise once after a second, and was marked `@deprecated` when it was written as a stopgap.',
          changed:
            'Nothing imported it once the queue retried on its own, so it goes rather than lingering as a second, weaker rule.',
          hunks: [
            {
              parts: [
                {
                  at: '1-5',
                  title: 'The deprecation',
                  text: 'Its own doc comment already said the queue would replace it.',
                },
                {
                  at: '6-13',
                  title: 'Retry once',
                  text: 'One retry after a fixed second, with no limit on what it wrapped. The queue’s rule covers this and more.',
                },
              ],
            },
          ],
        },
      ],
    },
    {
      title: 'What the user sees',
      intro:
        'The progress bar is the only screen that changes. The file types list is long, but it is data, not logic.',
      files: [
        {
          path: 'src/ui/UploadProgress.tsx',
          summary:
            'The progress bar shows a countdown while an upload waits to retry.',
          context: [
            'The bar under the file list on the Files page, shown only while an upload is running.',
            'It reads everything it shows from the `useUploads` hook and keeps no state of its own.',
          ],
          changed:
            'Reads `retryIn`, the seconds until the next try, and shows **retrying in 2s** beside the bar while it counts down. Between retries the bar keeps its last percentage rather than dropping to zero.',
          hunks: [
            {
              title: 'Countdown',
              text: [
                'Takes `retryIn` from the hook alongside the file name and percentage.',
                'Shows the countdown only while it is set, so an upload that never fails looks exactly as before.',
              ],
            },
          ],
        },
        {
          path: 'src/uploads/mimeTypes.ts',
          summary:
            'New list of every file type an upload may have, by extension.',
          context: [
            'The upload button and the server both check a file’s type against this list before sending it.',
            'Long on purpose in the preview: its diff stops at **Show more** until asked, so that button can be checked.',
          ],
          changed:
            'Replaces the images-only check with three hundred types. They are generated, so there is nothing to read line by line; spot-check a few and move on.',
          hunks: [
            {
              parts: [
                {
                  at: '1-2',
                  title: 'The map',
                  text: 'Keyed by extension, without the dot, and valued by the MIME type the server expects.',
                },
                {
                  at: '3-150',
                  title: 'First half',
                  text: 'Generated entries, in the order the source list gave them.',
                },
                {
                  at: '151-303',
                  title: 'Second half',
                  text: 'More generated entries, and the closing brace.',
                },
              ],
            },
          ],
        },
      ],
    },
    {
      title: 'The moved http client',
      intro:
        'The move itself is mechanical; the pages that import it are in Skim. Only one line of the client changes.',
      files: [
        {
          path: 'src/net/http.ts',
          summary:
            'Moved from `src/lib` to `src/net`, and now keeps an upload alive if the page closes.',
          context: [
            'The one function that sends a file to `/api/upload`. Everything that uploads goes through it, including the queue.',
            '`src/net` is where the other network code already lives; `src/lib` was a leftover from before that folder existed.',
          ],
          changed:
            'Adds `keepalive: true` to the request, so closing the tab mid-upload no longer cancels it. Everything else is the same file at its new path.',
          hunks: [
            {
              title: 'Keep alive',
              text: [
                'Adds `keepalive`, so the browser finishes sending the request even after the page that started it has gone.',
                'Browsers cap a kept-alive request’s body at 64KB, so this helps small files most; larger ones still rely on the tab staying open.',
              ],
            },
          ],
        },
      ],
    },
  ],
  skim: {
    skim: [
      {
        label: 'Import paths after the `net/` move',
        note: 'Only the import line changes, from `lib/http` to `net/http`.',
        paths: ['src/app/page.tsx', 'src/app/settings/page.tsx'],
      },
      {
        label: 'README wording',
        note: 'Rewords the opening line; no instructions change.',
        paths: ['README.md'],
      },
    ],
  },
  ui: {
    uiReview: {
      intro:
        'Check the retry by cutting the network in the middle of an upload, then check the error still appears when the network stays down.',
      setup: [
        {
          text: 'Install dependencies, if you have not since the last pull.',
          cmd: 'npm install',
        },
        {
          text: 'Start the app against the local API, so uploads go to your own machine.',
          cmd: 'npm run dev',
        },
        {
          text: 'Open the Files page and keep the browser’s network panel open, so you can switch the connection off and on.',
        },
      ],
      scenarios: [
        {
          title: 'A dropped connection pauses the upload',
          where: 'Files → Upload',
          why: [
            'One network blip used to lose the upload, and the person had to start again.',
            'Now the upload waits, retries, and carries on from where it stopped.',
          ],
          files: ['src/uploads/queue.ts', 'src/ui/UploadProgress.tsx'],
          screen: ['Uploading report.pdf', '[#####.....] 50%  retrying in 2s'],
          steps: [
            {
              do: 'Start uploading a large file.',
              expect: 'The progress bar appears and starts filling.',
            },
            {
              do: 'Turn the network off in the network panel for five seconds.',
              expect:
                'The bar stops where it was and shows a countdown, **retrying in 1s** then **retrying in 2s**.',
            },
            {
              do: 'Turn the network back on.',
              expect:
                'The countdown goes, the upload carries on, and it finishes without an error.',
            },
          ],
        },
        {
          title: 'The error still appears when the network stays down',
          where: 'Files → Upload',
          why: 'Retrying must not hide a real failure. After three tries the person still needs to know.',
          files: ['src/uploads/queue.ts', 'src/uploads/backoff.ts'],
          steps: [
            {
              do: 'Start uploading a file, then turn the network off and leave it off.',
              expect:
                'The bar counts down three times, waiting a little longer each time.',
            },
            {
              do: 'Wait about ten seconds.',
              expect:
                'The upload shows the usual *"failed to upload"* error under the file.',
            },
          ],
        },
        {
          title: 'Any file type goes through',
          where: 'Files → Upload',
          why: 'Only images were accepted before. People sending PDFs and spreadsheets were turned away.',
          files: ['src/uploads/mimeTypes.ts'],
          steps: [
            {
              do: 'Upload a PDF, then a `.xlsx` spreadsheet.',
              expect: 'Both upload and appear in the file list.',
            },
            {
              do: 'Upload a file with a made-up extension, such as `notes.zzz`.',
              expect: 'It is refused with the same message as before.',
            },
          ],
        },
      ],
      notPreviewable: [
        {
          title: 'Third failure on a real network',
          why: 'Needs the connection down for over ten seconds at the right moment; the queue test covers it.',
        },
        {
          title: 'Closing the tab mid-upload',
          why: 'The local server finishes small uploads before you can close the tab. It needs a slow connection to see.',
        },
      ],
    },
  },
};
