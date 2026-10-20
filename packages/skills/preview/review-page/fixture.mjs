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
];

/** A made-up PR, so the page shows its link and the comment export carries it. */
export const pr = {
  number: 123,
  title: 'Retry failed uploads before showing an error',
  url: 'https://github.com/example/uploads-demo/pull/123',
};

/**
 * The notes, as the agent would write them. A file's `hunks` are matched to
 * its diff by position; the preview fills in any that are missing.
 */
export const notes = {
  overview: {
    title: pr.title,
    overview: {
      summary:
        'Uploads that fail on a dropped connection now retry three times with a growing wait before the user sees an error. Until now one network blip lost the upload. The http client also moves to `src/net`, which is why two pages change their imports.',
      userChanges: [
        'A brief connection drop no longer fails an upload; the progress bar pauses and shows a countdown.',
        'Every known file type can be uploaded, not just images.',
      ],
      holdInMind: [
        'Retries happen in the upload queue, not the http client, so other requests are unaffected.',
        'The wait doubles from one second and never passes ten.',
      ],
    },
  },
  sections: [
    {
      title: 'Why: the retry rules',
      intro:
        'The docs say what the user should see, which the code then has to match.',
      files: [
        {
          path: 'docs/uploads.md',
          summary:
            'The uploads doc now describes three tries and the countdown.',
          hunks: [
            {
              title: 'Failures',
              text: 'Replaces "shows an error straight away" with the retry rule.',
            },
          ],
        },
      ],
    },
    {
      title: 'The retry itself',
      intro: 'Read the helper first; the queue only calls it.',
      files: [
        {
          path: 'src/uploads/backoff.ts',
          summary: 'New helper that works out each retry’s wait.',
          context:
            'Pure functions with no imports, so the queue and its tests share one rule.',
          hunks: [
            {
              parts: [
                {
                  at: '1-8',
                  title: 'Limits',
                  text: 'Three tries, a one-second first wait, and a ten-second cap.',
                },
                {
                  at: '10-18',
                  title: 'Wait for a try',
                  text: 'Doubles the first wait for each try so far, up to the cap.',
                },
              ],
            },
          ],
          tests: [
            {
              path: 'src/uploads/__tests__/backoff.test.ts',
              note: 'Covers the doubling and the cap.',
            },
          ],
        },
        {
          path: 'src/uploads/queue.ts',
          summary: 'The queue now retries a failed upload before it throws.',
          context: [
            '`UploadQueue` holds files waiting to be sent and sends them one at a time.',
            'The upload page calls `next()` in a loop until the queue is empty.',
          ],
          changed:
            'A failed upload is tried again after a wait from `retryDelay`, and only the third failure reaches the caller. The wait is injected so tests do not sleep.',
          hunks: [
            {
              title: 'Import the backoff',
              text: 'Brings in the wait rule and the try limit.',
            },
            {
              title: 'Retry loop',
              text: [
                'Each failure counts a try and waits before the next.',
                'The third failure throws the same error as before, so callers need no change.',
              ],
            },
            {
              title: 'Pending files',
              text: 'Lists files still waiting, including one between retries, for the progress bar.',
            },
          ],
          tests: [
            {
              path: 'src/uploads/__tests__/queue.test.ts',
              note: 'Adds a retry that succeeds and one that runs out of tries.',
            },
          ],
        },
        {
          path: 'src/uploads/legacyRetry.ts',
          summary: 'Deleted: the one-off retry helper the queue replaces.',
          hunks: [
            {
              parts: [
                {
                  at: '1-13',
                  title: 'Retry once',
                  text: 'Nothing imported it any more.',
                },
              ],
            },
          ],
        },
      ],
    },
    {
      title: 'What the user sees',
      files: [
        {
          path: 'src/ui/UploadProgress.tsx',
          summary:
            'The progress bar shows a countdown while an upload waits to retry.',
          hunks: [
            {
              title: 'Countdown',
              text: 'Reads `retryIn` from the uploads hook and shows it beside the bar.',
            },
          ],
        },
        {
          path: 'src/uploads/mimeTypes.ts',
          summary: 'New list of every file type an upload may have.',
          context:
            'Long on purpose: its diff stops at **Show more** until asked.',
          hunks: [
            {
              parts: [
                {
                  at: '1-2',
                  title: 'The map',
                  text: 'Keyed by extension, valued by MIME type.',
                },
                {
                  at: '3-150',
                  title: 'First half',
                  text: 'Generated entries.',
                },
                {
                  at: '151-303',
                  title: 'Second half',
                  text: 'More generated entries.',
                },
              ],
            },
          ],
        },
      ],
    },
    {
      title: 'The moved http client',
      files: [
        {
          path: 'src/net/http.ts',
          summary:
            'Moved from `src/lib`, and keeps an upload alive if the page closes.',
          hunks: [
            {
              title: 'Keep alive',
              text: 'Adds `keepalive`, so closing the tab mid-upload does not cancel it.',
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
        note: 'Only the import line changes.',
        paths: ['src/app/page.tsx', 'src/app/settings/page.tsx'],
      },
    ],
  },
  ui: {
    uiReview: {
      intro: 'Check the retry by cutting the network mid-upload.',
      setup: [
        { text: 'Start the app against the local API.', cmd: 'npm run dev' },
      ],
      scenarios: [
        {
          title: 'A dropped connection pauses the upload',
          where: 'Files → Upload',
          why: 'One network blip used to lose the upload.',
          files: ['src/uploads/queue.ts', 'src/ui/UploadProgress.tsx'],
          screen: ['Uploading report.pdf', '[#####.....] 50%  retrying in 2s'],
          steps: [
            {
              do: 'Start uploading a large file, then turn the network off for five seconds.',
              expect: 'The bar pauses and shows a retry countdown.',
            },
            {
              do: 'Turn the network back on.',
              expect: 'The upload carries on and finishes.',
            },
          ],
        },
      ],
      notPreviewable: [
        {
          title: 'Third failure',
          why: 'Needs the network down for over thirty seconds; the queue test covers it.',
        },
      ],
    },
  },
};
